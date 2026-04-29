import { z } from 'zod';

export const cashierStatusSchema = z.enum(['active', 'inactive']);
export type CashierStatus = z.infer<typeof cashierStatusSchema>;

export const cashierCreateInputSchema = z.object({
  displayName: z.string().trim().min(2, 'Nama kasir minimal 2 karakter.').max(120),
  email: z.string().trim().email('Email kasir tidak valid.').transform((value) => value.toLowerCase()),
  password: z.string().min(10, 'Password awal minimal 10 karakter.').max(128),
  storeId: z.string().uuid('Outlet tidak valid.'),
  status: cashierStatusSchema.default('active'),
});

export const cashierUpdateInputSchema = z.object({
  displayName: z.string().trim().min(2, 'Nama kasir minimal 2 karakter.').max(120).optional(),
  email: z.string().trim().email('Email kasir tidak valid.').transform((value) => value.toLowerCase()).optional(),
  password: z.string().min(10, 'Password baru minimal 10 karakter.').max(128).optional(),
  storeId: z.string().uuid('Outlet tidak valid.').optional(),
  status: cashierStatusSchema.optional(),
});

export function canCashierLogin(status: unknown): boolean {
  return cashierStatusSchema.safeParse(status).data === 'active';
}

export function normalizeCashierStatus(status: unknown): CashierStatus {
  return status === 'inactive' ? 'inactive' : 'active';
}

