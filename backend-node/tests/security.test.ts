import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AUTH_THROTTLE = '1000'; // batas IP dilonggarkan agar tes per-akun terukur
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock('../src/db', () => ({ prisma: { users: { findUnique }, $queryRaw: vi.fn() } }));

import { verifyGoogleCredential } from '../src/google';
import { isSuperadminUser } from '../src/superadmin';
import { apiRouter } from '../src/routes/api';

const CLIENT_ID = 'abc123.apps.googleusercontent.com';
const FAKE_TOKEN = 'x'.repeat(40);
const goodInfo = () => ({
  aud: CLIENT_ID, iss: 'https://accounts.google.com', email: 'sari@gmail.com', email_verified: 'true', name: 'Sari',
  exp: String(Math.floor(Date.now() / 1000) + 600),
});
const mockGoogle = (body: unknown, ok = true) =>
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  delete process.env.SUPERADMIN_EMAILS;
  findUnique.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

describe('verifyGoogleCredential', () => {
  it('menerima token Google yang valid', async () => {
    mockGoogle(goodInfo());
    expect(await verifyGoogleCredential(FAKE_TOKEN)).toEqual({ ok: true, email: 'sari@gmail.com', name: 'Sari' });
  });

  it('menolak jika server belum dikonfigurasi GOOGLE_CLIENT_ID', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    mockGoogle(goodInfo());
    expect(await verifyGoogleCredential(FAKE_TOKEN)).toMatchObject({ ok: false, status: 503 });
  });

  it.each([
    ['audience milik aplikasi lain', { aud: 'lain.apps.googleusercontent.com' }],
    ['penerbit bukan Google', { iss: 'https://evil.example.com' }],
    ['email belum diverifikasi', { email_verified: 'false' }],
    ['token kedaluwarsa', { exp: String(Math.floor(Date.now() / 1000) - 10) }],
    ['tanpa email', { email: '' }],
  ])('menolak: %s', async (_name, patch) => {
    mockGoogle({ ...goodInfo(), ...patch });
    expect(await verifyGoogleCredential(FAKE_TOKEN)).toMatchObject({ ok: false, status: 401 });
  });

  it('menolak jika Google menjawab tidak valid (tanpa fallback membaca isi token)', async () => {
    // Payload JWT palsu yang dulu diterima oleh jalur fallback.
    const forged = `h.${Buffer.from(JSON.stringify({ email: 'korban@gmail.com' })).toString('base64')}.s`;
    mockGoogle({ error: 'invalid_token' }, false);
    expect(await verifyGoogleCredential(forged)).toMatchObject({ ok: false, status: 401 });
  });

  it('menolak jika Google tidak terjangkau (tanpa fallback)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await verifyGoogleCredential(FAKE_TOKEN)).toMatchObject({ ok: false, status: 503 });
  });
});

describe('isSuperadminUser', () => {
  const user = (o: Partial<{ role: string; email: string; email_verified_at: Date | null }>) => ({ role: 'owner', email: 'a@b.com', email_verified_at: null, ...o });

  it('role superadmin di database', () => {
    expect(isSuperadminUser(user({ role: 'superadmin' }))).toBe(true);
  });

  it('email lama yang dulu tertulis di kode tidak lagi otomatis superadmin', () => {
    expect(isSuperadminUser(user({ email: 'admin@rampung.biz', email_verified_at: new Date() }))).toBe(false);
    expect(isSuperadminUser(user({ email: 'pemilik.lama@example.com', email_verified_at: new Date() }))).toBe(false);
  });

  it('daftar SUPERADMIN_EMAILS hanya berlaku untuk email yang sudah terverifikasi', () => {
    process.env.SUPERADMIN_EMAILS = 'Boss@Example.com, lain@example.com';
    expect(isSuperadminUser(user({ email: 'boss@example.com', email_verified_at: new Date() }))).toBe(true);
    expect(isSuperadminUser(user({ email: 'boss@example.com', email_verified_at: null }))).toBe(false); // daftar lewat sandi
    expect(isSuperadminUser(user({ email: 'orang@example.com', email_verified_at: new Date() }))).toBe(false);
    expect(isSuperadminUser(null)).toBe(false);
  });
});

describe('POST /api/auth/google (HTTP)', () => {
  const app = express().use(express.json()).use('/api', apiRouter);

  it('menolak email mentah tanpa credential dan tidak menyentuh database', async () => {
    const res = await request(app).post('/api/auth/google').send({ email: 'pemilik.lama@example.com', name: 'Penyerang' });
    expect(res.status).toBe(422);
    expect(res.body.token).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('menolak credential palsu dan tidak menerbitkan token', async () => {
    mockGoogle({ error: 'invalid_token' }, false);
    const forged = `h.${Buffer.from(JSON.stringify({ email: 'korban@gmail.com' })).toString('base64')}.sssssssssssssss`;
    const res = await request(app).post('/api/auth/google').send({ credential: forged, email: 'korban@gmail.com' });
    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('endpoint sistem menolak permintaan tanpa token', async () => {
    expect((await request(app).get('/api/system/users')).status).toBe(401);
    expect((await request(app).delete('/api/system/users/1')).status).toBe(401);
  });
});

describe('pembatas percobaan login per akun', () => {
  it('memblokir percobaan ke-6 untuk email yang sama dalam semenit, dan tidak mengganggu email lain', async () => {
    const app = express().use(express.json()).use('/api', apiRouter);
    findUnique.mockResolvedValue(null); // akun tidak ada => login gagal (422)
    const email = `target${Date.now()}@test.id`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await request(app).post('/api/auth/login').send({ email, password: 'salah1234' })).status);
    expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
    expect(statuses[5]).toBe(429);
    const other = await request(app).post('/api/auth/login').send({ email: `lain${Date.now()}@test.id`, password: 'salah1234' });
    expect(other.status).not.toBe(429);
  });
});
