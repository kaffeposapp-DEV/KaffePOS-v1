/**
 * Menu item routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import { z } from 'zod';
import {
  withTransaction,
  ApiError,
  requirePermission,
  assertStoreOwned,
  pickDefined,
  buildUpdateClause,
  menuColumns,
} from '../core';
import { menuRecipeItemSchema, prepareMenuItemPatchPayload } from '../lib/menuRecipePayload';

const router = Router();
const storeIdSchema = z.string().uuid();

const menuItemWriteSchema = z.object({
  id: z.string().uuid().optional(),
  store_id: z.string().uuid(),
  name: z.string().trim().min(1),
  price: z.number().nonnegative(),
  category: z.string().trim().min(1).default('Coffee'),
  image_url: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().nonnegative().optional(),
  recipe: z.array(menuRecipeItemSchema).optional(),
  variants: z.array(z.object({ name: z.string().trim().min(1), price: z.number().nonnegative() })).optional(),
});

router.get('/api/menu-items', async (req, res, next) => {
  try {
    const storeId = storeIdSchema.parse(req.query.storeId);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, req.authUser!.id);
      return client.query(
        `select ${menuColumns} from public.menu_items where store_id = $1 order by sort_order asc, created_at asc`,
        [storeId],
      );
    });

    res.json({ items: result.rows });
  } catch (error) {
    next(error);
  }
});

router.post('/api/menu-items', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const payload = menuItemWriteSchema.parse(req.body);
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, req.authUser!.id);
      return client.query(
        `
          insert into public.menu_items (
            id, store_id, name, price, category, image_url, description, is_available, sort_order, recipe, variants
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, $7, coalesce($8, true), coalesce($9, 0), coalesce($10, '[]'::jsonb), coalesce($11, '[]'::jsonb)
          )
          returning ${menuColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.name,
          Math.round(payload.price),
          payload.category,
          payload.image_url ?? null,
          payload.description ?? null,
          payload.is_available ?? true,
          payload.sort_order ?? 0,
          JSON.stringify(payload.recipe ?? []),
          JSON.stringify(payload.variants ?? []),
        ],
      );
    });

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/menu-items/:id', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    const payload = prepareMenuItemPatchPayload(
      pickDefined(req.body as Record<string, unknown>, [
        'name',
        'price',
        'category',
        'image_url',
        'description',
        'is_available',
        'sort_order',
        'recipe',
        'variants',
      ]),
    );
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select mi.id
          from public.menu_items mi
          join public.stores s on s.id = mi.store_id
          where mi.id = $1 and s.owner_id = $2
          limit 1
        `,
        [itemId, req.authUser!.id],
      );
      if (!existing.rows[0]) {
        throw new ApiError(404, 'Menu tidak ditemukan.');
      }

      return client.query(
        `
          update public.menu_items
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${menuColumns}
        `,
        [...values, itemId],
      );
    });

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

router.delete('/api/menu-items/:id', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.menu_items mi
          using public.stores s
          where mi.store_id = s.id
            and mi.id = $1
            and s.owner_id = $2
          returning mi.id
        `,
        [itemId, req.authUser!.id],
      );
      if (!result.rows[0]) {
        throw new ApiError(404, 'Menu tidak ditemukan.');
      }
    });

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
