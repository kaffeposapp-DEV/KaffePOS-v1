/**
 * KaffePOS Premium Email Templates
 * Branding: Brown/Orange (#C2622A)
 * 
 * Includes: Verification (OTP), Welcome, Password Reset, Daily Sales
 */

const BRAND_COLOR = '#C2622A';
const TEXT_DARK = '#1F2937';
const TEXT_MUTED = '#6B7280';

const baseLayout = (content: string, previewText: string = '') => `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>KaffePOS</title>
  <style>
    body { margin: 0; padding: 0; background-color: #EFE6DA; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color: ${TEXT_DARK}; line-height: 1.65; }
    .shell { padding: 28px 14px; }
    .container { max-width: 620px; margin: 0 auto; background: #FBF7F2; border-radius: 30px; overflow: hidden; box-shadow: 0 18px 42px rgba(90,42,23,0.12); }
    .hero { padding: 18px 30px 0; background: #FBF7F2; }
    .dots { text-align: right; margin-bottom: 18px; }
    .dot { display: inline-block; width: 14px; height: 14px; border-radius: 999px; margin-left: 8px; }
    .header { padding: 24px 34px 26px; text-align: left; background: linear-gradient(90deg, #5A2A17 0%, ${BRAND_COLOR} 58%, #F1A534 100%); }
    .wordmark { color: #FFFFFF; font-size: 42px; line-height: 1; font-weight: 800; letter-spacing: -1.6px; margin: 0; text-transform: lowercase; }
    .brand-subtitle { color: #FFFFFF; font-size: 14px; margin: 10px 0 0; }
    .content { padding: 38px 40px 42px; background: #FFFDF9; }
    .section-label { color: #9A6B33; font-size: 11px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 12px; }
    h2 { font-size: 33px; line-height: 1.12; font-weight: 800; letter-spacing: -1px; margin: 0 0 14px; color: #221814; }
    p { margin: 0 0 16px; font-size: 18px; color: #46362E; }
    .lede { font-size: 19px; color: #241A14; }
    .footer { background-color: #FBF7F2; padding: 24px 20px 28px; text-align: center; color: ${TEXT_MUTED}; font-size: 13px; }
    .footer a { color: #5A2A17; text-decoration: none; font-weight: 700; }
    .btn { display: inline-block; background: linear-gradient(90deg, #A84F23 0%, #F0A331 100%); color: #ffffff !important; padding: 16px 32px; border-radius: 18px; text-decoration: none; font-weight: 800; font-size: 16px; letter-spacing: 0.01em; margin: 18px 0 8px; }
    .otp-box { background: #F7EFE5; border: 1px solid #E8D7C4; border-radius: 22px; padding: 22px; text-align: center; margin: 28px 0; }
    .otp-code { font-size: 34px; font-weight: 800; letter-spacing: 10px; color: #4A2310; margin: 0; }
    .feature-list { margin: 28px 0; padding: 0; list-style: none; }
    .feature-item { margin-bottom: 18px; font-size: 17px; color: #5D4B3F; }
    .feature-badge { display: inline-block; width: 24px; color: #F0C676; font-weight: 700; vertical-align: top; }
    .feature-copy { display: inline-block; width: calc(100% - 30px); vertical-align: top; }
    .summary-card { background: #F7F1EA; border: 1px solid #E8DED1; border-radius: 20px; padding: 24px; margin-bottom: 24px; }
    .divider { border-top: 1px solid #DED2C4; margin: 18px 0; height: 1px; }
    .helper-card { font-size: 15px; color: #5D4B3F; background: #F8F1E8; border: 1px solid #E8DED1; border-radius: 16px; padding: 16px 18px; margin: 28px 0; }
    .micro { font-size: 13px; color: #7B6B60; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; }
    .stats-table td { vertical-align: top; }
    @media (max-width: 600px) { .shell { padding: 16px 10px; } .hero { padding: 14px 20px 0; } .header { padding: 22px 24px 24px; } .content { padding: 28px 24px 32px; } .wordmark { font-size: 36px; } h2 { font-size: 28px; } p, .lede { font-size: 17px; } }
  </style>
</head>
<body>
  <div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${previewText}</div>
  <div class="shell">
    <div class="container">
      <div class="hero">
        <div class="dots">
          <span class="dot" style="background:#5A2A17;"></span>
          <span class="dot" style="background:#DB8B2E;"></span>
          <span class="dot" style="background:#F4DEAD;"></span>
        </div>
      </div>
      <div class="header">
        <p class="wordmark">kaffe</p>
        <p class="brand-subtitle">Warm systems for modern coffee retail.</p>
      </div>
      <div class="content">
        ${content}
      </div>
      <div class="footer">
        <p style="margin: 0 0 10px;">© ${new Date().getFullYear()} KaffePOS. Atur cafemu tanpa ampas.</p>
        <p style="margin: 0; font-size: 13px;">Follow kami di <a href="https://instagram.com/kaffepos" target="_blank">Instagram @kaffepos</a></p>
      </div>
    </div>
  </div>
</body>
</html>
`;

