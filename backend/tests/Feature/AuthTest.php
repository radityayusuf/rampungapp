<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_creates_owner_and_workspace(): void
    {
        [$token, $user] = $this->signUp('Sari', 'sari@test.id');

        $this->assertNotEmpty($token);
        $this->assertSame('owner', $user['role']);
        $this->assertSame('Workspace Sari', $user['workspace_name']);
        // Hanya hash token yang tersimpan.
        $this->assertDatabaseHas('api_tokens', ['token_hash' => hash('sha256', $token)]);
        $this->assertDatabaseMissing('api_tokens', ['token_hash' => $token]);
    }

    public function test_register_validates_email_and_password_strength(): void
    {
        $this->signUp('Sari', 'sari@test.id');

        $this->postJson('/api/auth/register', ['name' => 'X', 'email' => 'sari@test.id', 'password' => self::PASSWORD])
            ->assertStatus(422)->assertJsonPath('message', 'Email ini sudah terdaftar.');
        $this->postJson('/api/auth/register', ['name' => 'X', 'email' => 'x@test.id', 'password' => 'pendek1'])->assertStatus(422);
        $this->postJson('/api/auth/register', ['name' => 'X', 'email' => 'x@test.id', 'password' => 'hanyahurufsaja'])->assertStatus(422);
        $this->postJson('/api/auth/register', ['name' => 'X', 'email' => 'x@test.id', 'password' => '1234567890'])->assertStatus(422);
    }

    public function test_login_and_wrong_password(): void
    {
        $this->signUp('Sari', 'sari@test.id');

        $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => self::PASSWORD])->assertOk()->assertJsonStructure(['token', 'user']);
        $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => 'salah123'])->assertStatus(422);
    }

    public function test_login_is_throttled_per_account(): void
    {
        $this->signUp('Sari', 'sari@test.id');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => 'salah123'])->assertStatus(422);
        }
        $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => self::PASSWORD])->assertStatus(429);
    }

    public function test_each_device_gets_its_own_token_and_logout_revokes_only_one(): void
    {
        [$a] = $this->signUp('Sari', 'sari@test.id');
        $b = $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => self::PASSWORD])->json('token');

        $this->as($a)->postJson('/api/auth/logout')->assertOk();
        $this->app['auth']->forgetGuards();
        $this->as($a)->getJson('/api/auth/me')->assertStatus(401);
        $this->as($b)->getJson('/api/auth/me')->assertOk();
    }

    public function test_idle_device_token_expires(): void
    {
        [$token] = $this->signUp();
        DB::table('api_tokens')->update(['last_used_at' => now()->subDays(31), 'created_at' => now()->subDays(40)]);

        $this->as($token)->getJson('/api/auth/me')->assertStatus(401);
        $this->assertDatabaseCount('api_tokens', 0);
    }

    public function test_password_reset_flow(): void
    {
        Mail::fake();
        [$old] = $this->signUp('Sari', 'sari@test.id');

        // Jawaban sama untuk email yang tidak terdaftar (tidak membocorkan akun).
        $this->postJson('/api/auth/forgot', ['email' => 'tidakada@test.id'])->assertOk();
        $this->postJson('/api/auth/forgot', ['email' => 'sari@test.id'])->assertOk();

        $row = DB::table('password_reset_tokens')->where('email', 'sari@test.id')->first();
        $this->assertNotNull($row);

        // Token salah ditolak.
        $this->postJson('/api/auth/reset', ['email' => 'sari@test.id', 'token' => 'salah', 'password' => 'baruSekali9'])->assertStatus(422);

        // Pakai token asli: buat ulang karena yang tersimpan hanya hash.
        $plain = 'tokenujicoba1234567890';
        DB::table('password_reset_tokens')->where('email', 'sari@test.id')->update(['token' => hash('sha256', $plain)]);
        $this->postJson('/api/auth/reset', ['email' => 'sari@test.id', 'token' => $plain, 'password' => 'baruSekali9'])->assertOk()->assertJsonStructure(['token']);

        $this->app['auth']->forgetGuards();
        $this->as($old)->getJson('/api/auth/me')->assertStatus(401); // sesi lama dicabut
        $this->postJson('/api/auth/login', ['email' => 'sari@test.id', 'password' => 'baruSekali9'])->assertOk();
        $this->assertDatabaseMissing('password_reset_tokens', ['email' => 'sari@test.id']);
    }

    public function test_reset_link_expires(): void
    {
        $this->signUp('Sari', 'sari@test.id');
        DB::table('password_reset_tokens')->insert(['email' => 'sari@test.id', 'token' => hash('sha256', 'lama'), 'created_at' => now()->subMinutes(61)]);

        $this->postJson('/api/auth/reset', ['email' => 'sari@test.id', 'token' => 'lama', 'password' => 'baruSekali9'])->assertStatus(422);
    }

    public function test_profile_name_update_and_security_headers(): void
    {
        [$token] = $this->signUp();

        $this->as($token)->patchJson('/api/auth/me', ['name' => 'Nama Baru'])
            ->assertOk()->assertJsonPath('user.name', 'Nama Baru')
            ->assertHeader('X-Content-Type-Options', 'nosniff')
            ->assertHeader('Cache-Control', 'no-store, private');
    }
}
