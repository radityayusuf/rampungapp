/**
 * WhatsApp Business Cloud API (Meta).
 * Aktif hanya jika WHATSAPP_TOKEN dan WHATSAPP_PHONE_NUMBER_ID diisi.
 *
 * Catatan platform: pesan teks bebas hanya diterima penerima yang menghubungi nomor bisnis dalam 24 jam
 * terakhir. Di luar jendela itu Meta mewajibkan pesan TEMPLATE yang sudah disetujui; galatnya diteruskan apa adanya.
 */

export class WhatsAppError extends Error {
  constructor(message: string, public status = 502) {
    super(message);
  }
}

const token = () => (process.env.WHATSAPP_TOKEN || '').trim();
const phoneId = () => (process.env.WHATSAPP_PHONE_NUMBER_ID || '').trim();
export const isWhatsAppConfigured = () => token().length > 0 && phoneId().length > 0;

const base = () => `${(process.env.WHATSAPP_BASE_URL || 'https://graph.facebook.com').replace(/\/$/, '')}/${process.env.WHATSAPP_API_VERSION || 'v21.0'}`;

/** Nomor Indonesia: 0812… / 812… / +62812… → 62812…; hanya 9–15 digit yang diterima. */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let d = raw.replace(/[^0-9]/g, '');
  if (d.startsWith('0')) d = `62${d.slice(1)}`;
  else if (d.startsWith('8')) d = `62${d}`;
  return d.length >= 9 && d.length <= 15 ? d : null;
}

async function graph(path: string, init: RequestInit = {}): Promise<Record<string, any>> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new WhatsAppError('WhatsApp tidak dapat dijangkau. Coba lagi sebentar.', 503);
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) throw new WhatsAppError(`WhatsApp menolak pesan: ${json?.error?.message || `HTTP ${res.status}`}`, 502);
  return json;
}

/** Mengembalikan ID pesan dari Meta. Status "accepted" berarti diterima Meta, BUKAN bahwa sudah dibaca penerima. */
export async function sendText(to: string, body: string): Promise<{ messageId: string }> {
  const json = await graph(`/${phoneId()}/messages`, {
    method: 'POST',
    body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { preview_url: false, body } }),
  });
  const id = json?.messages?.[0]?.id;
  if (!id) throw new WhatsAppError('WhatsApp tidak mengembalikan ID pesan.');
  return { messageId: String(id) };
}

let cache: { at: number; value: { phoneNumber: string; accountName: string } | null } | null = null;

/** Info nomor bisnis yang benar-benar terhubung (di-cache 5 menit). null jika tidak terjangkau. */
export async function getAccountInfo(): Promise<{ phoneNumber: string; accountName: string } | null> {
  if (cache && Date.now() - cache.at < 5 * 60_000) return cache.value;
  try {
    const j = await graph(`/${phoneId()}?fields=display_phone_number,verified_name`);
    cache = { at: Date.now(), value: { phoneNumber: String(j.display_phone_number ?? ''), accountName: String(j.verified_name ?? '') } };
  } catch {
    cache = { at: Date.now() - 4 * 60_000, value: null }; // coba lagi dalam ~1 menit
  }
  return cache.value;
}

export const resetWhatsAppCache = () => {
  cache = null;
};
