# Affiliate & Referral Program - KaffePOS

## Overview

KaffePOS Affiliate & Referral Program memungkinkan user untuk mendapatkan reward dengan mengajak teman dan menjadi affiliate untuk mendapatkan komisi dari customer baru.

## Features

### 1. Referral Program (Untuk Semua User)
- Setiap user bisa generate referral code unik
- Bonus Rp150.000 untuk setiap teman yang berlangganan paket berbayar dan aktif 30 hari
- Tracking clicks, registrations, dan paid conversions
- Share via link atau native share API

### 2. Affiliate Program (Perlu Approval)
- Komisi 20% dari pembayaran pertama customer
- Dashboard real-time untuk tracking performance
- Payout via transfer bank
- Admin approval required

## Database Schema

### Tables
- `referral_codes` - Kode referral unik per user
- `referral_clicks` - Tracking klik referral link
- `referral_registrations` - Tracking registrasi dari referral
- `affiliate_profiles` - Profile affiliate dengan status approval
- `commission_transactions` - Transaksi komisi affiliate
- `commission_payouts` - Payout komisi ke affiliate
- `affiliate_terms_acceptances` - Record persetujuan terms

### Row Level Security (RLS)
Semua tabel menggunakan RLS dengan `FORCE ROW LEVEL SECURITY` untuk memastikan:
- User hanya bisa akses data mereka sendiri
- Admin bypass RLS via backend dengan `SET LOCAL app.current_user_id`

## API Endpoints

### Public
- `GET /ref/:code` - Track click dan redirect ke landing page

### User (Authenticated)
- `GET /api/referrals/me` - Get referral stats
- `POST /api/referrals/generate` - Generate referral code
- `GET /api/affiliate/me` - Get affiliate dashboard
- `POST /api/affiliate/apply` - Apply for affiliate program
- `PATCH /api/affiliate/me/payout` - Update payout details
- `GET /api/affiliate/commissions` - Get commissions

### Admin
- `GET /api/admin/affiliates` - List all affiliates
- `PATCH /api/admin/affiliates/:id/status` - Update affiliate status
- `GET /api/admin/referrals` - List all referrals
- `GET /api/admin/commissions` - List all commissions
- `PATCH /api/admin/commissions/:id/approve` - Approve commission
- `PATCH /api/admin/commissions/:id/reject` - Reject commission
- `PATCH /api/admin/commissions/:id/mark-paid` - Mark as paid

## Integration Points

### 1. Registration Flow
```typescript
// backend/src/routes/auth.ts
// After successful registration, track referral
const referralCode = req.cookies?.kpos_ref || req.query?.ref;
if (referralCode) {
  await handleReferralRegistration(pool, userId, referralCode);
}
```

### 2. Payment Webhook
```typescript
// backend/src/routes/webhooks.ts
// After subscription activation, create commission
await handleAffiliateCommissionOnPayment(
  client,
  pool,
  userId,
  paymentAmount,
  orderId
);
```

### 3. Analytics Tracking
```typescript
// Track events via Google Analytics
gtag('event', 'referral_code_copied', { referral_code });
gtag('event', 'referral_link_shared', { referral_code });
gtag('event', 'affiliate_application_submitted', { payout_method });
gtag('event', 'commission_created', { commission_id });
```

## Frontend Components

### User Components
- `ReferralCard` - Display referral code, stats, dan share buttons
- `AffiliateDashboard` - Dashboard untuk affiliate dengan stats dan commissions
- `AffiliateApplyForm` - Form aplikasi affiliate program

### Admin Components
- `AdminCommissionTable` - Manage commissions (approve/reject/mark paid)
- `AdminAffiliateList` - Manage affiliate status
- `AdminReferralList` - View all referrals

## Security & Anti-Abuse

### Preventions
1. **Self-referral** - Dicegah di database level (referrer_user_id != referred_user_id)
2. **Duplicate referral** - UNIQUE constraint pada `referred_user_id`
3. **Fake referral** - Commission hanya dibuat setelah payment success
4. **Double commission** - UNIQUE constraint pada `referral_registration_id`

### RLS Policies
- User hanya bisa lihat referral/commission mereka sendiri
- Admin akses via backend dengan proper authentication
- Sensitive payout details tidak di-expose ke frontend

## Commission Flow

1. User A mengajak User B dengan referral code
2. User B register dan referral_registration dibuat
3. User B subscribe paket berbayar
4. Payment webhook trigger `handleAffiliateCommissionOnPayment`
5. Jika User A adalah affiliate aktif, commission dibuat dengan status `eligible`
6. Admin review dan approve commission
7. Setelah 30 hari, admin mark commission as `paid`
8. Payout dilakukan via transfer bank

## Deployment Checklist

### Database
- [ ] Run migration: `database/affiliate-referral-migration.sql`
- [ ] Verify RLS policies active
- [ ] Test helper functions: `generate_referral_code()`, `update_affiliate_stats()`

### Backend
- [ ] Deploy backend with new routes
- [ ] Verify webhook integration working
- [ ] Test referral registration on signup
- [ ] Test commission creation on payment

### Frontend
- [ ] Deploy frontend with new components
- [ ] Test referral code generation
- [ ] Test affiliate application flow
- [ ] Test admin commission management

### Analytics
- [ ] Verify GA4 events firing
- [ ] Setup conversion tracking for referrals
- [ ] Setup dashboard for affiliate metrics

## Testing

### Manual Testing
```bash
# Test referral click tracking
curl https://api.kaffepos.my.id/ref/KPOS123ABC

# Test referral stats
curl -H "Authorization: Bearer $TOKEN" \
  https://api.kaffepos.my.id/api/referrals/me

# Test affiliate dashboard
curl -H "Authorization: Bearer $TOKEN" \
  https://api.kaffepos.my.id/api/affiliate/me

# Test admin commission list
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://api.kaffepos.my.id/api/admin/commissions
```

### Integration Testing
1. Create user A, generate referral code
2. Create user B via referral link
3. Verify referral_registration created
4. User B subscribe and pay
5. Verify commission created
6. Admin approve commission
7. Verify stats updated

## Monitoring

### Key Metrics
- Total referral clicks
- Referral conversion rate (registration / clicks)
- Paid conversion rate (paid / registrations)
- Average commission per affiliate
- Commission approval rate
- Payout processing time

### Alerts
- Commission creation failures
- Referral registration failures
- Unusual referral patterns (potential abuse)
- High rejection rate

## Future Enhancements

1. **Automated Payout** - Integrate with payment gateway for auto payout
2. **Tiered Commission** - Different rates based on performance
3. **Recurring Commission** - Commission on recurring subscriptions
4. **Referral Leaderboard** - Gamification for top referrers
5. **Custom Landing Pages** - Personalized landing pages per affiliate
6. **Email Notifications** - Auto notify on commission status changes
7. **Payout History** - Detailed payout history and invoices

## Support

For issues or questions:
- Technical: Check logs in backend for `affiliate.*` events
- Business: Review commission status and rejection reasons
- Abuse: Check referral patterns and IP addresses in `referral_clicks`
