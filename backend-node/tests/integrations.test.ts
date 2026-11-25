import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db';
import { normalizePhone, resetWhatsAppCache } from '../src/services/whatsapp';
import { validateWebhook } from '../src/services/webhookGuard';
import { parseAiBreakdown } from '../src/services/ai';
import { app, auth, push, resetDb, signUp, team, useDefaultPlan } from './helpers';

const ENV_KEYS = ['WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'ANTHROPIC_API_KEY'] as const;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const stubFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) => {
  const fn = vi.fn((url: unknown, init?: RequestInit) => Promise.resolve(handler(String(url), init)));
  vi.stubGlobal('fetch', fn);
  return fn;
};
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));

beforeEach(async () => {
  useDefaultPlan('bisnis'); // fitur di berkas ini butuh paket Bisnis; batas paket diuji di billing.test.ts
  await resetDb();
  for (const k of ENV_KEYS) process.env[k] = '';
  resetWhatsAppCache();
});
afterEach(() => {
  useDefaultPlan('gratis');
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) process.env[k] = '';
});

const configure = (...keys: (typeof ENV_KEYS[number])[]) => {
  const v: Record<string, string> = { WHATSAPP_TOKEN: 'wa-token', WHATSAPP_PHONE_NUMBER_ID: '1234567890', ANTHROPIC_API_KEY: 'sk-ant-test' };
  for (const k of keys) process.env[k] = v[k];
};

