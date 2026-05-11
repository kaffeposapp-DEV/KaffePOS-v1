/**
 * Digital Loyalty routes — Kopi Passport, points, rewards, redemption.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  ApiError,
  assertStoreOwned,
  buildPaginationMeta,
  buildUpdateClause,
  insertNotification,
  parsePaginationQuery,
  pickDefined,
  requirePermission,
  toNumber,
  withTransaction,
  type PoolClient,
} from '../core';

const router = Router();
const storeIdSchema = z.string().uuid();
const rewardTypeSchema = z.enum(['discount_amount', 'discount_percent', 'free_item']);
const tierSchema = z.enum(['regular', 'kopi_lover', 'vvip']);

const settingsSchema = z.object({
  store_id: z.string().uuid(),
  stamps_required: z.number().int().min(2).max(20).optional(),
  points_per_rupiah: z.number().min(0).max(1).optional(),
  minimum_transaction_amount: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const passportSchema = z.object({
  store_id: z.string().uuid(),
  customer_name: z.string().trim().max(120).optional().nullable(),
  customer_phone: z.string().trim().min(4).max(32),
});

const stampSchema = z.object({
  store_id: z.string().uuid(),
  passport_id: z.string().uuid().optional(),
  customer_name: z.string().trim().max(120).optional().nullable(),
  customer_phone: z.string().trim().min(4).max(32).optional(),
  transaction_id: z.string().trim().max(120).optional().nullable(),
  transaction_amount: z.number().int().min(0).default(0),
  stamps_earned: z.number().int().min(0).optional(),
  note: z.string().trim().max(240).optional().nullable(),
  idempotency_key: z.string().trim().max(160).optional().nullable(),
});

const rewardSchema = z.object({
  store_id: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(240).optional().nullable(),
  type: rewardTypeSchema,
  reward_value: z.number().int().min(0).default(0),
  points_or_stamps_needed: z.number().int().min(0).optional(),
  points_cost: z.number().int().min(0).default(0),
  stamps_cost: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

const redeemSchema = z.object({
  store_id: z.string().uuid(),
  passport_id: z.string().uuid(),
  reward_id: z.string().uuid(),
  transaction_id: z.string().trim().max(120).optional().nullable(),
  transaction_amount: z.number().int().min(0).default(0),
  idempotency_key: z.string().trim().max(160).optional().nullable(),
});

const redeemCompatSchema = z.object({
  store_id: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  passport_id: z.string().uuid().optional(),
  reward_id: z.string().uuid(),
  transaction_id: z.string().trim().max(120).optional().nullable(),
  transaction_amount: z.number().int().min(0).default(0),
  idempotency_key: z.string().trim().max(160).optional().nullable(),
});

const stampCompatSchema = z.object({
  store_id: z.string().uuid().optional(),
  storeId: z.string().uuid().optional(),
  customer_id: z.string().uuid().optional(),
  passport_id: z.string().uuid().optional(),
  name: z.string().trim().max(120).optional().nullable(),
  customer_name: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().min(4).max(32).optional(),
  customer_phone: z.string().trim().min(4).max(32).optional(),
  transaction_id: z.string().trim().max(120).optional().nullable(),
  transaction_amount: z.number().int().min(0).default(0),
  stamps_earned: z.number().int().min(0).optional(),
  note: z.string().trim().max(240).optional().nullable(),
  idempotency_key: z.string().trim().max(160).optional().nullable(),
});

const rewardPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(240).optional().nullable(),
  type: rewardTypeSchema.optional(),
  reward_value: z.number().int().min(0).optional(),
  points_or_stamps_needed: z.number().int().min(0).optional(),
  points_cost: z.number().int().min(0).optional(),
  stamps_cost: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

function normalizePhone(input: string) {
  const trimmed = input.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return `${hasPlus ? '+' : ''}${digits}`;
}

function serializeSettings(row: Record<string, unknown>) {
  return {
    store_id: String(row.store_id),
    stamps_required: Math.max(2, Math.round(toNumber(row.stamps_required) || 8)),
    points_per_rupiah: toNumber(row.points_per_rupiah),
    minimum_transaction_amount: Math.max(0, Math.round(toNumber(row.minimum_transaction_amount))),
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeReward(row: Record<string, unknown>) {
  const pointsCost = Math.max(0, Math.round(toNumber(row.points_cost)));
  const stampsCost = Math.max(0, Math.round(toNumber(row.stamps_cost)));
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    name: String(row.name ?? ''),
    description: row.description == null ? null : String(row.description),
    type: rewardTypeSchema.catch('discount_amount').parse(row.type),
    reward_value: Math.max(0, Math.round(toNumber(row.reward_value))),
    points_or_stamps_needed: Math.max(0, Math.round(toNumber(row.points_or_stamps_needed) || Math.max(pointsCost, stampsCost))),
    points_cost: pointsCost,
    stamps_cost: stampsCost,
    is_active: row.is_active !== false,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializePassport(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    customer_name: row.customer_name == null ? null : String(row.customer_name),
    customer_phone: String(row.customer_phone ?? ''),
    tier: tierSchema.catch('regular').parse(row.tier),
    total_stamps: Math.max(0, Math.round(toNumber(row.total_stamps))),
    available_stamps: Math.max(0, Math.round(toNumber(row.available_stamps))),
    total_points: Math.max(0, Math.round(toNumber(row.total_points))),
    available_points: Math.max(0, Math.round(toNumber(row.available_points))),
    lifetime_spend: Math.max(0, Math.round(toNumber(row.lifetime_spend))),
    last_visit_at: row.last_visit_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeStampEvent(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    passport_id: String(row.passport_id),
    transaction_id: row.transaction_id == null ? null : String(row.transaction_id),
    stamps: Math.max(0, Math.round(toNumber(row.stamps))),
    points: Math.max(0, Math.round(toNumber(row.points))),
    transaction_amount: Math.max(0, Math.round(toNumber(row.transaction_amount))),
    note: row.note == null ? null : String(row.note),
    created_at: row.created_at,
  };
}

function serializeCustomer(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    name: row.name == null ? null : String(row.name),
    phone: String(row.phone ?? ''),
    tier: tierSchema.catch('regular').parse(row.tier),
    total_points: Math.max(0, Math.round(toNumber(row.total_points))),
    total_visits: Math.max(0, Math.round(toNumber(row.total_visits))),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeTier(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    store_id: row.store_id == null ? null : String(row.store_id),
    name: String(row.name ?? 'Regular'),
    min_visits: Math.max(0, Math.round(toNumber(row.min_visits))),
    benefits: row.benefits ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeRedemption(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    passport_id: String(row.passport_id),
    reward_id: String(row.reward_id),
    transaction_id: row.transaction_id == null ? null : String(row.transaction_id),
    points_spent: Math.max(0, Math.round(toNumber(row.points_spent))),
    stamps_spent: Math.max(0, Math.round(toNumber(row.stamps_spent))),
    discount_amount: Math.max(0, Math.round(toNumber(row.discount_amount))),
    status: String(row.status ?? 'redeemed'),
    created_at: row.created_at,
  };
}

function deriveTier(input: { lifetimeSpend: number; totalStamps: number; totalPoints: number }) {
  if (input.lifetimeSpend >= 2_000_000 || input.totalStamps >= 48 || input.totalPoints >= 20_000) return 'vvip';
  if (input.lifetimeSpend >= 500_000 || input.totalStamps >= 16 || input.totalPoints >= 5_000) return 'kopi_lover';
  return 'regular';
}

async function ensureSettings(client: PoolClient, storeId: string) {
  const result = await client.query(
    `
      insert into public.loyalty_settings (store_id)
      values ($1)
      on conflict (store_id) do update
      set updated_at = public.loyalty_settings.updated_at
      returning *
    `,
    [storeId],
  );
  return serializeSettings(result.rows[0]);
}

async function resolveStoreId(client: PoolClient, input: unknown, userId: string) {
  const candidate = typeof input === 'string' && storeIdSchema.safeParse(input).success ? input : null;
  if (candidate) {
    await assertStoreOwned(client, candidate, userId);
    return candidate;
  }

  const result = await client.query(
    `
      select s.id
      from public.stores s
      where s.owner_id = $1
        or exists (
          select 1
          from public.cashier_outlet_assignments a
          join public.profiles p on p.id = a.cashier_id
          where a.store_id = s.id
            and a.cashier_id = $1
            and a.status = 'active'
            and p.role = 'cashier'
            and p.account_status = 'active'
        )
      order by s.created_at asc
      limit 1
    `,
    [userId],
  );
  const storeId = result.rows[0]?.id ? String(result.rows[0].id) : null;
  if (!storeId) throw new ApiError(400, 'store_id wajib diisi untuk fitur loyalty.');
  return storeId;
}

async function ensureDefaultTiers(client: PoolClient, storeId: string) {
  const existing = await client.query(
    `select id from public.loyalty_tiers where store_id = $1 limit 1`,
    [storeId],
  );
  if (existing.rows[0]) return;

  await client.query(
    `
      insert into public.loyalty_tiers (store_id, name, min_visits, benefits)
      values
        ($1, 'Regular', 0, '{"label":"Member baru"}'::jsonb),
        ($1, 'Kopi Lover', 8, '{"label":"Prioritas reward"}'::jsonb),
        ($1, 'VVIP', 24, '{"label":"Benefit terbaik"}'::jsonb)
    `,
    [storeId],
  );
}

async function upsertCustomerFromPassport(client: PoolClient, passport: ReturnType<typeof serializePassport>) {
  const result = await client.query(
    `
      insert into public.loyalty_customers (
        id, store_id, name, phone, tier, total_points, total_visits, updated_at
      ) values ($1, $2, $3, $4, $5, $6, $7, now())
      on conflict (id) do update
      set
        name = excluded.name,
        phone = excluded.phone,
        tier = excluded.tier,
        total_points = excluded.total_points,
        total_visits = excluded.total_visits,
        updated_at = now()
      returning *
    `,
    [
      passport.id,
      passport.store_id,
      passport.customer_name,
      passport.customer_phone,
      passport.tier,
      passport.total_points,
      passport.total_stamps,
    ],
  );
  return serializeCustomer(result.rows[0]);
}

async function insertCompatStamp(client: PoolClient, event: ReturnType<typeof serializeStampEvent>) {
  await client.query(
    `
      insert into public.loyalty_stamps (id, customer_id, transaction_id, stamps_earned, created_at)
      values ($1, $2, $3, $4, coalesce($5::timestamptz, now()))
      on conflict (id) do nothing
    `,
    [event.id, event.passport_id, event.transaction_id, event.stamps, event.created_at ?? null],
  );
}

async function ensureDefaultRewards(client: PoolClient, storeId: string, stampsRequired: number) {
  const existing = await client.query(
    `select id from public.loyalty_rewards where store_id = $1 limit 1`,
    [storeId],
  );
  if (existing.rows[0]) return;

  await client.query(
    `
      insert into public.loyalty_rewards
        (store_id, name, description, type, reward_value, points_or_stamps_needed, points_cost, stamps_cost, is_active)
      values
        ($1, 'Diskon Rp10.000', 'Tukar poin untuk potongan transaksi berikutnya.', 'discount_amount', 10000, 1000, 1000, 0, true),
        ($1, 'Free Coffee Stamp', 'Tukar stamp lengkap untuk 1 minuman favorit.', 'free_item', 25000, $2, 0, $2, true)
    `,
    [storeId, stampsRequired],
  );
}

async function findOrCreatePassport(
  client: PoolClient,
  payload: { storeId: string; phone?: string; name?: string | null; passportId?: string },
) {
  if (payload.passportId) {
    const result = await client.query(
      `select * from public.loyalty_passports where id = $1 and store_id = $2 limit 1`,
      [payload.passportId, payload.storeId],
    );
    if (!result.rows[0]) throw new ApiError(404, 'Kopi Passport tidak ditemukan.');
    return serializePassport(result.rows[0]);
  }

  if (!payload.phone) {
    throw new ApiError(400, 'Nomor telepon pelanggan wajib diisi.');
  }

  const phone = normalizePhone(payload.phone);
  const result = await client.query(
    `
      insert into public.loyalty_passports (store_id, customer_name, customer_phone)
      values ($1, nullif($2, ''), $3)
      on conflict (store_id, customer_phone) do update
      set
        customer_name = coalesce(nullif(excluded.customer_name, ''), public.loyalty_passports.customer_name),
        updated_at = now()
      returning *
    `,
    [payload.storeId, payload.name?.trim() || null, phone],
  );
  const passport = serializePassport(result.rows[0]);
  await upsertCustomerFromPassport(client, passport);
  return passport;
}

function calculateEarned(input: {
  transactionAmount: number;
  settings: ReturnType<typeof serializeSettings>;
}) {
  if (!input.settings.is_active || input.transactionAmount < input.settings.minimum_transaction_amount) {
    return { stamps: 0, points: 0 };
  }
  return {
    stamps: input.transactionAmount > 0 ? 1 : 0,
    points: Math.max(0, Math.floor(input.transactionAmount * input.settings.points_per_rupiah)),
  };
}

function calculateRewardDiscount(input: {
  reward: ReturnType<typeof serializeReward>;
  transactionAmount: number;
}) {
  if (input.reward.type === 'discount_percent') {
    return Math.min(input.transactionAmount, Math.round(input.transactionAmount * input.reward.reward_value / 100));
  }
  if (input.reward.type === 'discount_amount') {
    return Math.min(input.transactionAmount, input.reward.reward_value);
  }
  if (input.reward.type === 'free_item') {
    return Math.min(input.transactionAmount, input.reward.reward_value);
  }
  return 0;
}

type StampPayload = z.infer<typeof stampSchema>;
type RedeemPayload = z.infer<typeof redeemSchema>;

async function getStoreOwnerId(client: PoolClient, storeId: string) {
  const result = await client.query(
    `select owner_id from public.stores where id = $1 limit 1`,
    [storeId],
  );
  return result.rows[0]?.owner_id ? String(result.rows[0].owner_id) : null;
}

async function insertLoyaltyRewardNotification(client: PoolClient, input: {
  storeId: string;
  ownerId: string;
  passport: ReturnType<typeof serializePassport>;
  stampsRequired: number;
}) {
  const dedupeKey = `loyalty-reward:${input.passport.id}:${Math.floor(input.passport.available_stamps / input.stampsRequired)}`;
  const existing = await client.query(
    `
      select id
      from public.notifications
      where user_id = $1
        and store_id = $2
        and type = 'loyalty'
        and metadata->>'dedupeKey' = $3
      limit 1
    `,
    [input.ownerId, input.storeId, dedupeKey],
  );
  if (existing.rows[0]) return;

  await insertNotification(
    client,
    input.ownerId,
    'Pelanggan loyalty siap redeem',
    `${input.passport.customer_name || input.passport.customer_phone} sudah mencapai reward Kopi Passport.`,
    'loyalty',
    {
      category: 'business_alert',
      dedupeKey,
      passportId: input.passport.id,
      customerName: input.passport.customer_name,
      customerPhone: input.passport.customer_phone,
      availableStamps: input.passport.available_stamps,
      stampsRequired: input.stampsRequired,
    },
    input.storeId,
  );
}

async function applyStamp(client: PoolClient, payload: StampPayload, userId: string) {
  await assertStoreOwned(client, payload.store_id, userId);
  const settings = await ensureSettings(client, payload.store_id);
  const passport = await findOrCreatePassport(client, {
    storeId: payload.store_id,
    passportId: payload.passport_id,
    phone: payload.customer_phone,
    name: payload.customer_name,
  });
  const earned = calculateEarned({
    transactionAmount: payload.transaction_amount,
    settings,
  });
  if (payload.stamps_earned !== undefined) {
    earned.stamps = payload.stamps_earned;
  }

  if (payload.idempotency_key) {
    const existing = await client.query(
      `select * from public.loyalty_stamp_events where store_id = $1 and idempotency_key = $2 limit 1`,
      [payload.store_id, payload.idempotency_key],
    );
    if (existing.rows[0]) {
      const currentPassport = await client.query(
        `select * from public.loyalty_passports where id = $1 and store_id = $2 limit 1`,
        [passport.id, payload.store_id],
      );
      const serializedPassport = serializePassport(currentPassport.rows[0]);
      await upsertCustomerFromPassport(client, serializedPassport);
      const event = serializeStampEvent(existing.rows[0]);
      await insertCompatStamp(client, event);
      return {
        passport: serializedPassport,
        customer: serializeCustomer({
          id: serializedPassport.id,
          store_id: serializedPassport.store_id,
          name: serializedPassport.customer_name,
          phone: serializedPassport.customer_phone,
          tier: serializedPassport.tier,
          total_points: serializedPassport.total_points,
          total_visits: serializedPassport.total_stamps,
        }),
        event,
        earned,
        replayed: true,
      };
    }
  }

  const eventResult = await client.query(
    `
      insert into public.loyalty_stamp_events (
        store_id, passport_id, transaction_id, stamps, points,
        transaction_amount, note, created_by, idempotency_key
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning *
    `,
    [
      payload.store_id,
      passport.id,
      payload.transaction_id || null,
      earned.stamps,
      earned.points,
      payload.transaction_amount,
      payload.note || null,
      userId,
      payload.idempotency_key || null,
    ],
  );

  const nextTotalStamps = passport.total_stamps + earned.stamps;
  const nextTotalPoints = passport.total_points + earned.points;
  const nextLifetimeSpend = passport.lifetime_spend + payload.transaction_amount;
  const nextTier = deriveTier({
    lifetimeSpend: nextLifetimeSpend,
    totalStamps: nextTotalStamps,
    totalPoints: nextTotalPoints,
  });

  const updated = await client.query(
    `
      update public.loyalty_passports
      set
        total_stamps = total_stamps + $1,
        available_stamps = available_stamps + $1,
        total_points = total_points + $2,
        available_points = available_points + $2,
        lifetime_spend = lifetime_spend + $3,
        tier = $4,
        last_visit_at = now(),
        updated_at = now()
      where id = $5 and store_id = $6
      returning *
    `,
    [earned.stamps, earned.points, payload.transaction_amount, nextTier, passport.id, payload.store_id],
  );

  const serializedPassport = serializePassport(updated.rows[0]);
  const customer = await upsertCustomerFromPassport(client, serializedPassport);
  const event = serializeStampEvent(eventResult.rows[0]);
  await insertCompatStamp(client, event);
  const ownerId = await getStoreOwnerId(client, payload.store_id);
  if (
    ownerId &&
    settings.stamps_required > 0 &&
    passport.available_stamps < settings.stamps_required &&
    serializedPassport.available_stamps >= settings.stamps_required
  ) {
    await insertLoyaltyRewardNotification(client, {
      storeId: payload.store_id,
      ownerId,
      passport: serializedPassport,
      stampsRequired: settings.stamps_required,
    });
  }

  return {
    passport: serializedPassport,
    customer,
    event,
    earned,
    replayed: false,
  };
}

async function redeemReward(client: PoolClient, payload: RedeemPayload, userId: string) {
  await assertStoreOwned(client, payload.store_id, userId);

  if (payload.idempotency_key) {
    const existing = await client.query(
      `select * from public.loyalty_redemptions where store_id = $1 and idempotency_key = $2 limit 1`,
      [payload.store_id, payload.idempotency_key],
    );
    if (existing.rows[0]) {
      const currentPassport = await client.query(
        `select * from public.loyalty_passports where id = $1 and store_id = $2 limit 1`,
        [payload.passport_id, payload.store_id],
      );
      const reward = await client.query(
        `select * from public.loyalty_rewards where id = $1 and store_id = $2 limit 1`,
        [payload.reward_id, payload.store_id],
      );
      const passport = serializePassport(currentPassport.rows[0]);
      await upsertCustomerFromPassport(client, passport);
      return {
        redemption: serializeRedemption(existing.rows[0]),
        passport,
        customer: serializeCustomer({
          id: passport.id,
          store_id: passport.store_id,
          name: passport.customer_name,
          phone: passport.customer_phone,
          tier: passport.tier,
          total_points: passport.total_points,
          total_visits: passport.total_stamps,
        }),
        reward: serializeReward(reward.rows[0]),
        replayed: true,
      };
    }
  }

  const [passportResult, rewardResult] = await Promise.all([
    client.query(
      `select * from public.loyalty_passports where id = $1 and store_id = $2 for update`,
      [payload.passport_id, payload.store_id],
    ),
    client.query(
      `select * from public.loyalty_rewards where id = $1 and store_id = $2 and is_active = true limit 1`,
      [payload.reward_id, payload.store_id],
    ),
  ]);
  const passport = passportResult.rows[0] ? serializePassport(passportResult.rows[0]) : null;
  const reward = rewardResult.rows[0] ? serializeReward(rewardResult.rows[0]) : null;
  if (!passport) throw new ApiError(404, 'Kopi Passport tidak ditemukan.');
  if (!reward) throw new ApiError(404, 'Reward tidak aktif atau tidak ditemukan.');
  if (passport.available_points < reward.points_cost) throw new ApiError(400, 'Poin pelanggan belum cukup untuk reward ini.');
  if (passport.available_stamps < reward.stamps_cost) throw new ApiError(400, 'Stamp pelanggan belum cukup untuk reward ini.');

  const discountAmount = calculateRewardDiscount({
    reward,
    transactionAmount: payload.transaction_amount,
  });
  const redemption = await client.query(
    `
      insert into public.loyalty_redemptions (
        store_id, passport_id, reward_id, transaction_id,
        points_spent, stamps_spent, discount_amount, status, created_by, idempotency_key
      ) values ($1, $2, $3, $4, $5, $6, $7, 'redeemed', $8, $9)
      returning *
    `,
    [
      payload.store_id,
      passport.id,
      reward.id,
      payload.transaction_id || null,
      reward.points_cost,
      reward.stamps_cost,
      discountAmount,
      userId,
      payload.idempotency_key || null,
    ],
  );

  const updated = await client.query(
    `
      update public.loyalty_passports
      set
        available_points = greatest(0, available_points - $1),
        available_stamps = greatest(0, available_stamps - $2),
        updated_at = now()
      where id = $3 and store_id = $4
      returning *
    `,
    [reward.points_cost, reward.stamps_cost, passport.id, payload.store_id],
  );

  const updatedPassport = serializePassport(updated.rows[0]);
  const customer = await upsertCustomerFromPassport(client, updatedPassport);
  return {
    redemption: serializeRedemption(redemption.rows[0]),
    passport: updatedPassport,
    customer,
    reward,
    replayed: false,
  };
}

router.get('/api/loyalty/overview', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      const settings = await ensureSettings(client, storeId);
      await ensureDefaultRewards(client, storeId, settings.stamps_required);
      await ensureDefaultTiers(client, storeId);
      const [rewards, passports, tiers] = await Promise.all([
        client.query(
          `select * from public.loyalty_rewards where store_id = $1 order by is_active desc, created_at asc`,
          [storeId],
        ),
        client.query(
          `select * from public.loyalty_passports where store_id = $1 order by updated_at desc limit 20`,
          [storeId],
        ),
        client.query(
          `select * from public.loyalty_tiers where store_id = $1 order by min_visits asc, name asc`,
          [storeId],
        ),
      ]);
      return {
        settings,
        rewards: rewards.rows.map(serializeReward),
        passports: passports.rows.map(serializePassport),
        customers: passports.rows.map((row: Record<string, unknown>) => serializeCustomer({
          id: row.id,
          store_id: row.store_id,
          name: row.customer_name,
          phone: row.customer_phone,
          tier: row.tier,
          total_points: row.total_points,
          total_visits: row.total_stamps,
          created_at: row.created_at,
          updated_at: row.updated_at,
        })),
        tiers: tiers.rows.map(serializeTier),
      };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/loyalty/customers', async (req, res, next) => {
  try {
    const query = String(req.query.search ?? req.query.query ?? '').trim();
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 25, maxLimit: 100 });
    const result = await withTransaction(async (client) => {
      const storeId = await resolveStoreId(client, req.query.storeId ?? req.query.store_id, req.authUser!.id);
      const values: unknown[] = [storeId, pagination.limit, pagination.offset];
      const normalizedQuery = normalizePhone(query) || query;
      const searchSql = query
        ? `and (customer_name ilike $4 or customer_phone ilike $4)`
        : '';
      if (query) values.push(`%${normalizedQuery}%`);
      const passports = await client.query(
        `
          select *
          from public.loyalty_passports
          where store_id = $1
          ${searchSql}
          order by updated_at desc
          limit $2 offset $3
        `,
        values,
      );
      const customers = [];
      for (const row of passports.rows) {
        customers.push(await upsertCustomerFromPassport(client, serializePassport(row)));
      }
      return customers;
    });
    res.json({
      items: result,
      pagination: buildPaginationMeta({ ...pagination, returned: result.length }),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/loyalty/settings', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      const storeId = await resolveStoreId(client, req.query.storeId ?? req.query.store_id, req.authUser!.id);
      const settings = await ensureSettings(client, storeId);
      await ensureDefaultRewards(client, storeId, settings.stamps_required);
      await ensureDefaultTiers(client, storeId);
      const [rewards, tiers] = await Promise.all([
        client.query(
          `select * from public.loyalty_rewards where store_id = $1 order by is_active desc, created_at asc`,
          [storeId],
        ),
        client.query(
          `select * from public.loyalty_tiers where store_id = $1 order by min_visits asc, name asc`,
          [storeId],
        ),
      ]);
      return {
        settings,
        rewards: rewards.rows.map(serializeReward),
        tiers: tiers.rows.map(serializeTier),
      };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/loyalty/passports', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const query = String(req.query.query ?? '').trim();
    const pagination = parsePaginationQuery(req.query, { defaultLimit: 25, maxLimit: 100 });
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      const values: unknown[] = [storeId, pagination.limit, pagination.offset];
      const searchSql = query
        ? `and (customer_name ilike $4 or customer_phone ilike $4)`
        : '';
      if (query) values.push(`%${normalizePhone(query) || query}%`);
      const passports = await client.query(
        `
          select *
          from public.loyalty_passports
          where store_id = $1
          ${searchSql}
          order by updated_at desc
          limit $2 offset $3
        `,
        values,
      );
      return passports.rows.map(serializePassport);
    });
    res.json({
      items: result,
      pagination: buildPaginationMeta({ ...pagination, returned: result.length }),
    });
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/passports', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = passportSchema.parse(req.body);
    const passport = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return findOrCreatePassport(client, {
        storeId: payload.store_id,
        phone: payload.customer_phone,
        name: payload.customer_name,
      });
    });
    res.status(201).json(passport);
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/stamps', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = stampSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      return applyStamp(client, payload, req.authUser!.id);
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/stamp', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = stampCompatSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const storeId = await resolveStoreId(client, payload.store_id ?? payload.storeId, req.authUser!.id);
      return applyStamp(client, {
        store_id: storeId,
        passport_id: payload.passport_id ?? payload.customer_id,
        customer_name: payload.customer_name ?? payload.name ?? null,
        customer_phone: payload.customer_phone ?? payload.phone,
        transaction_id: payload.transaction_id ?? null,
        transaction_amount: payload.transaction_amount,
        stamps_earned: payload.stamps_earned,
        note: payload.note ?? null,
        idempotency_key: payload.idempotency_key ?? null,
      }, req.authUser!.id);
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/redemptions', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = redeemSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      return redeemReward(client, payload, req.authUser!.id);
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/redeem', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = redeemCompatSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const storeId = await resolveStoreId(client, payload.store_id ?? payload.storeId, req.authUser!.id);
      const passportId = payload.passport_id ?? payload.customer_id;
      if (!passportId) throw new ApiError(400, 'customer_id wajib diisi untuk redeem reward.');
      return redeemReward(client, {
        store_id: storeId,
        passport_id: passportId,
        reward_id: payload.reward_id,
        transaction_id: payload.transaction_id ?? null,
        transaction_amount: payload.transaction_amount,
        idempotency_key: payload.idempotency_key ?? null,
      }, req.authUser!.id);
    });
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/loyalty/settings', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = settingsSchema.parse(req.body);
    const settings = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      await ensureSettings(client, payload.store_id);
      const updates = pickDefined(payload as unknown as Record<string, unknown>, [
        'stamps_required',
        'points_per_rupiah',
        'minimum_transaction_amount',
        'is_active',
      ]);
      const { clause, values } = buildUpdateClause({ ...updates, updated_at: new Date().toISOString() });
      const result = await client.query(
        `
          update public.loyalty_settings
          set ${clause}
          where store_id = $${values.length + 1}
          returning *
        `,
        [...values, payload.store_id],
      );
      return serializeSettings(result.rows[0]);
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.put('/api/loyalty/settings', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = settingsSchema.parse(req.body);
    const settings = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      await ensureSettings(client, payload.store_id);
      const updates = pickDefined(payload as unknown as Record<string, unknown>, [
        'stamps_required',
        'points_per_rupiah',
        'minimum_transaction_amount',
        'is_active',
      ]);
      const { clause, values } = buildUpdateClause({ ...updates, updated_at: new Date().toISOString() });
      const result = await client.query(
        `
          update public.loyalty_settings
          set ${clause}
          where store_id = $${values.length + 1}
          returning *
        `,
        [...values, payload.store_id],
      );
      await ensureDefaultTiers(client, payload.store_id);
      const tiers = await client.query(
        `select * from public.loyalty_tiers where store_id = $1 order by min_visits asc, name asc`,
        [payload.store_id],
      );
      return {
        settings: serializeSettings(result.rows[0]),
        tiers: tiers.rows.map(serializeTier),
      };
    });
    res.json(settings);
  } catch (error) {
    next(error);
  }
});

router.post('/api/loyalty/rewards', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = rewardSchema.parse(req.body);
    const reward = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      const result = await client.query(
        `
          insert into public.loyalty_rewards (
            store_id, name, description, type, reward_value,
            points_or_stamps_needed, points_cost, stamps_cost, is_active
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          returning *
        `,
        [
          payload.store_id,
          payload.name,
          payload.description || null,
          payload.type,
          payload.reward_value,
          payload.points_or_stamps_needed ?? Math.max(payload.points_cost, payload.stamps_cost),
          payload.points_cost,
          payload.stamps_cost,
          payload.is_active,
        ],
      );
      return serializeReward(result.rows[0]);
    });
    res.status(201).json(reward);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/loyalty/rewards/:id', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const payload = rewardPatchSchema.parse(req.body);
    const reward = await withTransaction(async (client) => {
      const existing = await client.query(
        `select store_id from public.loyalty_rewards where id = $1 limit 1`,
        [id],
      );
      const storeId = existing.rows[0]?.store_id ? String(existing.rows[0].store_id) : null;
      if (!storeId) throw new ApiError(404, 'Reward tidak ditemukan.');
      await assertStoreOwned(client, storeId, req.authUser!.id);
      const updates = pickDefined(payload as unknown as Record<string, unknown>, [
        'name',
        'description',
        'type',
        'reward_value',
        'points_or_stamps_needed',
        'points_cost',
        'stamps_cost',
        'is_active',
      ]);
      const { clause, values } = buildUpdateClause({ ...updates, updated_at: new Date().toISOString() });
      const result = await client.query(
        `
          update public.loyalty_rewards
          set ${clause}
          where id = $${values.length + 1}
          returning *
        `,
        [...values, id],
      );
      return serializeReward(result.rows[0]);
    });
    res.json(reward);
  } catch (error) {
    next(error);
  }
});

export default router;
