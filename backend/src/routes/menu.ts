/**
 * Menu item routes.
 * Extracted from monolith index.ts — exact same behavior.
 */
import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../core';
import { menuRecipeItemSchema } from '../lib/menuRecipePayload';
import { MenuService } from '../services/MenuService';

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
    const items = await MenuService.listMenuItems(storeId, req.authUser!.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

router.post('/api/menu-items', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const payload = menuItemWriteSchema.parse(req.body);
    const item = await MenuService.createMenuItem(payload, req.authUser!.id);
    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

router.patch('/api/menu-items/:id', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    const item = await MenuService.updateMenuItem(itemId, req.body as Record<string, unknown>, req.authUser!.id);
    res.json(item);
  } catch (error) {
    next(error);
  }
});

router.delete('/api/menu-items/:id', requirePermission('can_manage_products'), async (req, res, next) => {
  try {
    const itemId = storeIdSchema.parse(req.params.id);
    await MenuService.deleteMenuItem(itemId, req.authUser!.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
