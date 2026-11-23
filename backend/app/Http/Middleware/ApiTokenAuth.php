<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

class ApiTokenAuth
{
    /** Token sesi perangkat kedaluwarsa jika tidak dipakai selama ini. Token API pribadi tidak kedaluwarsa. */
    public const IDLE_DAYS = 30;

    public function handle(Request $request, Closure $next): Response
    {
        $token = $request->bearerToken();
        $hash = $token ? hash('sha256', $token) : null;
        $row = $hash ? DB::table('api_tokens')->where('token_hash', $hash)->first() : null;

        if ($row && $row->name === null) {
            $last = strtotime($row->last_used_at ?? $row->created_at);
            if ($last < now()->subDays(self::IDLE_DAYS)->getTimestamp()) {
                DB::table('api_tokens')->where('id', $row->id)->delete();
                $row = null;
            }
        }

        $user = $row ? User::find($row->user_id) : null;

        if (! $user || ! $user->workspace_id) {
            return response()->json(['message' => 'Sesi tidak valid. Silakan masuk lagi.'], 401);
        }

        // Cukup perbarui sesekali agar tidak menulis di setiap permintaan.
        if (! $row->last_used_at || strtotime($row->last_used_at) < now()->subMinutes(5)->getTimestamp()) {
            DB::table('api_tokens')->where('id', $row->id)->update(['last_used_at' => now()]);
        }

        $request->setUserResolver(fn () => $user);
        $request->attributes->set('token_hash', $hash);

        return $next($request);
    }
}
