/**
 * Misc routes: AI insights, ops events, local storage import, notifications.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import {
  pool,
  withTransaction,
  ApiError,
  requirePermission,
  env,
  opsEventSchema,
  aiInsightRequestSchema,
  aiInsightResponseSchema,
  localStorageImportSchema,
  mapGeminiError,
  getAiLimitWindow,
  parseGeminiText,
  pickDefined,
  buildUpdateClause,
} from '../core';
import type { PoolClient } from '../core/db';

const router = Router();

async function assertStoreOwned(client: PoolClient, storeId: string, userId: string) {
  const result = await client.query(
    `select id from public.stores where id = $1 and owner_id = $2 limit 1`,
    [storeId, userId],
  );
  if (!result.rows[0]) {
    throw new ApiError(404, 'Store tidak ditemukan atau bukan milik Anda.');
  }
}

async function countRowsForStore(client: PoolClient, table: string, storeId: string) {
  const result = await client.query(`select count(*)::int as count from public.${table} where store_id = $1`, [storeId]);
  return result.rows[0]?.count ?? 0;
}

router.post('/api/ops/events', async (req, res, next) => {
  try {
    const payload = opsEventSchema.parse(req.body);

    if (payload.store_id) {
      await withTransaction(async (client) => {
        await assertStoreOwned(client, payload.store_id!, req.authUser!.id);
      });
    }

    await pool.query(
      `
        insert into public.ops_event_logs (
          event_name,
          status,
          actor_user_id,
          actor_email,
          store_id,
          transaction_id,
          source,
          error_message,
          metadata,
          ip_address,
          user_agent
        ) values (
          $1, $2, $3, $4, $5, $6, 'app', $7, $8::jsonb, $9, $10
        )
      `,
      [
        payload.event_name,
        payload.status,
        req.authUser!.id,
        payload.email ?? req.authUser!.email ?? null,
        payload.store_id ?? null,
        payload.transaction_id ?? null,
        payload.error_message ?? null,
        JSON.stringify(payload.metadata ?? {}),
        req.ip,
        req.get('user-agent') ?? null,
      ],
    );

    res.status(201).json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.post('/api/ai-insight', requirePermission('can_view_reports'), async (req, res, next) => {
  try {
    if (!env.GEMINI_API_KEY) {
      throw new ApiError(502, 'GEMINI_API_KEY belum dikonfigurasi di backend.');
    }

    const payload = aiInsightRequestSchema.parse(req.body);
    const now = new Date();

    const profileResult = await pool.query(
      `
        select is_pro, tier
        from public.profiles
        where id = $1
        limit 1
      `,
      [req.authUser!.id],
    );

    const profile = profileResult.rows[0];
    const isPro = profile?.is_pro === true || profile?.tier === 'pro';
    const limitWindow = getAiLimitWindow(isPro, now);
    const usageResult = await pool.query(
      `
        select count(*)::int as usage_count
        from public.ai_insight_logs
        where user_id = $1
          and created_at >= $2::timestamptz
      `,
      [req.authUser!.id, limitWindow.startsAt],
    );

    const usageCount = usageResult.rows[0]?.usage_count ?? 0;
    if (usageCount >= limitWindow.limitMax) {
      throw new ApiError(
        429,
        `Batas analisis AI tercapai (${limitWindow.limitLabel}). ${limitWindow.resetMessage}`,
      );
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`;

    let geminiResponse: globalThis.Response;
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: payload.prompt }] }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
            { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
          ],
        }),
        signal: controller.signal,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.toLowerCase().includes('abort')) {
        throw new ApiError(502, 'Layanan AI timeout. Sistem akan memakai analisis cadangan.');
      }

      throw new ApiError(502, 'Layanan AI sedang tidak tersedia. Sistem akan memakai analisis cadangan.');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!geminiResponse.ok) {
      const errorPayload = (await geminiResponse.json().catch(() => ({}))) as { error?: { message?: string } };
      const message = errorPayload.error?.message ?? `Gemini error ${geminiResponse.status}`;
      throw new ApiError(502, mapGeminiError(geminiResponse.status, message));
    }

    const geminiPayload = await geminiResponse.json();
    let insight;
    try {
      insight = parseGeminiText(geminiPayload);
    } catch {
      throw new ApiError(502, 'Respons AI tidak valid. Coba lagi.');
    }

    await pool.query(
      `
        insert into public.ai_insight_logs (user_id, created_at)
        values ($1, $2)
      `,
      [req.authUser!.id, now.toISOString()],
    );

    res.json(insight);
  } catch (error) {
    next(error);
  }
});

router.post('/api/import/local-storage', requirePermission('can_manage_settings'), async (req, res, next) => {
  try {
    const payload = localStorageImportSchema.parse(req.body);

    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);

      const summary = {
        success: true,
        migrated: [] as string[],
        errors: [] as string[],
        skipped: [] as string[],
      };

      if (payload.store_settings) {
        const storeFields = pickDefined(payload.store_settings, [
          'store_name',
          'address',
          'whatsapp',
          'tax_percent',
          'receipt_header',
          'receipt_footer',
          'logo_url',
          'logo_base64',
          'logo_position',
          'logo_size',
          'show_logo_on_receipt',
          'currency',
          'tagline',
          'email',
          'website',
          'paper_width',
          'receipt_font_size',
          'receipt_show_address',
          'receipt_show_whatsapp',
          'receipt_show_tax',
          'receipt_show_cashier',
          'receipt_show_trx_id',
          'receipt_divider',
          'receipt_custom_line1',
          'receipt_custom_line2',
          'timezone',
        ]);
        if (Object.keys(storeFields).length > 0) {
          const { clause, values } = buildUpdateClause(storeFields);
          await client.query(
            `
              update public.stores
              set ${clause}, updated_at = now()
              where id = $${values.length + 1}
            `,
            [...values, payload.store_id],
          );
          summary.migrated.push('store_settings');
        }
      }

      if (payload.menu_items.length > 0) {
        const existing = await countRowsForStore(client, 'menu_items', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('menu_items (destination not empty)');
        } else {
          for (const item of payload.menu_items) {
            await client.query(
              `
                insert into public.menu_items (
                  store_id, name, price, category, image_url, description, is_available, sort_order, recipe, variants
                ) values (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Math.max(0, Number(item.price || 0)),
                String(item.category || 'Coffee'),
                String(item.image_url || ''),
                String(item.description || ''),
                item.is_available ?? true,
                Number(item.sort_order || 0),
                JSON.stringify(Array.isArray(item.recipe) ? item.recipe : []),
                JSON.stringify(Array.isArray(item.variants) ? item.variants : []),
              ],
            );
          }
          summary.migrated.push(`menu_items (${payload.menu_items.length})`);
        }
      } else {
        summary.skipped.push('menu_items (empty)');
      }

      if (payload.inventory_items.length > 0) {
        const existing = await countRowsForStore(client, 'inventory', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('inventory (destination not empty)');
        } else {
          for (const item of payload.inventory_items) {
            await client.query(
              `
                insert into public.inventory (
                  store_id, name, stock, unit, min_stock, cost_per_unit
                ) values (
                  $1, $2, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(item.name || 'Unknown'),
                Number(item.stock || 0),
                String(item.unit || 'pcs'),
                Number(item.min_stock || 5),
                Number(item.cost_per_unit || 0),
              ],
            );
          }
          summary.migrated.push(`inventory (${payload.inventory_items.length})`);
        }
      } else {
        summary.skipped.push('inventory (empty)');
      }

      if (payload.transactions.length > 0) {
        const existing = await countRowsForStore(client, 'transactions', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('transactions (destination not empty)');
        } else {
          for (const trx of payload.transactions) {
            await client.query(
              `
                insert into public.transactions (
                  id, store_id, date, items, subtotal, discount, discount_label, tax, total, cogs, paid, change,
                  method, cashier, note, is_void, void_reason, void_at, void_by
                ) values (
                  $1, $2, $3::timestamptz, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18::timestamptz, $19
                )
                on conflict (id) do nothing
              `,
              [
                String(trx.id),
                payload.store_id,
                String(trx.date || new Date().toISOString()),
                JSON.stringify(Array.isArray(trx.items) ? trx.items : []),
                Number(trx.subtotal || 0),
                Number(trx.discount || 0),
                trx.discount_label ?? null,
                Number(trx.tax || 0),
                Number(trx.total || 0),
                Number(trx.cogs || 0),
                Number(trx.paid || 0),
                Number(trx.change || 0),
                String(trx.method || 'Tunai'),
                String(trx.cashier || ''),
                trx.note ?? null,
                Boolean(trx.is_void),
                trx.void_reason ?? null,
                trx.void_at ?? null,
                trx.void_by ?? null,
              ],
            );
          }
          summary.migrated.push(`transactions (${payload.transactions.length})`);
        }
      } else {
        summary.skipped.push('transactions (empty)');
      }

      if (payload.expenses.length > 0) {
        const existing = await countRowsForStore(client, 'expenses', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('expenses (destination not empty)');
        } else {
          for (const expense of payload.expenses) {
            await client.query(
              `
                insert into public.expenses (
                  store_id, date, description, amount, category, cashier, source
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6, $7
                )
              `,
              [
                payload.store_id,
                String(expense.date || new Date().toISOString()),
                String(expense.description || ''),
                Number(expense.amount || 0),
                String(expense.category || 'Operasional'),
                expense.cashier ?? null,
                String(expense.source || 'cashier'),
              ],
            );
          }
          summary.migrated.push(`expenses (${payload.expenses.length})`);
        }
      } else {
        summary.skipped.push('expenses (empty)');
      }

      if (payload.cash_flow.length > 0) {
        const existing = await countRowsForStore(client, 'cash_flow', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('cash_flow (destination not empty)');
        } else {
          for (const entry of payload.cash_flow) {
            await client.query(
              `
                insert into public.cash_flow (
                  store_id, date, type, amount, description, cashier
                ) values (
                  $1, $2::timestamptz, $3, $4, $5, $6
                )
              `,
              [
                payload.store_id,
                String(entry.date || new Date().toISOString()),
                String(entry.type === 'in' ? 'in' : 'out'),
                Number(entry.amount || 0),
                entry.description ?? null,
                entry.cashier ?? null,
              ],
            );
          }
          summary.migrated.push(`cash_flow (${payload.cash_flow.length})`);
        }
      } else {
        summary.skipped.push('cash_flow (empty)');
      }

      if (payload.store_accounts.length > 0) {
        const existing = await countRowsForStore(client, 'store_accounts', payload.store_id);
        if (existing > 0) {
          summary.skipped.push('store_accounts (destination not empty)');
        } else {
          for (const account of payload.store_accounts) {
            await client.query(
              `
                insert into public.store_accounts (
                  store_id, username, password_hash, role, is_active
                ) values (
                  $1, $2, $3, $4, $5
                )
                on conflict (store_id, username) do update
                set
                  password_hash = excluded.password_hash,
                  role = excluded.role,
                  is_active = excluded.is_active
              `,
              [
                payload.store_id,
                String(account.username || 'kasir'),
                String(account.password_hash || ''),
                String(account.role === 'owner' ? 'owner' : 'kasir'),
                account.is_active ?? true,
              ],
            );
          }
          summary.migrated.push(`store_accounts (${payload.store_accounts.length})`);
        }
      }

      return summary;
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

router.get('/api/notifications', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    const [items, unreadCount] = await Promise.all([
      pool.query(
        `
          select id, user_id, title, message, type, is_read, metadata, created_at
          from public.notifications
          where user_id = $1
          order by created_at desc
          limit $2
        `,
        [req.authUser!.id, limit],
      ),
      pool.query(
        `
          select count(*)::int as unread_count
          from public.notifications
          where user_id = $1
            and is_read = false
        `,
        [req.authUser!.id],
      ),
    ]);

    res.json({
      items: items.rows,
      unreadCount: unreadCount.rows[0]?.unread_count ?? 0,
    });
  } catch (error) {
    next(error);
  }
});

router.patch('/api/notifications/read-all', async (req, res, next) => {
  try {
    const result = await pool.query(
      `
        update public.notifications
        set is_read = true
        where user_id = $1
          and is_read = false
      `,
      [req.authUser!.id],
    );

    res.json({ updated: result.rowCount ?? 0 });
  } catch (error) {
    next(error);
  }
});

export default router;
