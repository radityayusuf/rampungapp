<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\PortalController;
use App\Http\Controllers\SyncController;
use App\Http\Controllers\TeamController;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

// Dipakai load balancer/Docker: 503 jika database tidak terjangkau.
Route::get('/health', function () {
    try {
        DB::select('select 1');
        $db = 'ok';
    } catch (Throwable) {
        $db = 'down';
    }

    return response()->json([
        'status' => $db === 'ok' ? 'ok' : 'degraded',
        'app' => 'Rampung API',
        'database' => $db,
        'timestamp' => now()->toIso8601String(),
    ], $db === 'ok' ? 200 : 503);
});

// Publik
Route::middleware('throttle:'.config('app.auth_throttle').',1')->group(function () {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
    Route::post('/auth/forgot', [AuthController::class, 'forgot']);
    Route::post('/auth/reset', [AuthController::class, 'reset']);
});
Route::middleware('throttle:60,1')->group(function () {
    Route::get('/invites/{token}', [TeamController::class, 'showInvite']);
    Route::get('/portal/{token}', [PortalController::class, 'show']);
});

// Terautentikasi
Route::middleware(['api.token', 'throttle:240,1'])->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::patch('/auth/me', [AuthController::class, 'update']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    Route::get('/sync', [SyncController::class, 'pull']);
    Route::get('/sync/rev', [SyncController::class, 'rev']);
    Route::post('/sync', [SyncController::class, 'push']);

    Route::get('/members', [TeamController::class, 'members']);
    Route::patch('/members/{id}', [TeamController::class, 'updateMember']);
    Route::delete('/members/{id}', [TeamController::class, 'removeMember']);

    Route::get('/invites', [TeamController::class, 'invites']);
    Route::post('/invites', [TeamController::class, 'invite']);
    Route::delete('/invites/{id}', [TeamController::class, 'revokeInvite']);

    Route::get('/tokens', [TeamController::class, 'tokens']);
    Route::post('/tokens', [TeamController::class, 'createToken']);
    Route::delete('/tokens/{id}', [TeamController::class, 'deleteToken']);
});
