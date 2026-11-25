import { describe, expect, it } from 'vitest';
import { emailLayout, escapeHtml, sendMail } from '../src/mail';

describe('email', () => {
  it('teks dari pengguna di-escape sebelum masuk HTML', () => {
    expect(escapeHtml(`<img src=x onerror="alert('x')">&`)).toBe('&lt;img src=x onerror=&quot;alert(&#39;x&#39;)&quot;&gt;&amp;');
  });

  it('kerangka memuat judul, tombol, dan tautan cadangan yang sama', () => {
    const html = emailLayout({ preheader: 'p', title: 'Judul', bodyHtml: '<p>isi</p>', buttonText: 'Gabung ke tim', buttonUrl: 'http://localhost:3000/#/gabung/abc&x=1', footnote: 'catatan' });
    expect(html).toContain('Gabung ke tim');
    expect(html.match(/href="http:\/\/localhost:3000\/#\/gabung\/abc&amp;x=1"/g)).toHaveLength(2);
    expect(html).toContain('<h1');
  });

  it('tanpa SMTP_HOST: tidak mengirim dan melapor gagal (pemanggil membagikan tautan manual)', async () => {
    expect(await sendMail('a@test.id', 's', 't', '<p>h</p>')).toBe(false);
  });
});
