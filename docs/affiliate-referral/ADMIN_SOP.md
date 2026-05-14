# KaffePOS Affiliate & Referral Admin SOP

## 1. Purpose

SOP ini menjadi panduan admin untuk mengelola referral, affiliate, komisi, payout, fraud review, refund/cancel, dispute, dan emergency disable Affiliate & Referral Program KaffePOS. SOP ini wajib dipakai bersama SRS, PRD, Feature Registry, Product Changelog, dan Release Checklist.

## 2. Roles

- **Super Admin**: mengambil keputusan final untuk fraud besar, dispute besar, payout besar, feature flag, dan eskalasi hukum/tax.
- **Finance Admin**: memverifikasi komisi eligible/approved, memproses payout manual, menyimpan payout reference, dan menjaga catatan payout.
- **Support Admin**: menerima pertanyaan/dispute affiliate, mengecek status referral/komisi, dan memberi respons awal.
- **Product/Admin Ops**: memantau KPI, anomali, dashboard admin, feedback, dan operasional harian.

## 3. Daily Checklist

- Cek affiliate application baru.
- Cek pending commission dan eligible commission.
- Cek rejected/cancelled payment yang memengaruhi komisi.
- Cek suspicious referral activity: lonjakan klik, pendaftaran, atau conversion abnormal.
- Cek payout request/approved commission yang sudah memenuhi minimum Rp250.000.
- Cek Midtrans webhook error, duplicate webhook, dan signature failure.
- Cek admin action log untuk status affiliate, approval/rejection commission, dan mark paid.

## 4. Affiliate Approval SOP

1. Buka halaman Admin Affiliate.
2. Filter status `pending`.
3. Buka detail affiliate profile.
4. Review user, affiliate code, tanggal apply, dan status terms acceptance.
5. Review payout info completeness; lihat masked account only.
6. Review traffic/source jika tersedia.
7. Approve/activate jika valid, atau reject jika invalid/spam/fraud.
8. Tambahkan admin note untuk keputusan manual atau rejection.

Approval criteria:

- User terlihat real dan punya penggunaan wajar.
- Sumber promosi jelas atau bisa dijelaskan.
- Payout information lengkap dan masuk akal.
- Tidak ada pola self-referral, spam, fake account, atau abuse.

Reject criteria:

- Fake account atau identitas tidak wajar.
- Spam behavior atau misleading promotion.
- Data payout tidak lengkap/suspicious.
- Pola referral terlihat fraud.
- Affiliate melanggar aturan promosi KaffePOS.

## 5. Commission Approval SOP

1. Buka halaman Admin Commission.
2. Filter status `eligible`.
3. Buka detail komisi.
4. Verifikasi referred user sudah membayar.
5. Verifikasi payment valid dan backend-verified.
6. Verifikasi tidak ada refund/cancel/fraud status.
7. Verifikasi tidak ada duplicate commission untuk referral/payment/type.
8. Approve commission jika semua valid.
9. Tambahkan note untuk manual exception.

Rules:

- Jangan approve sebelum 30-day eligibility kecuali owner/super admin menyetujui.
- Jangan approve commission yang mencurigakan.
- Jangan approve berdasarkan screenshot/customer claim tanpa data backend.
- Manual exception wajib punya admin note.

## 6. Commission Rejection SOP

Reject commission jika ada:

- Refund atau cancel.
- Fake account.
- Self-referral.
- Duplicate account.
- Suspicious same IP hash/device/user agent.
- Affiliate spam atau misleading campaign.
- Payment invalid, fraud, deny, expire, cancel, atau chargeback risk.

Required:

- Rejection note wajib diisi.
- Jangan hapus commission record.
- Pastikan status berubah ke `rejected`, bukan hard delete.
- Jika perlu review lanjutan, suspend affiliate sementara dan eskalasi.

## 7. Payout SOP

