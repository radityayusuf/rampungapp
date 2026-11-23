<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Models\Workspace;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password;

class AuthController extends Controller
{
    /** Menit sebelum tautan reset kata sandi kedaluwarsa. */
    public const RESET_MINUTES = 60;

    private function passwordRule(): array
    {
        return ['required', 'string', 'max:200', Password::min(8)->letters()->numbers()];
    }

    private const PASSWORD_MESSAGES = [
        'password.min' => 'Kata sandi minimal 8 karakter.',
        'password.letters' => 'Kata sandi harus mengandung huruf.',
        'password.numbers' => 'Kata sandi harus mengandung angka.',
    ];

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'email' => ['required', 'email', 'max:190', 'unique:users,email'],
            'password' => $this->passwordRule(),
            'invite' => ['nullable', 'string', 'max:40'],
        ], ['email.unique' => 'Email ini sudah terdaftar.'] + self::PASSWORD_MESSAGES);

        $invite = null;
        if (! empty($data['invite'])) {
            $invite = DB::table('invites')->where('token', $data['invite'])->whereNull('accepted_at')->first();
            if (! $invite) {
                return response()->json(['message' => 'Undangan tidak valid atau sudah dipakai.'], 422);
            }
            if (strcasecmp($invite->email, $data['email']) !== 0) {
                return response()->json(['message' => 'Undangan ini untuk email '.$invite->email.'.'], 422);
            }
        }

        $user = DB::transaction(function () use ($data, $invite) {
            $user = User::create(['name' => $data['name'], 'email' => $data['email'], 'password' => $data['password']]);

            if ($invite) {
                $user->workspace_id = $invite->workspace_id;
                $user->role = $invite->role;
                $user->save();
                DB::table('invites')->where('id', $invite->id)->update(['accepted_at' => now(), 'updated_at' => now()]);

                return $user;
            }

            $ws = Workspace::create(['name' => 'Workspace '.$data['name']]);
            $user->workspace_id = $ws->id;
            $user->role = 'owner';
            $user->save();
            $ws->owner_id = $user->id;
            $ws->save();

            return $user;
        });

        return $this->issue($user, 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'password' => ['required', 'string'],
        ]);

        // Batas per akun (selain batas per IP di rute): 5 percobaan salah per menit.
        $key = 'login:'.Str::lower($data['email']);
        if (RateLimiter::tooManyAttempts($key, 5)) {
            return response()->json(['message' => 'Terlalu banyak percobaan masuk. Coba lagi dalam '.RateLimiter::availableIn($key).' detik.'], 429);
        }

        $user = User::where('email', $data['email'])->first();
        if (! $user || ! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 60);

            return response()->json(['message' => 'Email atau kata sandi salah.'], 422);
        }

        RateLimiter::clear($key);

        return $this->issue($user);
    }

    /** Selalu menjawab sama, agar tidak membocorkan email mana yang terdaftar. */
    public function forgot(Request $request): JsonResponse
    {
        $data = $request->validate(['email' => ['required', 'email']]);
        $user = User::where('email', $data['email'])->first();

        if ($user) {
            $plain = Str::random(48);
            DB::table('password_reset_tokens')->updateOrInsert(
                ['email' => $user->email],
                ['token' => hash('sha256', $plain), 'created_at' => now()],
            );
            $link = rtrim(config('app.frontend_url'), '/').'/#/reset/'.$plain.'/'.rawurlencode($user->email);
            Mail::raw(
                "Halo {$user->name},\n\nKami menerima permintaan untuk mengatur ulang kata sandi akun Rampung Anda.\n\n"
                .'Buka tautan berikut (berlaku '.self::RESET_MINUTES." menit):\n{$link}\n\n"
                ."Abaikan email ini jika Anda tidak memintanya.\n\nSalam,\nTim Rampung",
                fn ($m) => $m->to($user->email)->subject('Atur ulang kata sandi Rampung'),
            );
        }

        return response()->json(['message' => 'Jika email terdaftar, tautan atur ulang sudah dikirim.']);
    }

    public function reset(Request $request): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'email'],
            'token' => ['required', 'string', 'max:100'],
            'password' => $this->passwordRule(),
        ], self::PASSWORD_MESSAGES);

        $row = DB::table('password_reset_tokens')->where('email', $data['email'])->first();
        $valid = $row
            && hash_equals($row->token, hash('sha256', $data['token']))
            && strtotime($row->created_at) >= now()->subMinutes(self::RESET_MINUTES)->getTimestamp();

        if (! $valid) {
            return response()->json(['message' => 'Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru.'], 422);
        }

        $user = User::where('email', $data['email'])->firstOrFail();
        DB::transaction(function () use ($user, $data) {
            $user->password = $data['password'];
            $user->save();
            DB::table('password_reset_tokens')->where('email', $user->email)->delete();
            // Keluarkan semua perangkat; token API pribadi tetap.
            DB::table('api_tokens')->where('user_id', $user->id)->whereNull('name')->delete();
        });
        RateLimiter::clear('login:'.Str::lower($user->email));

        return $this->issue($user);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->present($request->user())]);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:100']]);
        $user = $request->user();
        $user->name = $data['name'];
        $user->save();

        return response()->json(['user' => $this->present($user)]);
    }

    public function logout(Request $request): JsonResponse
    {
        DB::table('api_tokens')->where('token_hash', $request->attributes->get('token_hash'))->delete();

        return response()->json(['ok' => true]);
    }

    private function issue(User $user, int $status = 200): JsonResponse
    {
        $plain = Str::random(60);
        DB::table('api_tokens')->insert(['user_id' => $user->id, 'token_hash' => hash('sha256', $plain), 'created_at' => now(), 'updated_at' => now(), 'last_used_at' => now()]);

        return response()->json(['token' => $plain, 'user' => $this->present($user)], $status);
    }

    private function present(User $u): array
    {
        return [
            'id' => $u->id, 'name' => $u->name, 'email' => $u->email, 'role' => $u->role,
            'workspace_id' => $u->workspace_id,
            'workspace_name' => DB::table('workspaces')->where('id', $u->workspace_id)->value('name'),
        ];
    }
}