export const getVerificationTemplate = (name: string, otp: string) => baseLayout(`
  <p class="section-label">Pendaftaran</p>
  <h2>Verifikasi akun baru Anda.</h2>
  <p class="lede">Halo <strong>${name}</strong>, satu langkah lagi dan akun KaffePOS Anda siap digunakan.</p>
  <p>Masukkan kode OTP berikut untuk menyelesaikan proses pendaftaran.</p>
  
  <div class="otp-box">
    <p class="micro" style="text-transform: uppercase; letter-spacing: 0.14em; margin-bottom: 10px;">Kode Verifikasi</p>
    <div class="otp-code">${otp}</div>
  </div>
  
  <div class="helper-card">Kode ini berlaku selama 10 menit. Jika kamu tidak merasa mendaftar, email ini bisa diabaikan dengan aman.</div>
`, `Kode verifikasi KaffePOS kamu: ${otp}`);

export const getWelcomeTemplate = (name: string) => baseLayout(`
  <p class="section-label">Welcome</p>
  <h2>Akun Anda sudah aktif.</h2>
  <p class="lede">Halo <strong>${name}</strong>, sekarang Anda sudah bisa masuk dan mulai menjalankan operasional toko dengan lebih rapi.</p>
  <p>KaffePOS dirancang untuk membantu transaksi harian, laporan, dan pengelolaan menu tetap terasa ringan dipakai setiap hari.</p>
  
  <ul class="feature-list">
    <li class="feature-item"><span class="feature-badge">01</span><span class="feature-copy"><strong>Manajemen menu yang tertata.</strong> Tambahkan produk dan kategori dengan cepat.</span></li>
    <li class="feature-item"><span class="feature-badge">02</span><span class="feature-copy"><strong>Laporan yang mudah dibaca.</strong> Pantau penjualan kapan pun dibutuhkan.</span></li>
    <li class="feature-item"><span class="feature-badge">03</span><span class="feature-copy"><strong>Insight yang relevan.</strong> Gunakan saran untuk mengambil keputusan operasional.</span></li>
  </ul>
  
  <div style="text-align: center;">
    <a href="https://kaffepos.app" class="btn">Masuk ke Dashboard</a>
  </div>
`, 'Selamat datang di KaffePOS! Akun kamu sudah aktif.');

export const getPasswordResetTemplate = (name: string, link: string) => baseLayout(`
  <p class="section-label">Security</p>
  <h2>Atur ulang kata sandi Anda.</h2>
  <p class="lede">Halo <strong>${name}</strong>, kami menerima permintaan untuk mengatur ulang kata sandi akun KaffePOS Anda.</p>
  <p>Untuk melanjutkan, gunakan tombol berikut. Tautan ini akan membawa Anda ke halaman penggantian password.</p>
  
  <div style="text-align: center;">
    <a href="${link}" class="btn">Atur Ulang Password</a>
  </div>
  
  <p class="micro" style="margin-bottom: 6px;">Jika tombol tidak terbuka, salin link berikut ke browser:</p>
  <p style="font-size: 13px; word-break: break-all; color: ${BRAND_COLOR}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;">${link}</p>
  
  <div class="helper-card">Jika Anda tidak meminta penggantian password, abaikan email ini. Kata sandi akun tidak akan berubah.</div>
`, 'Permintaan reset password akun KaffePOS kamu.');

export const getDailySalesTemplate = (name: string, summary: { totalIncome: string, totalOrders: number, topProduct: string, date: string }) => baseLayout(`
  <p class="section-label">Daily Report</p>
  <h2>Laporan penjualan harian.</h2>
  <p class="lede">Halo <strong>${name}</strong>, berikut ringkasan performa toko Anda untuk hari ini.</p>
  <p class="micro" style="margin-bottom: 24px;">${summary.date}</p>
  
  <div class="summary-card">
    <p class="micro" style="margin: 0;">Total Pendapatan</p>
    <p style="font-size: 34px; font-weight: 700; color: #241A14; margin: 6px 0 16px;">${summary.totalIncome}</p>
    
    <div class="divider"></div>
    
    <table width="100%" class="stats-table" cellspacing="0" cellpadding="0"><tr>
      <td width="50%" style="padding-right: 10px;">
        <p class="micro" style="margin: 0;">Total Pesanan</p>
        <p style="font-size: 18px; font-weight: 700; margin: 4px 0; color: #241A14;">${summary.totalOrders}</p>
      </td>
      <td width="50%" style="padding-left: 10px;">
        <p class="micro" style="margin: 0;">Produk Terlaris</p>
        <p style="font-size: 18px; font-weight: 700; margin: 4px 0; color: #241A14;">${summary.topProduct}</p>
      </td>
    </tr></table>
  </div>
  
  <div class="helper-card"><strong style="color: ${TEXT_DARK};">Catatan:</strong> Penjualan hari ini cukup stabil. Pertimbangkan promo singkat pada jam sibuk untuk mendorong repeat order besok.</div>
  
  <div style="text-align: center;">
    <a href="https://kaffepos.app" class="btn">Lihat Detail Laporan</a>
  </div>
`, `Laporan penjualan harian: ${summary.totalIncome} dari ${summary.totalOrders} pesanan.`);
