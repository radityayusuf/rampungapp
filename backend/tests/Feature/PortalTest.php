<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PortalTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'abcDEF1234567890abcdWXYZ';

    private function seedProject(string $token, bool $enabled): void
    {
        [$owner] = $this->signUp();
        $this->push($owner, [
            ['c' => 'projects', 'id' => 'p1', 'data' => ['id' => 'p1', 'name' => 'Website Klien', 'clientPortalEnabled' => $enabled, 'portalToken' => $token, 'clientId' => 'c1', 'budget' => 99000000]],
            ['c' => 'clients', 'id' => 'c1', 'data' => ['id' => 'c1', 'company' => 'PT Klien']],
            ['c' => 'members', 'id' => 'u1', 'data' => ['id' => 'u1', 'name' => 'Sari']],
            ['c' => 'tasks', 'id' => 't1', 'data' => ['id' => 't1', 'projectId' => 'p1', 'title' => 'Desain', 'status' => 'done', 'assigneeId' => 'u1', 'description' => 'catatan internal', 'subtasks' => [['completed' => true], ['completed' => false]]]],
            ['c' => 'tasks', 'id' => 't2', 'data' => ['id' => 't2', 'projectId' => 'lain', 'title' => 'Proyek lain']],
        ])->assertOk();
        $this->app['auth']->forgetGuards();
    }

    public function test_portal_shows_only_summary_of_enabled_project(): void
    {
        $this->seedProject(self::TOKEN, true);

        $res = $this->getJson('/api/portal/'.self::TOKEN)->assertOk()
            ->assertJsonPath('project.name', 'Website Klien')
            ->assertJsonPath('client', 'PT Klien')
            ->assertJsonCount(1, 'tasks')
            ->assertJsonPath('tasks.0.assignee', 'Sari')
            ->assertJsonPath('tasks.0.subtasksDone', 1);

        // Data internal tidak ikut terbuka.
        $body = $res->getContent();
        $this->assertStringNotContainsString('catatan internal', $body);
        $this->assertStringNotContainsString('99000000', $body);
        $this->assertStringNotContainsString('Proyek lain', $body);
    }

    public function test_disabled_or_unknown_portal_is_not_found(): void
    {
        $this->seedProject(self::TOKEN, false);

        $this->getJson('/api/portal/'.self::TOKEN)->assertNotFound();
        $this->getJson('/api/portal/zzzzzzzzzzzzzzzzzzzzzzzz')->assertNotFound();
        $this->getJson('/api/portal/pendek')->assertNotFound();
        $this->getJson('/api/portal/'.urlencode('%"portalToken"%'))->assertNotFound();
    }
}
