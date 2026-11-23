<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SyncTest extends TestCase
{
    use RefreshDatabase;

    private function task(string $id, string $title = 'Tugas'): array
    {
        return ['c' => 'tasks', 'id' => $id, 'data' => ['id' => $id, 'title' => $title, 'projectId' => 'p1']];
    }

    public function test_push_pull_update_delete_and_rev(): void
    {
        [$t] = $this->signUp();

        $this->as($t)->getJson('/api/sync')->assertOk()->assertJson(['empty' => true, 'rev' => 0]);
        $this->push($t, [$this->task('t1', 'Halo Ä 日本')])->assertOk()->assertJson(['rev' => 1, 'prev' => 0]);
        $this->push($t, [$this->task('t1', 'Diubah')])->assertOk()->assertJson(['rev' => 2, 'prev' => 1]);

        $pull = $this->as($t)->getJson('/api/sync')->assertOk();
        $this->assertSame(2, $pull->json('rev'));
        $this->assertSame([['id' => 't1', 'title' => 'Diubah', 'projectId' => 'p1']], $pull->json('collections.tasks'));

        $this->push($t, [['c' => 'tasks', 'id' => 't1', 'data' => null]])->assertOk();
        $this->assertSame([], $this->as($t)->getJson('/api/sync')->json('collections.tasks'));
        $this->as($t)->getJson('/api/sync/rev')->assertJson(['rev' => 3]);
    }

    public function test_workspaces_are_isolated(): void
    {
        [$a] = $this->signUp('A');
        [$b] = $this->signUp('B');
        $this->app['auth']->forgetGuards();

        $this->push($a, [$this->task('rahasia')])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->as($b)->getJson('/api/sync')->assertJson(['empty' => true]);

        // B menulis id yang sama: tidak menimpa milik A.
        $this->push($b, [$this->task('rahasia', 'Milik B')])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->assertSame('Tugas', $this->as($a)->getJson('/api/sync')->json('collections.tasks.0.title'));
    }

    public function test_validation_rejects_unknown_collection_and_oversized_ids(): void
    {
        [$t] = $this->signUp();

        $this->push($t, [['c' => 'users', 'id' => '1', 'data' => []]])->assertStatus(422);
        $this->push($t, [['c' => 'tasks', 'id' => str_repeat('x', 101), 'data' => []]])->assertStatus(422);
        $this->as($t)->postJson('/api/sync', [])->assertStatus(422);
        $this->flushHeaders();
        $this->getJson('/api/sync')->assertStatus(401);
    }

    public function test_member_cannot_write_admin_only_collections(): void
    {
        [, , $member] = $this->team();

        foreach (['workspace', 'automations', 'invoices', 'expenses', 'clients', 'deals'] as $c) {
            $this->push($member, [['c' => $c, 'id' => 'x', 'data' => ['id' => 'x']]])->assertForbidden();
        }
        // Penolakan bersifat atomik: perubahan sah dalam push yang sama ikut ditolak.
        $this->push($member, [$this->task('t-ok'), ['c' => 'invoices', 'id' => 'i', 'data' => ['id' => 'i']]])->assertForbidden();
        $this->assertDatabaseMissing('records', ['rid' => 't-ok']);
    }

    public function test_member_can_work_on_tasks_and_own_records_only(): void
    {
        [$owner, , $member, $m] = $this->team();
        $me = 'u'.$m['id'];

        $this->push($member, [$this->task('t1')])->assertOk();
        $this->push($member, [['c' => 'members', 'id' => $me, 'data' => ['id' => $me, 'name' => 'Saya']]])->assertOk();
        $this->push($member, [['c' => 'members', 'id' => 'u999', 'data' => ['id' => 'u999']]])->assertForbidden();

        $this->push($member, [['c' => 'timeEntries', 'id' => 'te1', 'data' => ['id' => 'te1', 'userId' => $me]]])->assertOk();
        $this->push($member, [['c' => 'timeEntries', 'id' => 'te2', 'data' => ['id' => 'te2', 'userId' => 'u999']]])->assertForbidden();

        $this->push($member, [['c' => 'leaves', 'id' => 'l1', 'data' => ['id' => 'l1', 'userId' => $me, 'status' => 'pending']]])->assertOk();
        $this->push($member, [['c' => 'leaves', 'id' => 'l1', 'data' => ['id' => 'l1', 'userId' => $me, 'status' => 'approved']]])->assertForbidden();

        // Catatan milik orang lain tidak boleh dihapus anggota.
        $this->app['auth']->forgetGuards();
        $this->push($owner, [['c' => 'attendances', 'id' => 'a1', 'data' => ['id' => 'a1', 'userId' => 'u1']]])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->push($member, [['c' => 'attendances', 'id' => 'a1', 'data' => null]])->assertForbidden();
    }

    public function test_admin_can_write_everything(): void
    {
        [, , $admin] = $this->team('admin');

        $this->push($admin, [['c' => 'invoices', 'id' => 'i', 'data' => ['id' => 'i']], ['c' => 'workspace', 'id' => 'w', 'data' => ['id' => 'w']]])->assertOk();
    }
}
