<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class TeamTest extends TestCase
{
    use RefreshDatabase;

    public function test_invite_flow_joins_owner_workspace_with_role(): void
    {
        [, $owner, , $member] = $this->team('admin');

        $this->assertSame($owner['workspace_id'], $member['workspace_id']);
        $this->assertSame('admin', $member['role']);
        $this->assertSame('Workspace Pemilik', $member['workspace_name']);
    }

    public function test_invite_is_emailed_and_public_info_available(): void
    {
        Mail::fake();
        [$owner] = $this->signUp('Pemilik');
        $res = $this->as($owner)->postJson('/api/invites', ['email' => 'baru@test.id', 'role' => 'member'])->assertCreated();

        $this->assertTrue($res->json('emailed'));
        $this->getJson('/api/invites/'.$res->json('token'))->assertOk()
            ->assertJson(['email' => 'baru@test.id', 'workspace_name' => 'Workspace Pemilik']);
        $this->getJson('/api/invites/tidakada')->assertNotFound();
    }

    public function test_invite_must_match_email_and_is_single_use(): void
    {
        [$owner] = $this->signUp('Pemilik');
        $inv = $this->invite($owner, 'tamu@test.id');
        $this->app['auth']->forgetGuards();

        $this->postJson('/api/auth/register', ['name' => 'X', 'email' => 'lain@test.id', 'password' => self::PASSWORD, 'invite' => $inv])
            ->assertStatus(422)->assertJsonPath('message', 'Undangan ini untuk email tamu@test.id.');
        $this->signUp('Tamu', 'tamu@test.id', $inv);
        $this->postJson('/api/auth/register', ['name' => 'Y', 'email' => 'y@test.id', 'password' => self::PASSWORD, 'invite' => $inv])->assertStatus(422);
    }

    public function test_cannot_invite_existing_account(): void
    {
        [$owner] = $this->signUp('Pemilik');
        $this->signUp('Ada', 'ada@test.id');
        $this->app['auth']->forgetGuards();

        $this->as($owner)->postJson('/api/invites', ['email' => 'ada@test.id', 'role' => 'member'])->assertStatus(422);
    }

    public function test_members_cannot_manage_team(): void
    {
        [$owner, $ownerUser, $member] = $this->team();

        $this->as($member)->postJson('/api/invites', ['email' => 'z@test.id', 'role' => 'member'])->assertForbidden();
        $this->as($member)->getJson('/api/invites')->assertForbidden();
        $this->as($member)->patchJson('/api/members/'.$ownerUser['id'], ['role' => 'member'])->assertForbidden();
        $this->as($member)->deleteJson('/api/members/'.$ownerUser['id'])->assertForbidden();
    }

    public function test_owner_changes_role_and_removes_member(): void
    {
        [$owner, , $member, $memberUser] = $this->team();

        $this->as($owner)->patchJson('/api/members/'.$memberUser['id'], ['role' => 'admin'])->assertOk();
        $this->assertDatabaseHas('users', ['id' => $memberUser['id'], 'role' => 'admin']);

        $this->as($owner)->deleteJson('/api/members/'.$memberUser['id'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->as($member)->getJson('/api/sync')->assertStatus(401); // semua sesi anggota dicabut
    }

    public function test_owner_cannot_be_removed_or_demoted(): void
    {
        [$owner, $ownerUser] = $this->signUp('Pemilik');

        $this->as($owner)->deleteJson('/api/members/'.$ownerUser['id'])->assertStatus(422);
        $this->as($owner)->patchJson('/api/members/'.$ownerUser['id'], ['role' => 'member'])->assertStatus(422);
    }

    public function test_members_list_is_scoped_to_workspace(): void
    {
        [$owner] = $this->team();
        $this->signUp('Orang Lain');
        $this->app['auth']->forgetGuards();

        $this->assertCount(2, $this->as($owner)->getJson('/api/members')->json('members'));
    }

    public function test_personal_api_tokens(): void
    {
        [$owner] = $this->signUp();
        $tk = $this->as($owner)->postJson('/api/tokens', ['name' => 'Skrip'])->assertCreated()->json('token');

        $this->assertStringStartsWith('rmp_', $tk);
        $this->app['auth']->forgetGuards();
        $this->as($tk)->getJson('/api/sync/rev')->assertOk();
        $list = $this->as($owner)->getJson('/api/tokens')->json('tokens');
        $this->assertCount(1, $list);

        $this->as($owner)->deleteJson('/api/tokens/'.$list[0]['id'])->assertOk();
        $this->app['auth']->forgetGuards();
        $this->as($tk)->getJson('/api/sync/rev')->assertStatus(401);
    }
}