// ───────────────────────── Status ─────────────────────────
describe('GET /integrations/status', () => {
  it('melaporkan apa adanya: tidak ada yang aktif tanpa konfigurasi', async () => {
    const a = await signUp();
    const res = await request(app).get('/api/integrations/status').set(auth(a.token)).expect(200);
    expect(res.body.payments).toMatchObject({ configured: false, method: 'manual' });
    expect(res.body.whatsapp.configured).toBe(false);
    expect(res.body.ai.configured).toBe(false);
    expect(res.body.email.configured).toBe(false);
  });

  it('wajib login; penyimpanan dihitung dari berkas sungguhan milik workspace itu saja', async () => {
    await request(app).get('/api/integrations/status').expect(401);
    const a = await signUp('A');
    const b = await signUp('B');
    await prisma.uploads.create({ data: { workspace_id: BigInt(a.workspaceId), original_name: 'a.txt', stored_name: 's1', mime_type: 'text/plain', size: BigInt(1500), uploaded_by: BigInt(a.id) } });
    await prisma.uploads.create({ data: { workspace_id: BigInt(a.workspaceId), original_name: 'b.txt', stored_name: 's2', mime_type: 'text/plain', size: BigInt(500), uploaded_by: BigInt(a.id) } });

    expect((await request(app).get('/api/integrations/status').set(auth(a.token))).body.storage).toEqual({ usedBytes: 2000, files: 2 });
    expect((await request(app).get('/api/integrations/status').set(auth(b.token))).body.storage).toEqual({ usedBytes: 0, files: 0 });
  });

  it('WhatsApp terkonfigurasi menampilkan nomor yang benar-benar terhubung dari Meta', async () => {
    configure('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    stubFetch(() => json({ display_phone_number: '+62 811-0000-111', verified_name: 'Studio Nusa' }));
    const a = await signUp();
    const res = await request(app).get('/api/integrations/status').set(auth(a.token)).expect(200);
    expect(res.body.whatsapp).toMatchObject({ configured: true, reachable: true, phoneNumber: '+62 811-0000-111', accountName: 'Studio Nusa' });
  });
});

// ───────────────────────── WhatsApp ─────────────────────────
describe('WhatsApp', () => {
  const send = (token: string, body: object) => request(app).post('/api/integrations/whatsapp/send').set(auth(token)).send(body);

  it('normalisasi nomor', () => {
    expect(normalizePhone('0812-3456-7890')).toBe('6281234567890');
    expect(normalizePhone('+62 812 3456 7890')).toBe('6281234567890');
    expect(normalizePhone('81234567890')).toBe('6281234567890');
    for (const bad of ['abc', '', '123', '1'.repeat(16), 12345, null, undefined, {}]) expect(normalizePhone(bad)).toBeNull();
  });

  it('belum dikonfigurasi: 503 jujur, bukan "terkirim"', async () => {
    const owner = await signUp();
    const res = await send(owner.token, { phone: '081234567890', message: 'Halo' }).expect(503);
    expect(res.body).toMatchObject({ configured: false });
    expect(res.body.message).toContain('WHATSAPP_TOKEN');
  });

  it('terkonfigurasi: memanggil Cloud API dengan nomor ternormalisasi dan melaporkan "accepted" (bukan "delivered")', async () => {
    configure('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    const f = stubFetch(() => json({ messaging_product: 'whatsapp', contacts: [{ wa_id: '6281234567890' }], messages: [{ id: 'wamid.ABC123' }] }));
    const owner = await signUp();

    const res = await send(owner.token, { phone: '0812-3456-7890', message: '  Tagihan INV-1  ' }).expect(200);
    expect(res.body).toMatchObject({ status: 'accepted', messageId: 'wamid.ABC123', to: '+6281234567890' });
    expect(res.body.deliveryStatus).toBeUndefined();

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    expect(init.headers).toMatchObject({ Authorization: 'Bearer wa-token' });
    expect(JSON.parse(String(init.body))).toMatchObject({ messaging_product: 'whatsapp', to: '6281234567890', type: 'text', text: { body: 'Tagihan INV-1' } });
  });

  it('galat dari Meta diteruskan apa adanya; jaringan putus = 503', async () => {
    configure('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    const owner = await signUp();
    stubFetch(() => json({ error: { message: 'Re-engagement message', code: 131047 } }, 400));
    const r = await send(owner.token, { phone: '081234567890', message: 'Halo' }).expect(502);
    expect(r.body.message).toContain('Re-engagement message');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await send(owner.token, { phone: '081234567890', message: 'Halo' }).expect(503);
  });

  it('hanya admin; masukan divalidasi sebelum menghubungi Meta; dibatasi 20 pesan per menit per pengguna', async () => {
    configure('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    const f = stubFetch(() => json({ messages: [{ id: 'wamid.X' }] }));
    const { owner, member } = await team();

    await send(member.token, { phone: '081234567890', message: 'Halo' }).expect(403);
    await request(app).post('/api/integrations/whatsapp/send').send({}).expect(401);
    for (const bad of [{ phone: 'abc', message: 'x' }, { phone: '081234567890', message: '' }, { phone: '081234567890', message: 'x'.repeat(1001) }, { phone: 81234567890, message: 'x' }, { phone: '081234567890', message: { a: 1 } }, {}]) {
      await send(owner.token, bad).expect(422);
    }
    expect(f).not.toHaveBeenCalled();

  });

  it('dibatasi 20 pesan per menit per pengguna (melindungi kuota nomor bisnis)', async () => {
    configure('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID');
    const f = stubFetch(() => json({ messages: [{ id: 'wamid.X' }] }));
    const owner = await signUp();

    const codes: number[] = [];
    for (let i = 0; i < 22; i++) codes.push((await send(owner.token, { phone: '081234567890', message: `Pesan ${i}` })).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(20);
    expect(codes.filter((c) => c === 429)).toHaveLength(2);
    expect(f).toHaveBeenCalledTimes(20); // yang diblokir tidak sampai ke Meta
  });
});

// ───────────────────────── AI ─────────────────────────
describe('Asisten AI: pemecah tugas', () => {
  const breakdown = (token: string, body: object) => request(app).post('/api/integrations/ai/breakdown').set(auth(token)).send(body);
  const aiReply = (text: string) => json({ content: [{ type: 'text', text }], model: 'claude-sonnet-5-5' });
  const goodJson = JSON.stringify({ label: 'Desain', priority: 'high', advice: 'Mulai dari riset.', subtasks: [{ title: 'Riset pengguna', estimatedMinutes: 60 }, { title: 'Buat wireframe', estimatedMinutes: 120 }] });

  it('tanpa kunci: memakai template dan MENGAKUINYA (source: template), tidak mengaku AI', async () => {
    const a = await signUp();
    const res = await breakdown(a.token, { title: 'Desain logo baru' }).expect(200);
    expect(res.body.source).toBe('template');
    expect(res.body.suggestedLabel).toBe('Desain');
    expect(res.body.subtasks.length).toBeGreaterThan(2);
    expect(res.body.advice).toContain('bukan AI');
  });

  it('dengan kunci: memanggil Claude dan mengembalikan hasilnya bertanda source: ai', async () => {
    configure('ANTHROPIC_API_KEY');
    const f = stubFetch(() => aiReply(`Berikut hasilnya:\n${goodJson}`)); // teks tambahan di sekitar JSON ditoleransi
    const a = await signUp();

    const res = await breakdown(a.token, { title: 'Redesign halaman checkout', description: 'Fokus mobile' }).expect(200);
    expect(res.body).toMatchObject({ source: 'ai', model: 'claude-sonnet-5-5', suggestedLabel: 'Desain', suggestedPriority: 'high', totalEstimatedHours: '3.0' });
    expect(res.body.subtasks).toHaveLength(2);

    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01' });
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe('claude-sonnet-5-5');
    expect(sent.messages[0].content).toContain('Redesign halaman checkout');
  });

  it('keluaran model dirapikan: label asing → Manajemen, menit dibatasi, subtugas dipotong 8', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ title: `Langkah ${i}`, estimatedMinutes: i === 0 ? 99999 : i === 1 ? -5 : 30 }));
    const out = parseAiBreakdown(JSON.stringify({ label: 'Astrologi', priority: 'sangat', advice: 'x'.repeat(900), subtasks: many }));
    expect(out.suggestedLabel).toBe('Manajemen');
    expect(out.suggestedPriority).toBe('medium');
    expect(out.subtasks).toHaveLength(8);
    expect(out.subtasks[0].estimatedMinutes).toBe(480);
    expect(out.subtasks[1].estimatedMinutes).toBe(10);
    expect(out.advice.length).toBeLessThanOrEqual(400);
  });

  it.each([
    ['bukan JSON', 'maaf saya tidak bisa'],
    ['JSON rusak', '{"subtasks": [oops]}'],
    ['tanpa subtugas', '{"label":"Desain","subtasks":[]}'],
    ['subtugas tanpa judul', '{"subtasks":[{"estimatedMinutes":30},{"title":123}]}'],
  ])('jawaban AI tidak layak (%s) → 502, tidak ada karangan pengganti', async (_n, text) => {
    configure('ANTHROPIC_API_KEY');
    stubFetch(() => aiReply(text));
    const a = await signUp();
    await breakdown(a.token, { title: 'Tugas apa saja' }).expect(502);
  });

  it('galat/jaringan layanan AI → 502/503 apa adanya', async () => {
    configure('ANTHROPIC_API_KEY');
    const a = await signUp();
    stubFetch(() => json({ error: { message: 'overloaded' } }, 529));
    await breakdown(a.token, { title: 'Tugas' }).expect(502).then((r) => expect(r.body.message).toContain('overloaded'));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    await breakdown(a.token, { title: 'Tugas' }).expect(503);
  });

  it('masukan divalidasi dan anggota biasa boleh memakainya; dibatasi 10 per menit', async () => {
    const { member } = await team();
    for (const bad of [{}, { title: '' }, { title: 'x'.repeat(201) }, { title: { a: 1 } }, { title: 'ok', description: 'x'.repeat(2001) }, { title: 'ok', description: 5 }]) {
      await breakdown(member.token, bad).expect(422);
    }
    await request(app).post('/api/integrations/ai/breakdown').send({ title: 'x' }).expect(401);

    const codes: number[] = [];
    for (let i = 0; i < 12; i++) codes.push((await breakdown(member.token, { title: `Tugas ${i}` })).status);
    expect(codes.filter((c) => c === 200).length).toBeLessThanOrEqual(10);
    expect(codes).toContain(429);
  });
});

describe('Asisten AI: ringkasan proyek (dihitung dari data server)', () => {
  const summarize = (token: string, body: object) => request(app).post('/api/integrations/ai/summarize').set(auth(token)).send(body);
  const day = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);
  const task = (id: string, status: string, due: string, projectId = 'p1') => ({ c: 'tasks', id, data: { id, projectId, title: `Tugas ${id}`, status, dueDate: due } });

  async function seed(tasks: ReturnType<typeof task>[], project: object = {}) {
    const owner = await signUp();
    await push(owner.token, [{ c: 'projects', id: 'p1', data: { id: 'p1', name: 'Website Klien', startDate: day(-10), dueDate: day(10), ...project } }, ...tasks]).expect(200);
    return owner;
  }

  it('angka berasal dari tugas di database; kiriman tugas dari klien diabaikan', async () => {
    const owner = await seed([task('a', 'done', day(-3)), task('b', 'done', day(-2)), task('c', 'in_progress', day(5)), task('d', 'todo', day(6))]);
    const res = await summarize(owner.token, { projectId: 'p1', tasks: Array.from({ length: 99 }, () => ({ status: 'done' })) }).expect(200);

    expect(res.body.stats).toEqual({ total: 4, done: 2, inProgress: 1, review: 0, todo: 1, overdue: 0 });
    expect(res.body.completionRate).toBe('50%');
    expect(res.body.healthStatus).toBe('on_track');
    expect(res.body.source).toBe('analisis');
  });

  it('kesehatan proyek mengikuti kenyataan: terlambat → at_risk/delayed, tenggat proyek lewat → delayed', async () => {
    const risk = await seed([task('a', 'done', day(-3)), task('b', 'todo', day(-1)), task('c', 'todo', day(4)), task('d', 'todo', day(5)), task('e', 'todo', day(6)), task('f', 'todo', day(7))]);
    const r1 = (await summarize(risk.token, { projectId: 'p1' }).expect(200)).body;
    expect(r1.healthStatus).toBe('at_risk');
    expect(r1.stats.overdue).toBe(1);
    expect(r1.recommendation).toContain('Tugas b');

    await resetDb();
    const late = await seed([task('a', 'todo', day(-20)), task('b', 'todo', day(-19)), task('c', 'done', day(-18))], { startDate: day(-60), dueDate: day(-5) });
    const r2 = (await summarize(late.token, { projectId: 'p1' }).expect(200)).body;
    expect(r2.healthStatus).toBe('delayed');
    expect(r2.recommendation).toContain('Tenggat proyek sudah lewat');
  });

  it('proyek tanpa tugas dan validasi/isolasi workspace', async () => {
    const owner = await seed([]);
    expect((await summarize(owner.token, { projectId: 'p1' }).expect(200)).body.summary).toContain('belum memiliki tugas');

    const stranger = await signUp('Asing');
    await summarize(stranger.token, { projectId: 'p1' }).expect(404); // proyek milik workspace lain
    await summarize(owner.token, { projectId: 'tidak-ada' }).expect(404);
    for (const bad of [{}, { projectId: 5 }, { projectId: '' }, { projectId: { a: 1 } }]) await summarize(owner.token, bad).expect(422);
  });
});

