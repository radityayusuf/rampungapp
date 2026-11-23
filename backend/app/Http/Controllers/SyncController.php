<?php

namespace App\Http\Controllers;

use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Sinkronisasi data workspace. Workspace SELALU diambil dari pengguna yang
 * login, tidak pernah dari input, sehingga antar-workspace terisolasi.
 *
 * Hak tulis per peran:
 *  - owner/admin : semua koleksi.
 *  - member      : tidak boleh mengubah paket/modul (workspace), otomasi, keuangan (invoices, expenses)
 *                  maupun CRM (clients, deals); hanya boleh mengubah profilnya sendiri; catatan waktu,
 *                  absensi, dan cuti hanya miliknya sendiri (cuti hanya berstatus "pending").
 */
class SyncController extends Controller
{
    private const COLLECTIONS = [
        'workspace', 'members', 'spaces', 'projects', 'tasks', 'comments', 'activities', 'notifications',
        'timeEntries', 'clients', 'deals', 'invoices', 'expenses', 'attendances', 'leaves', 'automations',
    ];

    private const ADMIN_ONLY = ['workspace', 'automations', 'invoices', 'expenses', 'clients', 'deals'];

    private const OWN_ONLY = ['timeEntries', 'attendances'];

    public function pull(Request $request): JsonResponse
    {
        $wsId = $request->user()->workspace_id;
        $out = array_fill_keys(self::COLLECTIONS, []);
        $count = 0;
        // rev dibaca sebelum data: jika ada tulis di tengah, klien akan menarik ulang pada polling berikutnya.
        $rev = (int) DB::table('workspaces')->where('id', $wsId)->value('rev');

        DB::table('records')->where('workspace_id', $wsId)->orderBy('id')->each(function ($r) use (&$out, &$count) {
            if (isset($out[$r->collection])) {
                $out[$r->collection][] = json_decode($r->data, true);
                $count++;
            }
        });

        return response()->json(['empty' => $count === 0, 'rev' => $rev, 'collections' => $out]);
    }

    public function rev(Request $request): JsonResponse
    {
        return response()->json(['rev' => (int) DB::table('workspaces')->where('id', $request->user()->workspace_id)->value('rev')]);
    }

    public function push(Request $request): JsonResponse
    {
        $request->validate([
            'changes' => ['required', 'array', 'max:2000'],
            'changes.*.c' => ['required', 'string', 'in:'.implode(',', self::COLLECTIONS)],
            'changes.*.id' => ['required', 'string', 'max:100'],
            'changes.*.data' => ['nullable', 'array'],
        ]);

        $user = $request->user();
        $wsId = $user->workspace_id;
        $changes = $request->input('changes');

        if ($denied = $this->denied($user, $changes)) {
            return response()->json(['message' => $denied], 403);
        }

        $now = now();
        $prev = 0;
        $rev = 0;

        DB::transaction(function () use ($changes, $wsId, $now, &$prev, &$rev) {
            // Kunci baris workspace agar penambahan rev berurutan walau ada push bersamaan.
            $prev = (int) DB::table('workspaces')->where('id', $wsId)->lockForUpdate()->value('rev');
            foreach ($changes as $ch) {
                $key = ['workspace_id' => $wsId, 'collection' => $ch['c'], 'rid' => $ch['id']];

                if (($ch['data'] ?? null) === null) {
                    DB::table('records')->where($key)->delete();

                    continue;
                }

                DB::table('records')->updateOrInsert($key, [
                    'data' => json_encode($ch['data'], JSON_UNESCAPED_UNICODE),
                    'updated_at' => $now,
                    'created_at' => $now,
                ]);
            }
            $rev = $prev + 1;
            DB::table('workspaces')->where('id', $wsId)->update(['rev' => $rev]);
        });

        return response()->json(['ok' => true, 'applied' => count($changes), 'rev' => $rev, 'prev' => $prev]);
    }

    /** Mengembalikan pesan penolakan, atau null jika semua perubahan diizinkan. */
    private function denied(User $user, array $changes): ?string
    {
        if (in_array($user->role, ['owner', 'admin'], true)) {
            return null;
        }

        $me = 'u'.$user->id;

        foreach ($changes as $ch) {
            $c = $ch['c'];
            $data = $ch['data'] ?? null;

            if (in_array($c, self::ADMIN_ONLY, true)) {
                return 'Hanya pemilik atau admin yang boleh mengubah data ini.';
            }

            if ($c === 'members' && $ch['id'] !== $me) {
                return 'Anggota hanya boleh mengubah profilnya sendiri.';
            }

            if (in_array($c, self::OWN_ONLY, true) || $c === 'leaves') {
                $owner = $data['userId'] ?? $this->existingOwner($user->workspace_id, $c, $ch['id']);
                if ($owner !== null && $owner !== $me) {
                    return 'Anggota hanya boleh mengubah catatan miliknya sendiri.';
                }
                if ($c === 'leaves' && $data !== null && ($data['status'] ?? 'pending') !== 'pending') {
                    return 'Persetujuan cuti hanya bisa dilakukan pemilik atau admin.';
                }
            }
        }

        return null;
    }

    private function existingOwner(int $wsId, string $collection, string $rid): ?string
    {
        $raw = DB::table('records')->where(['workspace_id' => $wsId, 'collection' => $collection, 'rid' => $rid])->value('data');

        return $raw ? (json_decode($raw, true)['userId'] ?? null) : null;
    }
}
