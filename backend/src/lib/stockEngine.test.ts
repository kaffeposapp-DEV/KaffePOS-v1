import { describe, expect, it } from 'vitest';
import { convertRecipeQuantityToBase, type UnitConversionRecord } from './stockEngine';

const conversions: UnitConversionRecord[] = [
  { ingredient_id: 'sumpit-id', from_unit: 'bal', to_unit: 'pack', ratio: 10, is_active: true },
  { ingredient_id: 'sumpit-id', from_unit: 'pack', to_unit: 'pcs', ratio: 15, is_active: true },
  { ingredient_id: 'mika-id', from_unit: 'mika', to_unit: 'pcs', ratio: 15, is_active: true },
];

describe('backend stock engine', () => {
  it('keeps checkout stock deduction unit-aware for direct conversions', () => {
    expect(convertRecipeQuantityToBase({
      ingredientId: 'mika-id',
      qty: 2,
      fromUnit: 'mika',
      baseUnit: 'pcs',
      conversions,
    })).toEqual({
      quantity: 30,
      path: ['mika', 'pcs'],
    });
  });

  it('supports chained conversions for nested purchase units', () => {
    expect(convertRecipeQuantityToBase({
      ingredientId: 'sumpit-id',
      qty: 1,
      fromUnit: 'bal',
      baseUnit: 'pcs',
      conversions,
    })).toEqual({
      quantity: 150,
      path: ['bal', 'pack', 'pcs'],
    });
  });

  it('fails loudly when a recipe references an unknown conversion', () => {
    expect(() => convertRecipeQuantityToBase({
      ingredientId: 'sumpit-id',
      qty: 1,
      fromUnit: 'box',
      baseUnit: 'pcs',
      conversions,
    })).toThrow('Konversi satuan box ke pcs belum tersedia.');
  });
});
