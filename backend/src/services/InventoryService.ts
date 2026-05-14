import {
  withTransaction,
  ApiError,
  assertStoreOwned,
  normalizeInventory,
  normalizeStockUnitConversion,
  pickDefined,
  buildUpdateClause,
  toNumber,
  inventoryColumns,
  stockUnitConversionColumns,
} from '../core';

export class InventoryService {
  static async listInventory(storeId: string, userId: string) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, userId);
      return client.query(
        `select ${inventoryColumns} from public.inventory where store_id = $1 order by name asc, created_at asc`,
        [storeId],
      );
    });
    return result.rows.map((row: Record<string, unknown>) => normalizeInventory(row));
  }

  static async createInventoryItem(payload: Record<string, any>, userId: string) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, userId);
      return client.query(
        `
          insert into public.inventory (
            id, store_id, name, sku, stock, unit, base_unit, purchase_unit, conversion_ratio, min_stock, cost_per_unit, is_active
          ) values (
            coalesce($1, gen_random_uuid()),
            $2, $3, $4, $5, $6, coalesce($7, $6), coalesce($8, $6), coalesce($9, 1), $10, $11, coalesce($12, true)
          )
          returning ${inventoryColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.name,
          payload.sku ?? null,
          payload.stock,
          payload.unit,
          payload.base_unit ?? null,
          payload.purchase_unit ?? null,
          payload.conversion_ratio ?? null,
          payload.min_stock ?? 5,
          payload.cost_per_unit ?? 0,
          payload.is_active ?? true,
        ],
      );
    });
    return normalizeInventory(result.rows[0]);
  }

  static async updateInventoryItem(itemId: string, body: Record<string, unknown>, userId: string) {
    const payload = pickDefined(body, [
      'name',
      'sku',
      'stock',
      'unit',
      'base_unit',
      'purchase_unit',
      'conversion_ratio',
      'min_stock',
      'cost_per_unit',
      'is_active',
    ]);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select i.id
          from public.inventory i
          join public.stores s on s.id = i.store_id
          where i.id = $1 and s.owner_id = $2
          limit 1
        `,
        [itemId, userId],
      );
      if (!existing.rows[0]) throw new ApiError(404, 'Item inventory tidak ditemukan.');

      return client.query(
        `
          update public.inventory
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${inventoryColumns}
        `,
        [...values, itemId],
      );
    });
    return normalizeInventory(result.rows[0]);
  }

  static async deleteInventoryItem(itemId: string, userId: string) {
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.inventory i
          using public.stores s
          where i.store_id = s.id
            and i.id = $1
            and s.owner_id = $2
          returning i.id
        `,
        [itemId, userId],
      );
      if (!result.rows[0]) throw new ApiError(404, 'Item inventory tidak ditemukan.');
    });
  }

  static async listUnitConversions(storeId: string, userId: string) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, storeId, userId);
      return client.query(
        `
          select ${stockUnitConversionColumns}
          from public.inventory_unit_conversions
          where store_id = $1
          order by created_at asc
        `,
        [storeId],
      );
    });
    return result.rows.map((row: Record<string, unknown>) => normalizeStockUnitConversion(row));
  }

  static async createUnitConversion(payload: Record<string, any>, userId: string) {
    const result = await withTransaction(async (client) => {
      await assertStoreOwned(client, payload.store_id, userId);
      if (payload.ingredient_id) {
        const ingredient = await client.query(
          `select id from public.inventory where id = $1 and store_id = $2 limit 1`,
          [payload.ingredient_id, payload.store_id],
        );
        if (!ingredient.rows[0]) {
          throw new ApiError(404, 'Bahan baku untuk konversi tidak ditemukan.');
        }
      }

      return client.query(
        `
          insert into public.inventory_unit_conversions (
            id, store_id, ingredient_id, from_unit, to_unit, ratio, is_active
          ) values (
            coalesce($1, gen_random_uuid()), $2, $3, $4, $5, $6, coalesce($7, true)
          )
          returning ${stockUnitConversionColumns}
        `,
        [
          payload.id ?? null,
          payload.store_id,
          payload.ingredient_id ?? null,
          payload.from_unit,
          payload.to_unit,
          payload.ratio,
          payload.is_active ?? true,
        ],
      );
    });
    return normalizeStockUnitConversion(result.rows[0]);
  }

  static async updateUnitConversion(conversionId: string, body: Record<string, unknown>, userId: string) {
    const payload = pickDefined(body, ['ingredient_id', 'from_unit', 'to_unit', 'ratio', 'is_active']);
    const { clause, values } = buildUpdateClause(payload);

    const result = await withTransaction(async (client) => {
      const existing = await client.query(
        `
          select c.id
          from public.inventory_unit_conversions c
          join public.stores s on s.id = c.store_id
          where c.id = $1 and s.owner_id = $2
          limit 1
        `,
        [conversionId, userId],
      );
      if (!existing.rows[0]) throw new ApiError(404, 'Konversi satuan tidak ditemukan.');

      return client.query(
        `
          update public.inventory_unit_conversions
          set ${clause}, updated_at = now()
          where id = $${values.length + 1}
          returning ${stockUnitConversionColumns}
        `,
        [...values, conversionId],
      );
    });
    return normalizeStockUnitConversion(result.rows[0]);
  }

  static async deleteUnitConversion(conversionId: string, userId: string) {
    await withTransaction(async (client) => {
      const result = await client.query(
        `
          delete from public.inventory_unit_conversions c
          using public.stores s
          where c.store_id = s.id
            and c.id = $1
            and s.owner_id = $2
          returning c.id
        `,
        [conversionId, userId],
      );
      if (!result.rows[0]) throw new ApiError(404, 'Konversi satuan tidak ditemukan.');
    });
  }

}
