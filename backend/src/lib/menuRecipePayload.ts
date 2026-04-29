import { z } from 'zod';

export const menuRecipeItemSchema = z.object({
  matId: z.string().uuid('Bahan resep tidak valid.'),
  qty: z.number().positive('Jumlah bahan per porsi harus lebih dari 0.'),
  unit_reference: z.string().trim().optional(),
  note: z.string().trim().optional(),
});

export const menuVariantSchema = z.object({
  name: z.string().trim().min(1, 'Nama varian wajib diisi.'),
  price: z.number().nonnegative('Harga varian tidak boleh negatif.'),
});

const menuItemPatchSchema = z.object({
  name: z.string().trim().min(1, 'Nama menu wajib diisi.').optional(),
  price: z.number().nonnegative('Harga menu tidak boleh negatif.').optional(),
  category: z.string().trim().min(1, 'Kategori menu wajib diisi.').optional(),
  image_url: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  is_available: z.boolean().optional(),
  sort_order: z.number().int().nonnegative('Urutan menu tidak valid.').optional(),
  recipe: z.array(menuRecipeItemSchema).optional(),
  variants: z.array(menuVariantSchema).optional(),
});

export function prepareMenuItemPatchPayload(rawPayload: Record<string, unknown>) {
  const parsed = menuItemPatchSchema.parse(rawPayload);
  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (value === undefined) continue;
    if (key === 'recipe' || key === 'variants') {
      payload[key] = JSON.stringify(value);
      continue;
    }
    payload[key] = value;
  }

  return payload;
}
