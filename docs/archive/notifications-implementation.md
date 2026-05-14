# Push Notifications + Notification Center

## Database Schema

Migration: `backend/migrations/20260511_0001_notifications_center.sql`

- `public.notifications`
  - `id uuid primary key`
  - `user_id uuid not null`
  - `store_id uuid`
  - `title text not null`
  - `message text not null`
  - `type text not null default 'system'`
  - `is_read boolean not null default false`
  - `metadata jsonb not null default '{}'::jsonb`
  - `created_at timestamptz not null default now()`
- `public.notification_push_subscriptions`
  - stores Web Push subscriptions and Capacitor Android push tokens.

Run:

```bash
npm --prefix backend run migrate
```

## Backend API

- `GET /api/notifications?limit=80`
- `POST /api/notifications/mark-read`
- `PATCH /api/notifications/read-all` remains for backward compatibility.
- `POST /api/notifications/push-subscription`

`POST /api/notifications/mark-read` accepts:

```json
{ "ids": ["notification-uuid"], "storeId": "store-uuid" }
```

Omit `ids` to mark all unread notifications for the signed-in user as read.

## Frontend Components

- `src/components/notifications/NotificationBell.tsx`
- `src/components/notifications/NotificationCenter.tsx`
- `src/components/notifications/NotificationCard.tsx`

The bell is mounted in `AppShell` and the Settings notification entry reuses the same center.

## Integration Examples

Challenge completion:

```ts
await insertNotification(
  client,
  userId,
  'Misi harian selesai',
  `${challenge.title} selesai. +${challenge.points_reward} poin performa.`,
  'challenge',
  { category: 'challenges', challengeId: challenge.id },
  storeId,
);
```

Low stock after checkout is handled in `backend/src/routes/transactions.ts` by checking deducted inventory rows where `stock <= min_stock`.

Loyalty reward reached is handled in `backend/src/routes/loyalty.ts` when a passport crosses the configured stamp threshold.

For a new soft upgrade prompt:

```ts
await insertNotification(
  client,
  ownerId,
  'Upgrade tersedia',
  'Outlet sudah aktif. Paket Signature membuka laporan lanjutan dan AI Insight.',
  'upgrade',
  { category: 'system', trigger: 'soft_upgrade' },
  storeId,
);
```

## Push Setup

Web Push:

1. Set `VITE_WEB_PUSH_PUBLIC_KEY`.
2. Keep `public/sw.js` registered by the app.
3. Click `Aktifkan` in Notification Center to save the browser subscription.

Capacitor Android:

1. Install and sync `@capacitor/push-notifications` before release builds.
2. Configure Firebase Cloud Messaging for Android.
3. Click `Aktifkan` in Notification Center to request permission and save the Android token.

In-app notifications work without push. Read-state changes are queued locally while offline and retried when Notification Center opens again.
