import React, { useEffect, useState, useMemo } from 'react';
import {
  Shield, Server, Users, FolderGit2, Database, HardDrive,
  RefreshCw, Trash2, CheckCircle2, AlertTriangle, Clock,
  Cpu, Layers, Search, Mail, ExternalLink
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { api, SystemStats, SystemWorkspace, SystemUser, ApiError } from '../lib/api';
import { PageHeader, Pill } from '../components/ui';
import { fmtDateLong } from '../lib/format';

export const SystemAdminPage: React.FC = () => {
  const { me, notify } = useApp();
  const [activeTab, setActiveTab] = useState<'overview' | 'workspaces' | 'users' | 'server'>('overview');
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [workspaces, setWorkspaces] = useState<SystemWorkspace[]>([]);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchWs, setSearchWs] = useState('');
  const [searchUser, setSearchUser] = useState('');
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

  const isSuperadmin =
    me.role === 'superadmin' ||
    me.email === 'admin@rampung.biz' ||
    me.email === 'radityaysf06@gmail.com';

  const loadData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);

    try {
      const [sData, wsData, uData] = await Promise.all([
        api.getSystemStats(),
        api.getSystemWorkspaces(),
        api.getSystemUsers(),
      ]);
      setStats(sData);
      setWorkspaces(wsData.workspaces);
      setUsers(uData.users);
      if (isManual) notify('Data Diperbarui', 'Informasi sistem dan database berhasil disinkronkan.', 'success');
    } catch (err: any) {
      notify('Gagal memuat data sistem', err?.message || 'Pastikan backend berjalan.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (isSuperadmin) {
      loadData();
    }
  }, [isSuperadmin]);

  const handleDeleteUser = async (user: SystemUser) => {
    if (user.email === me.email || user.id.toString() === me.id.replace(/\D/g, '')) {
      notify('Tindakan Ditolak', 'Anda tidak dapat menghapus akun Anda sendiri.');
      return;
    }
    const confirmed = window.confirm(
      `Apakah Anda yakin ingin menghapus akun "${user.name}" (${user.email}) dari sistem Rampung? Tindakan ini tidak dapat dibatalkan.`
    );
    if (!confirmed) return;

    setDeletingUserId(user.id);
    try {
      await api.deleteSystemUser(user.id);
      notify('Pengguna Dihapus', `Akun ${user.email} berhasil dihapus dari sistem.`, 'success');
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      if (stats) setStats({ ...stats, totalUsers: Math.max(0, stats.totalUsers - 1) });
    } catch (err: any) {
      notify('Gagal menghapus pengguna', err?.message || 'Terjadi kesalahan sistem.');
    } finally {
      setDeletingUserId(null);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    const q = searchWs.toLowerCase().trim();
    if (!q) return workspaces;
    return workspaces.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.ownerName.toLowerCase().includes(q) ||
        w.ownerEmail.toLowerCase().includes(q)
    );
  }, [workspaces, searchWs]);

  const filteredUsers = useMemo(() => {
    const q = searchUser.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.workspaceName.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q)
    );
  }, [users, searchUser]);

  if (!isSuperadmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle size={32} />
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Akses Dibatasi</h1>
        <p className="mt-2 text-sm text-gray-600">
          Halaman Administrator Sistem (Superadmin) ini hanya dapat diakses oleh akun master platform Rampung.
        </p>
        <div className="mt-6">
          <a href="#/beranda" className="btn btn-primary inline-flex items-center gap-2">
            Kembali ke Beranda
          </a>
        </div>
      </div>
    );
  }

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts = [];
    if (d > 0) parts.push(`${d}h`);
    if (h > 0) parts.push(`${h}j`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}d`);
    return parts.join(' ');
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-teal-900 via-teal-800 to-emerald-900 p-6 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-emerald-300">
            <Shield size={20} className="animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider">Master Platform Dashboard</span>
          </div>
          <h1 className="mt-1 text-2xl font-black sm:text-3xl">Administrator Sistem Rampung</h1>
          <p className="mt-1 text-sm text-teal-100 opacity-90">
            Monitoring kesehatan server, status database MySQL, multi-tenant workspace, dan seluruh akun pengguna.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing || loading}
            className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur hover:bg-white/20 active:scale-95 disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Memperbarui...' : 'Segarkan Data'}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'overview'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Cpu size={16} />
          Ringkasan Platform
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('workspaces')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'workspaces'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FolderGit2 size={16} />
          Semua Workspace ({workspaces.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'users'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={16} />
          Semua Pengguna ({users.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('server')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-bold transition-colors ${
            activeTab === 'server'
              ? 'border-brand text-brand'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Server size={16} />
          Kesehatan Server & DB
        </button>
      </div>

      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3">
          <RefreshCw size={32} className="animate-spin text-brand" />
          <p className="text-sm font-medium text-gray-500">Menghubungkan ke Backend Node.js & Database MySQL...</p>
        </div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Stat Cards */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Pengguna</span>
                    <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600">
                      <Users size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-black text-gray-900">{stats?.totalUsers ?? 0}</div>
                  <div className="mt-1 text-xs text-gray-500">Akun terdaftar di semua tenant</div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Total Workspace</span>
                    <div className="rounded-xl bg-purple-50 p-2.5 text-purple-600">
                      <FolderGit2 size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-black text-gray-900">{stats?.totalWorkspaces ?? 0}</div>
                  <div className="mt-1 text-xs text-gray-500">Ruang kerja aktif</div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Data Records</span>
                    <div className="rounded-xl bg-amber-50 p-2.5 text-amber-600">
                      <Layers size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-black text-gray-900">{stats?.totalRecords ?? 0}</div>
                  <div className="mt-1 text-xs text-gray-500">Baris sinkronisasi tersimpan</div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Storage Terpakai</span>
                    <div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-600">
                      <HardDrive size={20} />
                    </div>
                  </div>
                  <div className="mt-3 text-3xl font-black text-gray-900">
                    {stats ? formatBytes(stats.storageBytes) : '0 B'}
                  </div>
                  <div className="mt-1 text-xs text-gray-500">{stats?.totalUploads ?? 0} file terunggah</div>
                </div>
              </div>

              {/* Quick Status Grid */}
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                    <CheckCircle2 size={18} className="text-emerald-500" />
                    Status Layanan Backend & Database
                  </h3>
                  <div className="mt-4 divide-y divide-gray-100 text-sm">
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-gray-500">Runtime Server</span>
                      <span className="font-semibold text-gray-900">Node.js {stats?.nodeVersion}</span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-gray-500">Database Engine</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {stats?.database ?? 'MySQL Terkoneksi'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-gray-500">Realtime WebSocket</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {stats?.websocket ?? 'Socket.io Aktif'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-gray-500">Server Uptime</span>
                      <span className="font-semibold text-gray-900">
                        {stats ? formatUptime(stats.serverUptimeSeconds) : '-'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2.5">
                      <span className="text-gray-500">Memory Heap Used</span>
                      <span className="font-semibold text-gray-900">{stats?.memoryUsageMB ?? 0} MB</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                  <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                    <Shield size={18} className="text-brand" />
                    Akun Superadmin Aktif
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Akun dengan hak istimewa superadmin memiliki akses penuh melintasi batas workspace:
                  </p>
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                      <div>
                        <div className="font-bold text-gray-900">admin@rampung.biz</div>
                        <div className="text-xs text-gray-500">Master System Administrator</div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        Superadmin
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-xl bg-gray-50 p-3">
                      <div>
                        <div className="font-bold text-gray-900">radityaysf06@gmail.com</div>
                        <div className="text-xs text-gray-500">Google SSO Platform Owner</div>
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                        Superadmin
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: WORKSPACES */}
          {activeTab === 'workspaces' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari workspace atau pemilik..."
                    value={searchWs}
                    onChange={(e) => setSearchWs(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="text-xs text-gray-500">Menampilkan {filteredWorkspaces.length} workspace</div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-6 py-3.5">ID</th>
                      <th className="px-6 py-3.5">Nama Workspace</th>
                      <th className="px-6 py-3.5">Pemilik / Kontak</th>
                      <th className="px-6 py-3.5 text-center">Anggota</th>
                      <th className="px-6 py-3.5 text-center">Sync Records</th>
                      <th className="px-6 py-3.5">Dibuat Pada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredWorkspaces.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400">
                          Tidak ada workspace ditemukan.
                        </td>
                      </tr>
                    ) : (
                      filteredWorkspaces.map((ws) => (
                        <tr key={ws.id} className="hover:bg-gray-50/60">
                          <td className="px-6 py-4 font-mono text-xs text-gray-400">#{ws.id}</td>
                          <td className="px-6 py-4 font-bold text-gray-900">{ws.name}</td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-gray-800">{ws.ownerName}</div>
                            <div className="text-xs text-gray-400">{ws.ownerEmail}</div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                              {ws.memberCount} anggota
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="font-mono text-xs text-gray-600">{ws.recordCount} baris</span>
                          </td>
                          <td className="px-6 py-4 text-xs text-gray-500">
                            {ws.createdAt ? fmtDateLong(ws.createdAt.split('T')[0]) : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 3: USERS */}
          {activeTab === 'users' && (
            <div className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative flex-1 sm:max-w-xs">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Cari nama, email, atau workspace..."
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:border-brand focus:outline-none"
                  />
                </div>
                <div className="text-xs text-gray-500">Menampilkan {filteredUsers.length} pengguna terdaftar</div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className="px-6 py-3.5">ID</th>
                      <th className="px-6 py-3.5">Nama & Profil</th>
                      <th className="px-6 py-3.5">Email</th>
                      <th className="px-6 py-3.5">Hak Akses</th>
                      <th className="px-6 py-3.5">Workspace</th>
                      <th className="px-6 py-3.5">Terdaftar</th>
                      <th className="px-6 py-3.5 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-gray-400">
                          Tidak ada pengguna ditemukan.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelf = u.email === me.email || u.id.toString() === me.id.replace(/\D/g, '');
                        return (
                          <tr key={u.id} className="hover:bg-gray-50/60">
                            <td className="px-6 py-4 font-mono text-xs text-gray-400">#{u.id}</td>
                            <td className="px-6 py-4">
                              <div className="font-bold text-gray-900">{u.name}</div>
                              {isSelf && (
                                <span className="inline-block rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold text-amber-800">
                                  Akun Anda
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-600">{u.email}</td>
                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  u.role === 'superadmin'
                                    ? 'bg-purple-100 text-purple-800'
                                    : u.role === 'owner'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : u.role === 'admin'
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {u.role === 'superadmin' ? 'Superadmin' : u.role.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-medium text-gray-700">{u.workspaceName}</td>
                            <td className="px-6 py-4 text-xs text-gray-500">
                              {u.createdAt ? fmtDateLong(u.createdAt.split('T')[0]) : '-'}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {!isSelf && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  disabled={deletingUserId === u.id}
                                  title="Hapus akun dari sistem"
                                  className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: SERVER HEALTH */}
          {activeTab === 'server' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Server size={18} className="text-teal-600" />
                  Spesifikasi Server & Runtime
                </h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Backend Technology</span>
                    <span className="font-semibold text-gray-900">Node.js + Express + Prisma ORM</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Node Version</span>
                    <span className="font-mono font-semibold text-gray-900">{stats?.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Memory Heap Used</span>
                    <span className="font-semibold text-gray-900">{stats?.memoryUsageMB} MB</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Server Uptime</span>
                    <span className="font-semibold text-gray-900">
                      {stats ? formatUptime(stats.serverUptimeSeconds) : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Timestamp Server</span>
                    <span className="font-mono text-xs text-gray-600">{stats?.timestamp}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h3 className="flex items-center gap-2 text-base font-bold text-gray-900">
                  <Database size={18} className="text-emerald-600" />
                  Kesehatan Database & Sinkronisasi
                </h3>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Database Engine</span>
                    <span className="font-semibold text-gray-900">MySQL 8.0 (Laragon / Hostinger VPS)</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Total Baris Sync (records)</span>
                    <span className="font-bold text-brand">{stats?.totalRecords} baris</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Total File Uploads</span>
                    <span className="font-semibold text-gray-900">{stats?.totalUploads} berkas</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Realtime Engine</span>
                    <span className="font-semibold text-emerald-600">Socket.io (WebSocket)</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-100 pb-2">
                    <span className="text-gray-500">Koneksi Pool</span>
                    <span className="font-semibold text-gray-900">Aktif & Stabil</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
