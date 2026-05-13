import { env } from '../../core/env';
import { log } from '../../core/errors';

export type EmailSendPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: Record<string, string>;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatRupiah(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount || 0);
}

class EmailServiceClass {
  async send(payload: EmailSendPayload) {
    if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
      log('warn', 'email.skipped_missing_config', {
        to: payload.to,
        subject: payload.subject,
      });
      return { delivered: false, skipped: true };
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.RESEND_FROM_EMAIL,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        tags: payload.tags
          ? Object.entries(payload.tags).map(([name, value]) => ({ name, value }))
          : undefined,
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.text().catch(() => '');
      throw new Error(`Resend error ${response.status}: ${errorPayload || 'unknown error'}`);
    }

    return { delivered: true, skipped: false };
  }

  template(title: string, preheader: string, contentHtml: string) {
    return `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">
    ${escapeHtml(preheader)}
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 12px 28px rgba(15,23,42,0.06);">
          <tr>
            <td align="center" style="padding:30px 24px 22px;border-bottom:1px solid #f1f5f9;">
              <p style="margin:0;font-size:13px;font-weight:900;letter-spacing:0.14em;text-transform:uppercase;color:#ff6b00;">KaffePOS</p>
              <h1 style="margin:8px 0 0;font-size:22px;font-weight:900;color:#0f172a;letter-spacing:0;">${escapeHtml(title)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 30px;color:#334155;font-size:15px;line-height:1.7;">
              ${contentHtml}
            </td>
          </tr>
        </table>
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;margin-top:26px;">
          <tr>
            <td align="center" style="color:#64748b;font-size:13px;line-height:1.5;">
              <p style="margin:0 0 8px;">Butuh bantuan? Balas email ini atau hubungi tim KaffePOS.</p>
              <p style="margin:0;">Powered by KaffePOS</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `;
  }

  async sendWelcome(input: { to: string; storeName: string }) {
    const storeName = escapeHtml(input.storeName);
    const subject = 'Selamat datang di KaffePOS';
    const html = this.template(subject, 'Akun KaffePOS Anda sudah aktif.', `
      <p style="margin:0 0 18px;">Halo <strong>${storeName}</strong>, akun KaffePOS Anda sudah aktif dan siap dipakai.</p>
      <p style="margin:0 0 24px;">Lengkapi profil toko, tambahkan menu, lalu mulai transaksi pertama dari Dashboard.</p>
      <a href="${env.WEB_BASE_URL}" style="display:block;text-align:center;padding:15px 18px;background:#ff6b00;color:#ffffff;border-radius:14px;font-weight:900;text-decoration:none;">Buka KaffePOS</a>
    `);
    return this.send({
      to: input.to,
      subject,
      text: `Akun ${input.storeName} sudah aktif. Masuk ke ${env.WEB_BASE_URL} untuk mulai operasional.`,
      html,
      tags: { category: 'welcome' },
    });
  }

  async sendTrialReminder(input: { to: string; storeName: string; daysUsed: 10 | 13; daysLeft: number; trialEndsAt?: string | null }) {
    const title = input.daysUsed === 10 ? 'Trial Signature tersisa 4 hari' : 'Trial Signature tersisa 1 hari';
    const html = this.template(title, 'Pilih paket agar fitur premium tetap aktif.', `
      <p style="margin:0 0 18px;">Halo <strong>${escapeHtml(input.storeName)}</strong>, trial Signature Anda tersisa <strong>${input.daysLeft} hari</strong>.</p>
      <p style="margin:0 0 24px;">Upgrade kapan saja agar AI Insights, Gamification, Loyalty, Notification Center, dan laporan lanjutan tetap aktif.</p>
      <a href="${env.WEB_BASE_URL}/settings" style="display:block;text-align:center;padding:15px 18px;background:#ff6b00;color:#ffffff;border-radius:14px;font-weight:900;text-decoration:none;">Lihat Paket</a>
    `);
    return this.send({
      to: input.to,
      subject: title,
      text: `${title}. Upgrade agar fitur premium KaffePOS tetap aktif.`,
      html,
      tags: { category: 'trial_reminder', days_used: String(input.daysUsed) },
    });
  }

  async sendInvoiceReceipt(input: { to: string; storeName: string; planName: string; amount: number; orderId: string }) {
    const subject = `Pembayaran Berhasil: KaffePOS ${input.planName} Aktif`;
    const amount = formatRupiah(input.amount);
    const html = this.template(subject, 'Pembayaran Anda telah kami terima.', `
      <p style="margin:0 0 20px;">Terima kasih. Paket <strong>${escapeHtml(input.planName)}</strong> untuk <strong>${escapeHtml(input.storeName)}</strong> sudah aktif.</p>
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:18px;margin-bottom:24px;">
        <p style="margin:0 0 10px;color:#64748b;">Nomor Order</p>
        <p style="margin:0 0 16px;font-weight:900;color:#0f172a;">${escapeHtml(input.orderId)}</p>
        <p style="margin:0 0 10px;color:#64748b;">Total Dibayar</p>
        <p style="margin:0;font-size:20px;font-weight:900;color:#ff6b00;">${amount}</p>
      </div>
      <a href="${env.WEB_BASE_URL}" style="display:block;text-align:center;padding:15px 18px;background:#ff6b00;color:#ffffff;border-radius:14px;font-weight:900;text-decoration:none;">Buka KaffePOS</a>
    `);
    return this.send({
      to: input.to,
      subject,
      text: `Pembayaran ${input.planName} sebesar ${amount} berhasil. Order ${input.orderId}.`,
      html,
      tags: { category: 'invoice_receipt' },
    });
  }

  async sendPasswordReset(input: { to: string; resetLink: string }) {
    const subject = 'Instruksi Reset Password KaffePOS';
    const safeLink = escapeHtml(input.resetLink);
    const html = this.template(subject, 'Kami menerima permintaan reset password.', `
      <p style="margin:0 0 22px;">Kami menerima permintaan untuk mengganti password akun KaffePOS Anda.</p>
      <a href="${safeLink}" style="display:block;text-align:center;padding:15px 18px;background:#ff6b00;color:#ffffff;border-radius:14px;font-weight:900;text-decoration:none;">Ubah Password</a>
      <p style="margin:22px 0 0;color:#64748b;font-size:13px;">Jika Anda tidak meminta reset password, abaikan email ini.</p>
    `);
    return this.send({
      to: input.to,
      subject,
      text: `Klik tautan berikut untuk reset password KaffePOS: ${input.resetLink}`,
      html,
      tags: { category: 'password_reset' },
    });
  }

  async sendFeedbackThankYou(input: { to: string; category: string; storeName?: string | null }) {
    const subject = 'Terima kasih atas feedback Closed Beta';
    const html = this.template(subject, 'Feedback Anda sudah diterima tim KaffePOS.', `
      <p style="margin:0 0 18px;">Terima kasih. Feedback kategori <strong>${escapeHtml(input.category)}</strong> sudah masuk ke tim KaffePOS.</p>
      <p style="margin:0;">Masukan Anda membantu kami memoles KaffePOS sebelum rilis lebih luas.</p>
    `);
    return this.send({
      to: input.to,
      subject,
      text: `Feedback Closed Beta kategori ${input.category} sudah diterima. Terima kasih.`,
      html,
      tags: { category: 'feedback_thank_you' },
    });
  }
}

export const EmailService = new EmailServiceClass();