// ───────────────────────── Webhook Slack/Discord ─────────────────────────
describe('webhook keluar: perlindungan SSRF', () => {
  const DISCORD = 'https://discord.com/api/webhooks/123456/abcDEF';
  const SLACK = 'https://hooks.slack.com/services/T000/B000/XXXX';

  it.each([
    [DISCORD, 'discord', true], [SLACK, 'slack', true], ['https://ptb.discord.com/api/webhooks/1/a', 'discord', true],
    ['http://discord.com/api/webhooks/1/a', 'discord', false], // bukan https
    ['https://localhost/api/webhooks/1/a', 'discord', false],
    ['https://127.0.0.1/services/x', 'slack', false],
    ['https://169.254.169.254/latest/meta-data/', 'slack', false], // metadata cloud
    ['https://192.168.1.10/api/webhooks/1/a', 'discord', false],
    ['https://hooks.slack.com.evil.com/services/x', 'slack', false], // domain mirip
    ['https://evil.com/hooks.slack.com/services/x', 'slack', false],
    ['https://user:pass@hooks.slack.com/services/x', 'slack', false], // userinfo
    ['https://hooks.slack.com:8443/services/x', 'slack', false], // port lain
    ['https://hooks.slack.com/lain/x', 'slack', false], // path salah
    [SLACK, 'discord', false], [DISCORD, 'slack', false], // layanan tidak cocok
    [SLACK, 'telegram', false], [SLACK, undefined, false],
    ['bukan url', 'slack', false], ['', 'slack', false], [123, 'slack', false], [null, 'slack', false],
    ['https://hooks.slack.com/services/' + 'x'.repeat(600), 'slack', false],
  ])('validateWebhook(%s, %s) → %s', (url, service, ok) => {
    expect(validateWebhook(url, service).ok).toBe(ok);
  });

  const hook = (token: string, body: object) => request(app).post('/api/integrations/webhook/send').set(auth(token)).send(body);

  it('URL tidak sah ditolak 422 TANPA menghubungi alamat itu', async () => {
    const f = stubFetch(() => new Response('ok'));
    const owner = await signUp();
    for (const webhookUrl of ['http://169.254.169.254/latest', 'https://localhost:3306/', 'https://evil.com/x']) {
      await hook(owner.token, { webhookUrl, service: 'slack', message: 'x' }).expect(422);
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('hanya admin; pesan divalidasi; berhasil memanggil Discord dengan redirect dilarang', async () => {
    const f = stubFetch(() => new Response(null, { status: 204 }));
    const { owner, member } = await team();

    await hook(member.token, { webhookUrl: DISCORD, service: 'discord', message: 'x' }).expect(403);
    for (const message of ['', 'x'.repeat(1501), 123, undefined]) await hook(owner.token, { webhookUrl: DISCORD, service: 'discord', message }).expect(422);
    expect(f).not.toHaveBeenCalled();

    const res = await hook(owner.token, { webhookUrl: DISCORD, service: 'discord', title: 'Tagihan', message: 'INV-1 lunas' }).expect(200);
    expect(res.body).toMatchObject({ status: 'sent', service: 'discord' });
    const [url, init] = f.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe(DISCORD);
    expect(init.redirect).toBe('error');
    expect(JSON.parse(String(init.body)).content).toContain('INV-1 lunas');
  });

  it('penolakan atau gangguan dari Slack/Discord → 502 dengan pesan wajar (tidak membocorkan galat internal)', async () => {
    const owner = await signUp();
    stubFetch(() => new Response('no_service', { status: 404 }));
    const r = await hook(owner.token, { webhookUrl: SLACK, service: 'slack', message: 'x' }).expect(502);
    expect(r.body.message).toContain('HTTP 404');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:443')));
    const r2 = await hook(owner.token, { webhookUrl: SLACK, service: 'slack', message: 'x' }).expect(502);
    expect(r2.text).not.toContain('10.0.0.5');
  });
});
