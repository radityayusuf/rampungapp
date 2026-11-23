<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Testing\TestResponse;

abstract class TestCase extends BaseTestCase
{
    protected const PASSWORD = 'rahasia123';

    /** Daftarkan akun dan kembalikan [token, user]. */
    protected function signUp(string $name = 'Sari', ?string $email = null, ?string $invite = null): array
    {
        $res = $this->postJson('/api/auth/register', [
            'name' => $name,
            'email' => $email ?? strtolower(preg_replace('/[^A-Za-z0-9]/', '', $name)).uniqid().'@test.id',
            'password' => self::PASSWORD,
            'invite' => $invite,
        ])->assertCreated();

        return [$res->json('token'), $res->json('user')];
    }

    protected function as(string $token): static
    {
        return $this->withHeader('Authorization', 'Bearer '.$token);
    }

    protected function push(string $token, array $changes): TestResponse
    {
        return $this->as($token)->postJson('/api/sync', ['changes' => $changes]);
    }

    protected function invite(string $ownerToken, string $email, string $role = 'member'): string
    {
        return $this->as($ownerToken)->postJson('/api/invites', ['email' => $email, 'role' => $role])->assertCreated()->json('token');
    }

    /** Pemilik + anggota yang sudah bergabung ke workspace yang sama. */
    protected function team(string $memberRole = 'member'): array
    {
        [$owner, $ownerUser] = $this->signUp('Pemilik');
        $email = 'anggota'.uniqid().'@test.id';
        $inv = $this->invite($owner, $email, $memberRole);
        $this->app['auth']->forgetGuards();
        [$member, $memberUser] = $this->signUp('Anggota', $email, $inv);

        return [$owner, $ownerUser, $member, $memberUser];
    }
}
