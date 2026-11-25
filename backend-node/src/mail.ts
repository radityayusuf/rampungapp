import nodemailer from 'nodemailer';

/**
 * Kirim email lewat SMTP. Mengembalikan true hanya jika benar-benar terkirim.
 * Tanpa SMTP_HOST (mis. saat pengembangan) mengembalikan false; pemanggil tetap bisa
 * memberi tahu pengguna agar membagikan tautan secara manual.
 * `html` opsional; versi teks selalu ikut dikirim untuk aplikasi email yang tidak menampilkan HTML.
 */
export async function sendMail(to: string, subject: string, text: string, html?: string): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  if (!host) return false;
  try {
    const transport = nodemailer.createTransport({
      host,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
    });
    await transport.sendMail({ from: process.env.MAIL_FROM || 'Rampung <no-reply@rampung.id>', to, subject, text, html });
    return true;
  } catch (e) {
    console.error('Gagal mengirim email:', (e as Error).message);
    return false;
  }
}

/** Escape teks dari pengguna (nama, nama workspace) sebelum masuk ke HTML email. */
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Kerangka email bermerek Rampung: tabel + gaya inline (aman untuk Gmail/Outlook), tombol utama,
 * tautan cadangan untuk disalin, dan catatan kaki. Semua parameter teks harus sudah di-escape.
 */
export function emailLayout(o: { preheader: string; title: string; bodyHtml: string; buttonText: string; buttonUrl: string; footnote: string }): string {
  const url = escapeHtml(o.buttonUrl);
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${o.title}</title></head>
<body style="margin:0;padding:0;background:#F4F6F5;font-family:'Segoe UI',Helvetica,Arial,sans-serif;color:#1F2933;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${o.preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6F5;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
      <tr><td style="padding:0 4px 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="background:#0B7A6B;border-radius:8px;width:32px;height:32px;text-align:center;color:#ffffff;font-size:18px;font-weight:700;line-height:32px;">&#10003;</td>
          <td style="padding-left:10px;font-size:20px;font-weight:800;color:#1F2933;letter-spacing:-0.3px;">Rampung</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #E2E5E1;border-radius:16px;overflow:hidden;">
        <div style="height:5px;background:linear-gradient(90deg,#0F9D8A,#F2B33D);background-color:#0F9D8A;"></div>
        <div style="padding:32px 32px 28px;">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;font-weight:800;color:#1F2933;">${o.title}</h1>
          <div style="font-size:15px;line-height:1.65;color:#3D4750;">${o.bodyHtml}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 22px;"><tr>
            <td style="background:#0B7A6B;border-radius:10px;">
              <a href="${url}" style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;">${o.buttonText}</a>
            </td>
          </tr></table>
          <p style="margin:0;font-size:12.5px;line-height:1.6;color:#5B6670;">Tombol tidak berfungsi? Salin tautan ini ke peramban Anda:<br><a href="${url}" style="color:#0B7A6B;word-break:break-all;">${url}</a></p>
        </div>
        <div style="border-top:1px solid #ECEEEA;background:#FAFBF9;padding:16px 32px;font-size:12.5px;line-height:1.6;color:#5B6670;">${o.footnote}</div>
      </td></tr>
      <tr><td style="padding:18px 4px 0;text-align:center;font-size:12px;color:#8A949B;">Rampung · Dari ide sampai rampung.</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
