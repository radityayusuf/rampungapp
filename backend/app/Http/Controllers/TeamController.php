<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;

/** Anggota, undangan, dan token API pribadi. Selalu dibatasi ke workspace pengguna yang login. */
class TeamController extends Controller
{
    private function isAdmin(Request $r): bool
    {
        return in_array($r->user()->role, ['owner', 'admin'], true);
    }

    private function deny(): JsonResponse
    {
        return response()->json(['message' => 'Hanya pemilik atau admin yang boleh melakukan ini.'], 403);
    }

    public function members(Request $request): JsonResponse
    {
        $rows = User::where('workspace_id', $request->user()->workspace_id)->orderBy('id')->get(['id', 'name', 'email', 'role']);

        return response()->json(['members' => $rows]);
    }

    public function updateMember(Request $request, int $id): JsonResponse
    {
        if ($request->user()->role !== 'owner') {
            return response()->json(['message' => 'Hanya pemilik yang boleh mengubah peran.'], 403);
        }
        $data = $request->validate(['role' => ['required', 'in:admin,member']]);
        $m = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);
        if ($m->role === 'owner') {
            return response()->json(['message' => 'Peran pemilik tidak bisa diubah.'], 422);
        }
        $m->role = $data['role'];
        $m->save();

        return response()->json(['ok' => true]);
    }

    public function removeMember(Request $request, int $id): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return $this->deny();
        }
        $m = User::where('workspace_id', $request->user()->workspace_id)->findOrFail($id);
        if ($m->role === 'owner' || $m->id === $request->user()->id) {
            return response()->json(['message' => 'Pemilik atau diri sendiri tidak bisa dikeluarkan.'], 422);
        }
        DB::transaction(function () use ($m) {
            DB::table('api_tokens')->where('user_id', $m->id)->delete();
            // Beri workspace pribadi agar akun tetap bisa masuk dan tidak melihat data lama.
            $ws = DB::table('workspaces')->insertGetId(['name' => 'Workspace '.$m->name, 'owner_id' => $m->id, 'created_at' => now(), 'updated_at' => now()]);
            $m->workspace_id = $ws;
            $m->role = 'owner';
            $m->save();
        });

        return response()->json(['ok' => true]);
    }

    // ---------- Undangan ----------
    public function invites(Request $request): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return $this->deny();
        }
        $rows = DB::table('invites')->where('workspace_id', $request->user()->workspace_id)->whereNull('accepted_at')->orderByDesc('id')->get(['id', 'email', 'role', 'token', 'created_at']);

        return response()->json(['invites' => $rows]);
    }

    public function invite(Request $request): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return $this->deny();
        }
        $data = $request->validate([
            'email' => ['required', 'email', 'max:190'],
            'role' => ['required', 'in:admin,member'],
        ]);
        if (User::where('email', $data['email'])->exists()) {
            return response()->json(['message' => 'Email ini sudah punya akun Rampung.'], 422);
        }
        $ws = $request->user()->workspace_id;
        DB::table('invites')->where('workspace_id', $ws)->where('email', $data['email'])->whereNull('accepted_at')->delete();
        $token = Str::random(32);
        DB::table('invites')->insert([
            'workspace_id' => $ws, 'email' => $data['email'], 'role' => $data['role'], 'token' => $token,
            'invited_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $wsName = DB::table('workspaces')->where('id', $ws)->value('name');
        $link = rtrim(config('app.frontend_url'), '/').'/#/gabung/'.$token;
        $inviter = $request->user()->name;
        $emailed = true;
        try {
            Mail::raw(
                "Halo,

{$inviter} mengundang Anda bergabung ke workspace \"{$wsName}\" di Rampung.

"
                ."Buat akun lewat tautan berikut (khusus untuk {$data['email']}):
{$link}

Salam,
Tim Rampung",
                fn ($m) => $m->to($data['email'])->subject("Undangan bergabung ke {$wsName} di Rampung"),
            );
        } catch (\Throwable $e) {
            report($e);
            $emailed = false; // tautan tetap bisa dibagikan manual
        }

        return response()->json(['token' => $token, 'email' => $data['email'], 'role' => $data['role'], 'emailed' => $emailed], 201);
    }

    public function revokeInvite(Request $request, int $id): JsonResponse
    {
        if (! $this->isAdmin($request)) {
            return $this->deny();
        }
        DB::table('invites')->where('workspace_id', $request->user()->workspace_id)->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }

    /** Publik: info undangan agar halaman gabung bisa menampilkan nama workspace dan email. */
    public function showInvite(string $token): JsonResponse
    {
        $inv = DB::table('invites')->where('token', $token)->whereNull('accepted_at')->first();
        if (! $inv) {
            return response()->json(['message' => 'Undangan tidak valid atau sudah dipakai.'], 404);
        }

        return response()->json([
            'email' => $inv->email, 'role' => $inv->role,
            'workspace_name' => DB::table('workspaces')->where('id', $inv->workspace_id)->value('name'),
        ]);
    }

    // ---------- Token API pribadi ----------
    public function tokens(Request $request): JsonResponse
    {
        $rows = DB::table('api_tokens')->where('user_id', $request->user()->id)->whereNotNull('name')->orderByDesc('id')->get(['id', 'name', 'created_at', 'last_used_at']);

        return response()->json(['tokens' => $rows]);
    }

    public function createToken(Request $request): JsonResponse
    {
        $data = $request->validate(['name' => ['required', 'string', 'max:60']]);
        if (DB::table('api_tokens')->where('user_id', $request->user()->id)->whereNotNull('name')->count() >= 10) {
            return response()->json(['message' => 'Maksimal 10 token API.'], 422);
        }
        $plain = 'rmp_'.Str::random(40);
        DB::table('api_tokens')->insert(['user_id' => $request->user()->id, 'name' => $data['name'], 'token_hash' => hash('sha256', $plain), 'created_at' => now(), 'updated_at' => now()]);

        return response()->json(['token' => $plain], 201);
    }

    public function deleteToken(Request $request, int $id): JsonResponse
    {
        DB::table('api_tokens')->where('user_id', $request->user()->id)->whereNotNull('name')->where('id', $id)->delete();

        return response()->json(['ok' => true]);
    }
}