1. Filter commission status `approved`.
2. Hitung total approved commission per affiliate.
3. Pastikan minimum payout Rp250.000 terpenuhi.
4. Verifikasi payout profile; gunakan masked account di UI dan sumber aman internal sesuai kebijakan finance.
5. Proses payout manual lewat kanal finance yang disetujui.
6. Simpan payout reference.
7. Mark commission as paid hanya setelah dana benar-benar dikirim.
8. Tambahkan payout note yang jelas.

Rules:

- Jangan expose payout account publicly.
- Jangan mark paid sebelum transfer sukses.
- Simpan payout reference.
- Jangan ubah paid commission tanpa approval super admin.

## 8. Fraud Review SOP

Check:

- Same IP hash pattern pada banyak click/registration.
- Terlalu banyak referral dalam waktu pendek.
- Repeated failed payments.
- Same device/user agent yang berulang.
- Suspicious email pattern.
- High refund/cancel rate.
- Affiliate dengan conversion rate abnormal.
- Referral dari user baru yang tidak punya aktivitas wajar.

Action:

- Hold commission di status pending/eligible.
- Reject commission jika bukti cukup.
- Suspend affiliate jika pola abuse jelas.
- Eskalasi ke owner/super admin untuk kasus besar.
- Simpan admin note dan ID terkait.

## 9. Dispute Handling SOP

Jika affiliate dispute commission:

1. Catat affiliate ID, referral ID, commission ID, dan payment reference.
2. Cek referral registration.
3. Cek payment history dan status Midtrans.
4. Cek commission status dan timeline.
5. Cek admin notes.
6. Cek refund/cancel/fraud status.
7. Respons dengan alasan jelas dan ringkas.
8. Update admin note jika ada informasi baru.
9. Eskalasi jika nominal/situasi memenuhi aturan eskalasi.

## 10. Refund/Cancel SOP

Jika payment refunded/cancelled:

- Cancel unpaid commission.
- Jika commission sudah paid, flag for manual review.
- Jangan delete financial record.
- Tambahkan admin note berisi payment reference, status, dan tindakan.
- Jika fraud berulang, suspend affiliate dan eskalasi.

## 11. Emergency Disable SOP

Jika abuse terjadi:

1. Set feature flags:
   - `REFERRAL_ENABLED=false`
   - `AFFILIATE_ENABLED=false`
   - `REFERRAL_COMMISSION_CREATION_ENABLED=false`
2. Jika admin action perlu dihentikan, set `ADMIN_COMMISSION_ENABLED=false`.
3. Keep payment webhook active untuk subscription/payment normal.
4. Jangan delete database records.
5. Hide frontend menus dengan frontend flags:
   - `VITE_REFERRAL_ENABLED=false`
   - `VITE_AFFILIATE_ENABLED=false`
   - `VITE_ADMIN_COMMISSION_ENABLED=false`
6. Investigate logs dan database records.
7. Buat incident note sebelum enable ulang.

## 12. Admin Notes Standard

Gunakan format:

```text
Action: approve/reject/paid/suspend/manual-review
Reason: alasan singkat
Related IDs: affiliate_id=..., referral_id=..., commission_id=..., payment_id=...
Admin: nama/id admin
Date: YYYY-MM-DD HH:mm TZ
```

Rules:

- Jangan masukkan raw payout account number.
- Jangan masukkan password/token/secret.
- Jangan masukkan data sensitif yang tidak diperlukan.
- Gunakan ID dan status untuk audit.

## 13. KPI Review

Weekly review:

- Referral conversion rate.
- Affiliate conversion rate.
- Commission payout ratio.
- Fraud rate.
- Refund/cancel rate.
- LTV of referred users.
- CAC from affiliate channel.
- High-volume affiliate quality.
- Pending/eligible/approved/paid commission aging.

## 14. Escalation Rules

Escalate to owner/super admin if:

- Payout dispute above Rp500.000.
- Suspected organized fraud.
- High-value partner issue.
- Payment webhook inconsistency.
- Legal/tax concern.
- Paid commission needs reversal/manual recovery.
- Affiliate threatens public/legal escalation.
