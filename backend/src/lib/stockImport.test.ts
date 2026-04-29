import { describe, expect, it } from 'vitest';
import { validateStockBulkImportRows } from './stockImport';

describe('stock bulk import validation', () => {
  it('validates ingredients, products, conversions, and recipes as one import contract', () => {
    const result = validateStockBulkImportRows([
      { rowNumber: 2, kind: 'ingredient', name: 'Gula Aren', stock: 10, base_unit: 'kg', total_cost: 45000 },
      { rowNumber: 3, kind: 'product', name: 'Kopi Susu', price: 18000, category: 'Coffee' },
      { rowNumber: 4, kind: 'conversion', ingredient_name: 'Gula Aren', from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
      { rowNumber: 5, kind: 'recipe', product_name: 'Kopi Susu', ingredient_name: 'Gula Aren', qty_per_serving: 20, unit_reference: 'gram' },
    ], {
      existingIngredientNames: [],
      existingProductNames: [],
      mode: 'create_only',
    });

    expect(result.errors).toEqual([]);
    expect(result.summary).toEqual({
      ingredients: 1,
      conversions: 1,
      products: 1,
      recipes: 1,
    });
  });

  it('blocks create-only duplicate import before database writes happen', () => {
    const result = validateStockBulkImportRows([
      { rowNumber: 2, kind: 'ingredient', name: 'Gula Aren', stock: 10, base_unit: 'kg', total_cost: 45000 },
    ], {
      existingIngredientNames: ['Gula Aren'],
      existingProductNames: [],
      mode: 'create_only',
    });

    expect(result.validRows).toEqual([]);
    expect(result.errors).toEqual([
      {
        rowNumber: 2,
        message: 'Bahan baku sudah ada. Pilih mode update/upsert jika ingin memperbarui.',
      },
    ]);
  });

  it('blocks recipes that reference missing product or ingredient names', () => {
    const result = validateStockBulkImportRows([
      { rowNumber: 2, kind: 'recipe', product_name: 'Menu Hilang', ingredient_name: 'Bahan Hilang', qty_per_serving: 1 },
    ], {
      existingIngredientNames: [],
      existingProductNames: [],
      mode: 'upsert',
    });

    expect(result.errors[0].message).toBe('Produk resep tidak ditemukan di data lama atau file import.');
  });

  it('blocks duplicate conversion creation and allows upsert/update to prevent replay duplicates', () => {
    const duplicateCreate = validateStockBulkImportRows([
      { rowNumber: 2, kind: 'conversion', ingredient_name: 'Gula Aren', from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
    ], {
      existingIngredientNames: ['Gula Aren'],
      existingProductNames: [],
      existingConversions: [{ ingredientName: 'Gula Aren', fromUnit: 'kg', toUnit: 'gram' }],
      mode: 'create_only',
    });

    const upsert = validateStockBulkImportRows([
      { rowNumber: 2, kind: 'conversion', ingredient_name: 'Gula Aren', from_unit: 'kg', to_unit: 'gram', ratio: 1000 },
    ], {
      existingIngredientNames: ['Gula Aren'],
      existingProductNames: [],
      existingConversions: [{ ingredientName: 'Gula Aren', fromUnit: 'kg', toUnit: 'gram' }],
      mode: 'upsert',
    });

    expect(duplicateCreate.errors[0].message).toBe('Konversi satuan sudah ada. Pilih mode update/upsert jika ingin memperbarui.');
    expect(upsert.errors).toEqual([]);
    expect(upsert.validRows).toHaveLength(1);
  });
});
