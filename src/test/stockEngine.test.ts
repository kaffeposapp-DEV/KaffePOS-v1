import { describe, expect, it } from 'vitest';
import {
  buildBulkImportPreview,
  buildStockDeductionPlan,
  calculateGrossMargin,
  calculateProductHpp,
  convertQuantity,
  parseStockImportCsv,
} from '@/lib/stockEngine';
import type { InventoryItem, MenuItem, StockUnitConversion } from '@/types';

const inventory: InventoryItem[] = [
  {
    id: 'mika-id',
    store_id: 'store-1',
    name: 'Mika Frozen',
    stock: 60,
    unit: 'pcs',
    base_unit: 'pcs',
    min_stock: 10,
    cost_per_unit: 800,
    is_active: true,
  },
  {
    id: 'sumpit-id',
    store_id: 'store-1',
    name: 'Sumpit',
    stock: 450,
    unit: 'pcs',
    base_unit: 'pcs',
    min_stock: 100,
    cost_per_unit: 120,
    is_active: true,
  },
  {
    id: 'sauce-id',
    store_id: 'store-1',
    name: 'Saus Sachet',
    stock: 20,
    unit: 'pcs',
    min_stock: 5,
    cost_per_unit: 0,
  },
];

const conversions: StockUnitConversion[] = [
  {
    id: 'conv-mika',
    store_id: 'store-1',
    ingredient_id: 'mika-id',
    from_unit: 'mika',
    to_unit: 'pcs',
    ratio: 15,
    is_active: true,
  },
  {
    id: 'conv-pack',
    store_id: 'store-1',
    ingredient_id: 'sumpit-id',
    from_unit: 'pack',
    to_unit: 'pcs',
    ratio: 15,
    is_active: true,
  },
  {
    id: 'conv-bal',
    store_id: 'store-1',
    ingredient_id: 'sumpit-id',
    from_unit: 'bal',
    to_unit: 'pack',
    ratio: 10,
    is_active: true,
  },
];

describe('stock engine', () => {
  it('converts direct and chained purchase units into base units', () => {
    expect(convertQuantity(1, 'mika', 'pcs', conversions, 'mika-id')).toEqual({
      quantity: 15,
      path: ['mika', 'pcs'],
    });
    expect(convertQuantity(1, 'bal', 'pcs', conversions, 'sumpit-id')).toEqual({
      quantity: 150,
      path: ['bal', 'pack', 'pcs'],
    });
  });

  it('calculates product HPP and gross margin from recipe usage', () => {
    const product: MenuItem = {
      id: 'menu-1',
      store_id: 'store-1',
      name: 'Mika Goreng',
      price: 12000,
      category: 'Snack',
      is_available: true,
      recipe: [{ matId: 'mika-id', qty: 4, unit_reference: 'pcs' }],
    };

    const hpp = calculateProductHpp(product, inventory, conversions);

    expect(hpp.totalCost).toBe(3200);
    expect(hpp.complete).toBe(true);
    expect(calculateGrossMargin(product.price, hpp.totalCost)).toEqual({
      grossProfit: 8800,
      marginPercent: 73.33,
      markupPercent: 275,
    });
  });

  it('marks HPP incomplete when ingredient cost is missing', () => {
    const product: MenuItem = {
      id: 'menu-2',
      store_id: 'store-1',
      name: 'Saus Tambahan',
      price: 2000,
      category: 'Addon',
      is_available: true,
      recipe: [{ matId: 'sauce-id', qty: 1, unit_reference: 'pcs' }],
    };

    const hpp = calculateProductHpp(product, inventory, conversions);

    expect(hpp.complete).toBe(false);
    expect(hpp.warnings).toContain('Saus Sachet belum punya harga beli valid.');
  });

  it('aggregates stock deduction plan across duplicate cart lines', () => {
    const menu: MenuItem[] = [
      {
        id: 'menu-1',
        store_id: 'store-1',
        name: 'Mika Goreng',
        price: 12000,
        category: 'Snack',
        is_available: true,
        recipe: [{ matId: 'mika-id', qty: 4, unit_reference: 'pcs' }],
      },
    ];

    const plan = buildStockDeductionPlan(
      [
        { id: 'menu-1', name: 'Mika Goreng', qty: 2, menu_item_id: 'menu-1' },
        { id: 'menu-1', name: 'Mika Goreng', qty: 1, menu_item_id: 'menu-1' },
      ],
      menu,
      inventory,
      conversions,
    );

    expect(plan.items).toEqual([
      expect.objectContaining({
        ingredientId: 'mika-id',
        ingredientName: 'Mika Frozen',
        requiredQty: 12,
        stockAfter: 48,
      }),
    ]);
    expect(plan.ok).toBe(true);
  });

  it('parses and validates bulk import rows before commit', () => {
    const parsed = parseStockImportCsv(`kind,name,stock,base_unit,total_cost,from_unit,to_unit,ratio,product_name,ingredient_name,qty_per_serving,price,category
ingredient,Gula Aren,10,kg,45000,,,,,,,
conversion,,,,,kg,gram,1000,,,,,
product,Kopi Susu,,,,,,,,,,18000,Coffee
recipe,,,,,,,,Kopi Susu,Gula Aren,20,,`);

    const preview = buildBulkImportPreview(parsed.rows, {
      inventory: [],
      menu: [],
      conversions: [],
      mode: 'create_only',
    });

    expect(parsed.rows).toHaveLength(4);
    expect(preview.validRows).toHaveLength(4);
    expect(preview.errors).toEqual([]);
    expect(preview.summary).toMatchObject({
      ingredients: 1,
      conversions: 1,
      products: 1,
      recipes: 1,
    });
  });

  it('blocks unsafe duplicate import in create-only mode', () => {
    const parsed = parseStockImportCsv('kind,name,stock,base_unit,total_cost\ningredient,Mika Frozen,10,pcs,50000');
    const preview = buildBulkImportPreview(parsed.rows, {
      inventory,
      menu: [],
      conversions,
      mode: 'create_only',
    });

    expect(preview.validRows).toEqual([]);
    expect(preview.errors[0]).toMatchObject({
      rowNumber: 2,
      message: 'Bahan baku sudah ada. Pilih mode update/upsert jika ingin memperbarui.',
    });
  });
});
