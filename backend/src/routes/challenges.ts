/**
 * Daily Challenges & Missions routes.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  ApiError,
  assertStoreOwned,
  insertNotification,
  requirePermission,
  toNumber,
  withTransaction,
  type PoolClient,
} from '../core';

const router = Router();
const storeIdSchema = z.string().uuid();
const challengeTypeSchema = z.enum([
  'sell_drink',
  'average_checkout_time',
  'transactions_count',
  'upsell_value',
  'zero_voids',
]);

const checkCompletionSchema = z.object({
  store_id: z.string().uuid(),
  transaction_id: z.string().trim().max(120).optional().nullable(),
  checkout_time_seconds: z.number().min(0).max(60 * 60).optional().nullable(),
  upsell_value: z.number().min(0).max(1_000_000_000).optional().nullable(),
});

const patchChallengeSchema = z.object({
  store_id: z.string().uuid(),
  is_active: z.boolean().optional(),
});

type ChallengeRow = {
  id: string;
  store_id: string;
  title: string;
  description: string;
  target_type: z.infer<typeof challengeTypeSchema>;
  target_value: Record<string, unknown>;
  points_reward: number;
  is_active: boolean;
  valid_from: string;
  valid_to: string;
  created_at?: string;
  updated_at?: string;
};

type CompletionMetrics = {
  transactionId?: string | null;
  checkoutTimeSeconds?: number | null;
  upsellValue?: number | null;
};

function parseTargetValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function formatPgDate(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const raw = String(value ?? '').trim();
  const isoDate = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (isoDate) return isoDate;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return raw;
}

function serializeChallenge(row: Record<string, unknown>): ChallengeRow {
  return {
    id: String(row.id),
    store_id: String(row.store_id),
    title: String(row.title ?? ''),
    description: String(row.description ?? ''),
    target_type: challengeTypeSchema.parse(row.target_type),
    target_value: parseTargetValue(row.target_value),
    points_reward: Math.max(0, Math.round(toNumber(row.points_reward))),
    is_active: row.is_active !== false,
    valid_from: formatPgDate(row.valid_from),
    valid_to: formatPgDate(row.valid_to),
    created_at: row.created_at == null ? undefined : String(row.created_at),
    updated_at: row.updated_at == null ? undefined : String(row.updated_at),
  };
}

function serializeProgress(row: Record<string, unknown> | null | undefined) {
  return {
    id: row?.id == null ? null : String(row.id),
    user_id: row?.user_id == null ? null : String(row.user_id),
    challenge_id: row?.challenge_id == null ? null : String(row.challenge_id),
    current_progress: Math.max(0, toNumber(row?.current_progress)),
    is_completed: row?.is_completed === true,
    completed_at: row?.completed_at ?? null,
    created_at: row?.created_at ?? null,
    updated_at: row?.updated_at ?? null,
  };
}

function targetNumber(challenge: ChallengeRow) {
  const target = challenge.target_value;
  if (challenge.target_type === 'sell_drink') return Math.max(1, Math.round(toNumber(target.cups ?? target.target)));
  if (challenge.target_type === 'average_checkout_time') {
    return Math.max(1, Math.round(toNumber(target.min_transactions ?? target.transactions ?? 1)));
  }
  if (challenge.target_type === 'transactions_count') return Math.max(1, Math.round(toNumber(target.transactions ?? target.target)));
  if (challenge.target_type === 'upsell_value') return Math.max(1, Math.round(toNumber(target.amount ?? target.target)));
  return 1;
}

async function getStaffAliases(client: PoolClient, userId: string) {
  const result = await client.query(
    `select display_name, username, email from public.profiles where id = $1 limit 1`,
    [userId],
  );
  const row = result.rows[0] ?? {};
  return [
    row.display_name,
    row.username,
    typeof row.email === 'string' ? row.email.split('@')[0] : null,
    'Kasir',
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .map((value) => value.trim().toLowerCase());
}

async function ensureDefaultChallenges(client: PoolClient, storeId: string) {
  const inserted = await client.query(
    `
      insert into public.challenges (
        store_id, title, description, target_type, target_value,
        points_reward, is_active, valid_from, valid_to
      ) values
        ($1, 'Jual 5 Kopi Susu', 'Capai 5 cup Kopi Susu hari ini.', 'sell_drink', '{"drink_name":"Kopi Susu","cups":5}'::jsonb, 35, true, current_date, current_date),
        ($1, 'Checkout Cepat', 'Selesaikan 3 checkout di bawah 45 detik.', 'average_checkout_time', '{"seconds":45,"min_transactions":3}'::jsonb, 30, true, current_date, current_date),
        ($1, '10 Transaksi Hari Ini', 'Selesaikan 10 transaksi non-void.', 'transactions_count', '{"transactions":10}'::jsonb, 50, true, current_date, current_date),
        ($1, 'Upsell Rp50.000', 'Kumpulkan nilai upsell atau modifier Rp50.000.', 'upsell_value', '{"amount":50000}'::jsonb, 45, true, current_date, current_date),
        ($1, 'Zero Voids', 'Jaga transaksi hari ini tanpa void.', 'zero_voids', '{"required_transactions":1}'::jsonb, 25, true, current_date, current_date)
      on conflict (store_id, title, valid_from) do nothing
      returning id, title, points_reward, valid_from
    `,
    [storeId],
  );
  if (inserted.rows.length === 0) return;

  const recipients = await client.query(
    `
      select owner_id as user_id
      from public.stores
      where id = $1
      union
      select cashier_id as user_id
      from public.cashier_outlet_assignments
      where store_id = $1
        and status = 'active'
    `,
    [storeId],
  );

  for (const challenge of inserted.rows) {
    for (const recipient of recipients.rows) {
      if (!recipient.user_id) continue;
      await insertNotification(
        client,
        String(recipient.user_id),
        'Misi harian baru',
        `${challenge.title} tersedia hari ini. Reward +${Math.max(0, Math.round(toNumber(challenge.points_reward)))} poin.`,
        'challenge',
        {
          category: 'challenges',
          dedupeKey: `new-challenge:${challenge.id}`,
          challengeId: challenge.id,
          pointsReward: Math.max(0, Math.round(toNumber(challenge.points_reward))),
        },
        storeId,
      );
    }
  }
}

async function getActiveChallenges(client: PoolClient, storeId: string, includeInactive = false) {
  await ensureDefaultChallenges(client, storeId);
  const result = await client.query(
    `
      select *
      from public.challenges
      where store_id = $1
        and ($2::boolean = true or is_active = true)
        and current_date between valid_from and valid_to
      order by is_active desc, created_at asc, title asc
    `,
    [storeId, includeInactive],
  );
  return result.rows.map(serializeChallenge);
}

async function computeChallengeProgress(
  client: PoolClient,
  challenge: ChallengeRow,
  storeId: string,
  userId: string,
  metrics: CompletionMetrics,
  previousProgress: number,
) {
  const aliases = await getStaffAliases(client, userId);
  const target = challenge.target_value;
  const rangeParams = [storeId, aliases, challenge.valid_from, challenge.valid_to];

  if (challenge.target_type === 'sell_drink') {
    const drinkName = String(target.drink_name ?? '').trim().toLowerCase();
    if (!drinkName) return 0;
    const result = await client.query(
      `
        select coalesce(sum((item->>'qty')::numeric), 0) as progress
        from public.transactions t
        cross join lateral jsonb_array_elements(t.items) item
        where t.store_id = $1
          and lower(coalesce(t.cashier, '')) = any($2::text[])
          and t.is_void = false
          and t.date::date between $3::date and $4::date
          and lower(coalesce(item->>'name', '')) like '%' || $5 || '%'
      `,
      [...rangeParams, drinkName],
    );
    return toNumber(result.rows[0]?.progress);
  }

  if (challenge.target_type === 'transactions_count') {
    const result = await client.query(
      `
        select count(*)::numeric as progress
        from public.transactions t
        where t.store_id = $1
          and lower(coalesce(t.cashier, '')) = any($2::text[])
          and t.is_void = false
          and t.date::date between $3::date and $4::date
      `,
      rangeParams,
    );
    return toNumber(result.rows[0]?.progress);
  }

  if (challenge.target_type === 'upsell_value') {
    const result = await client.query(
      `
        select coalesce(sum(greatest(t.total - 50000, 0)), 0) as progress
        from public.transactions t
        where t.store_id = $1
          and lower(coalesce(t.cashier, '')) = any($2::text[])
          and t.is_void = false
          and t.date::date between $3::date and $4::date
      `,
      rangeParams,
    );
    return Math.max(toNumber(result.rows[0]?.progress), previousProgress + Math.max(0, metrics.upsellValue ?? 0));
  }

  if (challenge.target_type === 'average_checkout_time') {
    const seconds = Math.max(1, toNumber(target.seconds));
    const increment = metrics.checkoutTimeSeconds != null && metrics.checkoutTimeSeconds <= seconds ? 1 : 0;
    return previousProgress + increment;
  }

  const [voidResult, transactionResult] = await Promise.all([
    client.query(
      `
        select count(*)::numeric as voids
        from public.transactions t
        where t.store_id = $1
          and lower(coalesce(t.cashier, '')) = any($2::text[])
          and t.is_void = true
          and t.date::date between $3::date and $4::date
      `,
      rangeParams,
    ),
    client.query(
      `
        select count(*)::numeric as transactions
        from public.transactions t
        where t.store_id = $1
          and lower(coalesce(t.cashier, '')) = any($2::text[])
          and t.is_void = false
          and t.date::date between $3::date and $4::date
      `,
      rangeParams,
    ),
  ]);
  const requiredTransactions = Math.max(1, Math.round(toNumber(target.required_transactions ?? 1)));
  return toNumber(voidResult.rows[0]?.voids) === 0 && toNumber(transactionResult.rows[0]?.transactions) >= requiredTransactions ? 1 : 0;
}

export async function checkChallengeCompletionForUser(
  client: PoolClient,
  input: {
    storeId: string;
    userId: string;
    metrics?: CompletionMetrics;
  },
) {
  const challenges = await getActiveChallenges(client, input.storeId);
  const updated = [];

  for (const challenge of challenges) {
    const existingResult = await client.query(
      `
        select *
        from public.user_challenge_progress
        where user_id = $1 and challenge_id = $2
        for update
      `,
      [input.userId, challenge.id],
    );
    const existing = serializeProgress(existingResult.rows[0]);
    const currentProgress = await computeChallengeProgress(
      client,
      challenge,
      input.storeId,
      input.userId,
      input.metrics ?? {},
      existing.current_progress,
    );
    const completed = currentProgress >= targetNumber(challenge);
    const shouldNotify = completed && !existing.is_completed;

    const saved = await client.query(
      `
        insert into public.user_challenge_progress (
          user_id, challenge_id, current_progress, is_completed, completed_at, updated_at
        ) values ($1, $2, $3, $4, case when $4 then now() else null end, now())
        on conflict (user_id, challenge_id) do update
        set
          current_progress = excluded.current_progress,
          is_completed = excluded.is_completed,
          completed_at = case
            when excluded.is_completed and public.user_challenge_progress.completed_at is null then now()
            when excluded.is_completed then public.user_challenge_progress.completed_at
            else null
          end,
          updated_at = now()
        returning *
      `,
      [input.userId, challenge.id, Math.min(currentProgress, targetNumber(challenge)), completed],
    );

    if (shouldNotify) {
      await insertNotification(
        client,
        input.userId,
        'Misi harian selesai',
        `${challenge.title} selesai. +${challenge.points_reward} poin performa.`,
        'challenge',
        { category: 'challenges', challengeId: challenge.id, pointsReward: challenge.points_reward },
        input.storeId,
      );
    }

    updated.push({
      challenge,
      progress: serializeProgress(saved.rows[0]),
    });
  }

  return updated;
}

router.get('/api/challenges/active', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return getActiveChallenges(client, storeId, req.authUser!.role === 'owner_admin');
    });
    res.json({ items: result });
  } catch (error) {
    next(error);
  }
});

router.get('/api/challenges/my-progress', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      await checkChallengeCompletionForUser(client, { storeId, userId: req.authUser!.id });
      const challenges = await getActiveChallenges(client, storeId, req.authUser!.role === 'owner_admin');
      const progress = await client.query(
        `
          select p.*
          from public.user_challenge_progress p
          join public.challenges c on c.id = p.challenge_id
          where p.user_id = $1
            and c.store_id = $2
            and current_date between c.valid_from and c.valid_to
          order by p.updated_at desc
        `,
        [req.authUser!.id, storeId],
      );
      const progressItems = progress.rows.map(serializeProgress);
      const completedCount = progressItems.filter((item) => item.is_completed).length;
      return {
        items: progressItems,
        challenges,
        summary: {
          active_count: challenges.filter((challenge) => challenge.is_active).length,
          completed_count: completedCount,
          reward_points: progressItems.reduce((sum, item) => {
            if (!item.is_completed) return sum;
            const challenge = challenges.find((entry) => entry.id === item.challenge_id);
            return sum + (challenge?.points_reward ?? 0);
          }, 0),
        },
      };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.post('/api/challenges/check-completion', requirePermission('can_use_pos'), async (req, res, next) => {
  try {
    const payload = checkCompletionSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return checkChallengeCompletionForUser(client, {
        storeId: payload.store_id,
        userId: req.authUser!.id,
        metrics: {
          transactionId: payload.transaction_id ?? null,
          checkoutTimeSeconds: payload.checkout_time_seconds ?? null,
          upsellValue: payload.upsell_value ?? null,
        },
      });
    });
    res.json({
      items: result.map((item) => item.progress),
      completed: result.filter((item) => item.progress.is_completed).map((item) => item.challenge),
    });
  } catch (error) {
    next(error);
  }
});

router.get('/api/challenges/team-completion', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      const store = await assertStoreOwned(client, storeId, req.authUser!.id);
      if (String(store.owner_id) !== req.authUser!.id) {
        throw new ApiError(403, 'Hanya Owner/Admin yang bisa melihat completion rate tim.');
      }
      const challenges = await getActiveChallenges(client, storeId, true);
      const staff = await client.query(
        `
          select id
          from public.profiles
          where id = $1
          union
          select p.id
          from public.cashier_outlet_assignments a
          join public.profiles p on p.id = a.cashier_id
          where a.store_id = $2
            and a.owner_id = $1
            and a.status = 'active'
            and p.account_status = 'active'
        `,
        [req.authUser!.id, storeId],
      );
      const totalSlots = Math.max(1, staff.rows.length * Math.max(1, challenges.filter((challenge) => challenge.is_active).length));
      const completion = await client.query(
        `
          select count(*)::numeric as completed
          from public.user_challenge_progress p
          join public.challenges c on c.id = p.challenge_id
          where c.store_id = $1
            and c.is_active = true
            and p.is_completed = true
            and current_date between c.valid_from and c.valid_to
        `,
        [storeId],
      );
      const completed = Math.round(toNumber(completion.rows[0]?.completed));
      return {
        active_challenges: challenges,
        staff_count: staff.rows.length,
        completed_count: completed,
        total_slots: totalSlots,
        completion_rate: Math.round((completed / totalSlots) * 100),
      };
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/challenges/:id', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const challengeId = storeIdSchema.parse(req.params.id);
    const payload = patchChallengeSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      const store = await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      if (String(store.owner_id) !== req.authUser!.id) {
        throw new ApiError(403, 'Hanya Owner/Admin yang bisa mengubah misi.');
      }
      const updated = await client.query(
        `
          update public.challenges
          set
            is_active = coalesce($1, is_active),
            updated_at = now()
          where id = $2 and store_id = $3
          returning *
        `,
        [payload.is_active ?? null, challengeId, payload.store_id],
      );
      if (!updated.rows[0]) throw new ApiError(404, 'Misi tidak ditemukan.');
      return serializeChallenge(updated.rows[0]);
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

export default router;
