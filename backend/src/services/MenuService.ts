import {
  withTransaction,
  ApiError,
  assertStoreOwned,
  pickDefined,
  buildUpdateClause,
  menuColumns,
} from '../core';
import { cache, cacheTtl } from '../lib/cache';
import { prepareMenuItemPatchPayload } from '../lib/menuRecipePayload';

export class MenuService {
  static async listMenuItems(storeId: string, userId: string) {
    return cache.getOrSet(`menu-items:${storeId}`, async () => {
      const result = await withTransaction(async (client) => {
        await assertStoreOwned(client, storeId, userId);
        return client.query(
          `select ${menuColumns} from public.menu_items where store_id = $1 order by sort_order asc, created_at asc`,
          [storeId],
        );
      });
      return result.rows;
    }, cacheTtl.menuItems);
  }

  static async createMenuItem(payload: Record<string, any>, userId: string) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, userId);
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
    cache.delete(`menu-items:${payload.store_id}`);
    return result.rows[0];
  }

  static async updateMenuItem(itemId: string, body: Record<string, unknown>, userId: string) {
    const payload = prepareMenuItemPatchPayload(
      pickDefined(body, ['name', 'price', 'category', 'image_url', 'description', 'is_available', 'sort_order', 'recipe', 'variants']),
    );
    const { clause, values } = buildUpdateClause(payload);
    let storeId: string | null = null;

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select mi.id, mi.store_id
          from public.menu_items mi
          join public.stores s on s.id = mi.store_id
          where mi.id = $1 and s.owner_id = $2
          limit 1
        `,
        [itemId, userId],
      );
      if (!existing.rows[0]) throw new ApiError(404, 'Menu tidak ditemukan.');
      storeId = String(existing.rows[0].store_id);

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
    if (storeId) cache.delete(`menu-items:${storeId}`);
    return result.rows[0];
  }

  static async deleteMenuItem(itemId: string, userId: string) {
    let storeId: string | null = null;
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.menu_items mi
          using public.stores s
          where mi.store_id = s.id
            and mi.id = $1
            and s.owner_id = $2
          returning mi.id, mi.store_id
        `,
        [itemId, userId],
      );
      if (!result.rows[0]) throw new ApiError(404, 'Menu tidak ditemukan.');
      storeId = String(result.rows[0].store_id);
    });
    if (storeId) cache.delete(`menu-items:${storeId}`);
  }
}
