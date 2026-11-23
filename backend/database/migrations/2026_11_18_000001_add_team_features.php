<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 16)->default('member')->after('workspace_id');
        });

        Schema::table('workspaces', function (Blueprint $table) {
            // Naik setiap kali ada perubahan data; dipakai klien untuk mendeteksi pembaruan dari anggota lain.
            $table->unsignedBigInteger('rev')->default(0);
        });

        Schema::table('api_tokens', function (Blueprint $table) {
            $table->string('name', 60)->nullable(); // terisi untuk token API pribadi, kosong untuk sesi perangkat
        });

        Schema::create('invites', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->index();
            $table->string('email', 190);
            $table->string('role', 16)->default('member');
            $table->string('token', 40)->unique();
            $table->foreignId('invited_by')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();
        });

        foreach (DB::table('workspaces')->get() as $ws) {
            if ($ws->owner_id) {
                DB::table('users')->where('id', $ws->owner_id)->update(['role' => 'owner']);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invites');
        Schema::table('api_tokens', fn (Blueprint $t) => $t->dropColumn('name'));
        Schema::table('workspaces', fn (Blueprint $t) => $t->dropColumn('rev'));
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('role'));
    }
};
