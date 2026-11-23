<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspaces', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->foreignId('owner_id')->nullable();
            $table->timestamps();
        });

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('workspace_id')->nullable()->after('id')->index();
        });

        // Satu baris = satu perangkat/sesi. Hanya hash SHA-256 yang disimpan.
        Schema::create('api_tokens', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->index();
            $table->string('token_hash', 64)->unique();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();
        });

        // Satu baris = satu record (task, proyek, invoice, dst.) milik satu workspace.
        Schema::create('records', function (Blueprint $table) {
            $table->id();
            $table->foreignId('workspace_id')->index();
            $table->string('collection', 32);
            $table->string('rid', 100);
            $table->longText('data');
            $table->timestamps();
            $table->unique(['workspace_id', 'collection', 'rid']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('records');
        Schema::dropIfExists('api_tokens');
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['workspace_id']);
        });
        Schema::dropIfExists('workspaces');
    }
};
