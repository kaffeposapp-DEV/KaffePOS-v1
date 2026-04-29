import { describe, expect, it } from 'vitest';
import { prepareMenuItemPatchPayload } from './menuRecipePayload';

describe('menu recipe payload hardening', () => {
  it('serializes recipe and variants for PostgreSQL jsonb patch updates', () => {
    const payload = prepareMenuItemPatchPayload({
      name: 'Kopi Susu',
      price: 18000,
      category: 'Coffee',
      recipe: [
        {
          matId: '11111111-1111-4111-8111-111111111111',
          qty: 20,
          unit_reference: 'gram',
        },
      ],
      variants: [{ name: 'Hot', price: 18000 }],
    });

    expect(payload.recipe).toBe('[{"matId":"11111111-1111-4111-8111-111111111111","qty":20,"unit_reference":"gram"}]');
    expect(payload.variants).toBe('[{"name":"Hot","price":18000}]');
  });

  it('rejects incomplete recipe lines before they become backend/database errors', () => {
    expect(() => prepareMenuItemPatchPayload({
      recipe: [{ matId: '', qty: 0 }],
    })).toThrow('Bahan resep tidak valid.');
  });
});
