<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

/**
 * Portal klien: halaman baca-saja tanpa login. Hanya proyek yang portalnya
 * diaktifkan dan hanya data ringkas (judul, status, tenggat) yang dibuka.
 */
class PortalController extends Controller
{
    public function show(string $token): JsonResponse
    {
        if (! preg_match('/^[A-Za-z0-9]{16,64}$/', $token)) {
            return response()->json(['message' => 'Portal tidak ditemukan.'], 404);
        }

        $row = DB::table('records')->where('collection', 'projects')->where('data', 'like', '%"portalToken":"'.$token.'"%')->first();
        $project = $row ? json_decode($row->data, true) : null;
        if (! $project || empty($project['clientPortalEnabled']) || ($project['portalToken'] ?? null) !== $token) {
            return response()->json(['message' => 'Portal tidak ditemukan atau sudah dinonaktifkan.'], 404);
        }

        $ws = $row->workspace_id;
        $members = [];
        $client = null;
        foreach (DB::table('records')->where('workspace_id', $ws)->whereIn('collection', ['members', 'clients'])->get() as $r) {
            $d = json_decode($r->data, true);
            if ($r->collection === 'members') {
                $members[$d['id']] = $d['name'] ?? '';
            } elseif (($project['clientId'] ?? null) === ($d['id'] ?? null)) {
                $client = $d['company'] ?? null;
            }
        }

        $tasks = [];
        foreach (DB::table('records')->where('workspace_id', $ws)->where('collection', 'tasks')->get() as $r) {
            $t = json_decode($r->data, true);
            if (($t['projectId'] ?? null) !== $project['id']) {
                continue;
            }
            $tasks[] = [
                'title' => $t['title'] ?? '', 'status' => $t['status'] ?? 'todo', 'dueDate' => $t['dueDate'] ?? null,
                'assignee' => $members[$t['assigneeId'] ?? ''] ?? null,
                'subtasks' => count($t['subtasks'] ?? []),
                'subtasksDone' => count(array_filter($t['subtasks'] ?? [], fn ($s) => ! empty($s['completed']))),
            ];
        }

        return response()->json([
            'workspace' => DB::table('workspaces')->where('id', $ws)->value('name'),
            'client' => $client,
            'project' => ['name' => $project['name'], 'description' => $project['description'] ?? '', 'startDate' => $project['startDate'] ?? null, 'dueDate' => $project['dueDate'] ?? null],
            'tasks' => $tasks,
        ]);
    }
}
