/**
 * Webhook keluar hanya boleh ke Slack atau Discord (alamat publik yang dikenal).
 * Menerima URL sembarang membuka SSRF: pengguna bisa memaksa server menembak alamat internal
 * (localhost, jaringan privat, layanan metadata cloud) lewat fitur ini.
 */

export type WebhookService = 'slack' | 'discord';

const RULES: Record<WebhookService, { hosts: string[]; pathPrefix: string }> = {
  slack: { hosts: ['hooks.slack.com'], pathPrefix: '/services/' },
  discord: { hosts: ['discord.com', 'discordapp.com', 'ptb.discord.com', 'canary.discord.com'], pathPrefix: '/api/webhooks/' },
};

export function validateWebhook(rawUrl: unknown, service: unknown): { ok: true; url: URL; service: WebhookService } | { ok: false; message: string } {
  if (service !== 'slack' && service !== 'discord') return { ok: false, message: 'Layanan harus slack atau discord.' };
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 500) return { ok: false, message: 'URL webhook tidak valid.' };

  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, message: 'URL webhook tidak valid.' };
  }

  const rule = RULES[service];
  const valid =
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (url.port === '' || url.port === '443') &&
    rule.hosts.includes(url.hostname.toLowerCase()) &&
    url.pathname.startsWith(rule.pathPrefix);

  if (!valid) {
    return { ok: false, message: service === 'slack' ? 'URL harus berupa Incoming Webhook Slack (https://hooks.slack.com/services/...).' : 'URL harus berupa webhook Discord (https://discord.com/api/webhooks/...).' };
  }
  return { ok: true, url, service };
}
