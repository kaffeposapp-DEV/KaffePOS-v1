const fs = require('fs');

let content = fs.readFileSync('backend/src/index.ts', 'utf-8');

const oldRegex = /async function sendSignupOtpEmail[\s\S]*?logEmailDelivered\('email.password_changed_sent', \{[\s\S]*?\}\);\n}/m;

const newContent = `function buildEmailTemplate(title: string, preheader: string, contentHtml: string) {
  return \`
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>\${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
  <div style="display:none;font-size:1px;color:#f8fafc;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    \${preheader}
  </div>
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:24px;border:1px solid #e2e8f0;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.05);">
          <tr>
            <td align="center" style="padding:32px 24px 24px;border-bottom:1px solid #f1f5f9;">
              <h1 style="margin:0;font-size:24px;font-weight:900;color:#0f172a;letter-spacing:-0.5px;">KaffePOS</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 32px;color:#334155;font-size:15px;line-height:1.6;">
              \${contentHtml}
            </td>
          </tr>
        </table>
        <table width="100%" max-width="600" border="0" cellspacing="0" cellpadding="0" style="max-width:600px;margin-top:32px;">
          <tr>
            <td align="center" style="color:#64748b;font-size:13px;line-height:1.5;">
              <p style="margin:0 0 8px;">Butuh bantuan? Balas email ini atau hubungi tim KaffePOS.</p>
              <p style="margin:0;">&copy; \${new Date().getFullYear()} KaffePOS Indonesia. Hak cipta dilindungi.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  \`;
}

async function sendSignupOtpEmail(email: string, code: string, storeName: string) {
  const subject = \\\`🔑 Kode Verifikasi KaffePOS: \\\${code}\\\`;
  const text = \\\`Halo, kode verifikasi untuk akun \\\${storeName} adalah \\\${code}. Kode ini berlaku \\\${env.EMAIL_CODE_TTL_MINUTES} menit.\\\`;
  const preheader = 'Gunakan kode ini untuk masuk ke akun Anda. Berlaku selama 5 menit...';
  const html = buildEmailTemplate(subject, preheader, \\\`
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Verifikasi akun Anda</h2>
    <p style="margin:0 0 24px;">Halo <strong>\\\${storeName}</strong>, ini kunci masuk sementara Anda. Jangan bagikan kode ini kepada kasir Anda atau siapapun.</p>
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="margin:0;font-size:36px;font-weight:900;letter-spacing:8px;color:#0f172a;">\\\${code}</p>
    </div>
    <p style="margin:0;font-size:14px;color:#64748b;">Kode ini berlaku \\\${env.EMAIL_CODE_TTL_MINUTES} menit. Jika Anda tidak merasa melakukan pendaftaran, abaikan email ini.</p>
  \\\`);

  await sendEmail({ to: email, subject, text, html });
  logEmailDelivered('email.verification_code_sent', { email, purpose: 'signup', storeName });
}

async function sendPasswordResetEmail(email: string, resetLink: string) {
  const subject = '🔐 Instruksi Reset Password KaffePOS';
  const text = \\\`Klik tautan berikut untuk mereset password akun KaffePOS Anda: \\\${resetLink}\\\`;
  const preheader = 'Kami menerima permintaan untuk mereset password akun Anda...';
  const html = buildEmailTemplate(subject, preheader, \\\`
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Reset Password</h2>
    <p style="margin:0 0 24px;">Kami menerima permintaan untuk melakukan perubahan password pada akun KaffePOS Anda.</p>
    <a href="\\\${resetLink}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Ubah Password Sekarang</a>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Jika tombol di atas tidak berfungsi, salin dan tempel tautan ini ke browser Anda: <br><a href="\\\${resetLink}" style="color:#2563eb;word-break:break-all;">\\\${resetLink}</a></p>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Jika Anda tidak melakukan permintaan ini, abaikan email ini dan akun Anda akan tetap aman.</p>
  \\\`);

  await sendEmail({ to: email, subject, text, html });
  logEmailDelivered('email.password_reset_sent', { email, purpose: 'reset_password' });
}

async function sendWelcomeEmail(email: string, storeName: string) {
  const subject = '👋 Selamat datang di ekosistem KaffePOS!';
  const text = \\\`Akun \\\${storeName} sudah aktif. Masuk ke \\\${env.WEB_BASE_URL} untuk mulai operasional.\\\`;
  const preheader = 'Langkah pertama untuk manajemen kasir yang lebih profesional...';
  const html = buildEmailTemplate(subject, preheader, \\\`
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Selamat datang di KaffePOS</h2>
    <p style="margin:0 0 24px;">Akun bisnis <strong>\\\${storeName}</strong> sudah aktif dan siap dipakai. Ini adalah langkah pertama menuju manajemen kasir yang lebih rapi dan terukur.</p>
    <a href="\\\${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka Dashboard KaffePOS</a>
    <p style="margin:24px 0 0;font-size:14px;color:#64748b;">Langkah selanjutnya: Lengkapi profil toko Anda, tambahkan menu, dan Anda siap bertransaksi!</p>
  \\\`);

  await sendEmail({ to: email, subject, text, html });
  logEmailDelivered('email.welcome_sent', { email, storeName });
}

async function sendPasswordChangedEmail(email: string) {
  const subject = '✅ Password KaffePOS Berhasil Diperbarui';
  const text = \\\`Password akun KaffePOS Anda sudah berhasil diperbarui. Jika ini bukan Anda, segera hubungi tim KaffePOS.\\\`;
  const preheader = 'Password akun KaffePOS Anda baru saja diganti...';
  const html = buildEmailTemplate(subject, preheader, \\\`
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Password Berhasil Diperbarui</h2>
    <p style="margin:0 0 24px;">Password akun KaffePOS Anda baru saja berhasil diganti.</p>
    <a href="\\\${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#0f172a;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka KaffePOS</a>
    <div style="margin:24px 0 0;padding:16px;background:#fff1f2;border-radius:12px;">
      <p style="margin:0;font-size:14px;color:#be123c;"><strong>Penting:</strong> Jika Anda merasa tidak mengganti password ini, segera hubungi tim Support KaffePOS untuk mengamankan akun Anda.</p>
    </div>
  \\\`);

  await sendEmail({ to: email, subject, text, html });
  logEmailDelivered('email.password_changed_sent', { email, purpose: 'password_changed' });
}

async function sendPaymentSuccessEmail(email: string, storeName: string, planName: string, amount: number, orderId: string) {
  const subject = \\\`✅ Pembayaran Berhasil: KaffePOS \\\${planName} Aktif\\\`;
  const text = \\\`Pembayaran langganan \\\${planName} sudah diterima. Akun \\\${storeName} sekarang aktif dan siap dipakai.\\\`;
  const preheader = 'Terima kasih! Pembayaran Anda telah kami terima dan fitur premium sudah aktif...';
  
  const formattedAmount = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(amount);
  
  const html = buildEmailTemplate(subject, preheader, \\\`
    <h2 style="margin:0 0 16px;color:#0f172a;font-size:20px;">Pembayaran Berhasil</h2>
    <p style="margin:0 0 24px;">Terima kasih! Dana Anda sudah kami terima. Paket <strong>\\\${planName}</strong> untuk outlet <strong>\\\${storeName}</strong> resmi aktif.</p>
    
    <div style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:20px;margin-bottom:24px;">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#64748b;font-size:14px;">Nomor Order</span>
        <span style="color:#0f172a;font-size:14px;font-weight:600;">\\\${orderId}</span>
      </div>
      <div style="display:flex;justify-content:space-between;margin-bottom:12px;">
        <span style="color:#64748b;font-size:14px;">Paket</span>
        <span style="color:#0f172a;font-size:14px;font-weight:600;">\\\${planName}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding-top:12px;border-top:1px dashed #cbd5e1;">
        <span style="color:#64748b;font-size:14px;font-weight:600;">Total Dibayar</span>
        <span style="color:#0f172a;font-size:14px;font-weight:900;">\\\${formattedAmount}</span>
      </div>
    </div>
    
    <p style="margin:0 0 24px;">Semua fitur premium seperti sinkronisasi cloud penuh dan koneksi printer pintar sudah dapat Anda nikmati sekarang.</p>
    <a href="\\\${env.WEB_BASE_URL}" style="display:block;width:100%;text-align:center;padding:16px 20px;background:#10b981;color:#ffffff;border-radius:12px;font-weight:bold;text-decoration:none;box-sizing:border-box;">Buka KaffePOS Sekarang</a>
  \\\`);

  await sendEmail({ to: email, subject, text, html });
  logEmailDelivered('email.payment_success_sent', { email, orderId, planName });
}`;

if (!oldRegex.test(content)) {
  console.log("Could not find old email functions");
  process.exit(1);
}

content = content.replace(oldRegex, newContent);

// Also replace the midtrans webhook settlement email
const webhookOldRegex = /if \(result\.activationResult\?\.email\) \{[\s\S]*?log\('warn', 'email\.midtrans_settlement_failed'[\s\S]*?\}\);[\s\S]*?\}/;
const webhookNewContent = `if (result.activationResult?.email) {
      await sendPaymentSuccessEmail(
        result.activationResult.email,
        result.activationResult.displayName ?? 'KaffePOS User',
        result.activationResult.plan.toUpperCase(),
        result.activationResult.paymentAmount,
        payload.order_id
      ).catch((error) => {
        log('warn', 'email.midtrans_settlement_failed', { error: serializeError(error), orderId: payload.order_id });
      });
    }`;

if (!webhookOldRegex.test(content)) {
  console.log("Could not find webhook email block");
  process.exit(1);
}

content = content.replace(webhookOldRegex, webhookNewContent);

fs.writeFileSync('backend/src/index.ts', content, 'utf-8');
console.log("Emails updated successfully");
