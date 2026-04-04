/* eslint-disable react-hooks/exhaustive-deps */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable react-refresh/only-export-components */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});

export const signUpSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
  username: z.string().min(3, 'Username minimal 3 karakter').max(30, 'Username maksimal 30 karakter'),
});

export const licenseSchema = z.object({
  licenseKey: z.string().min(10, 'Kode lisensi minimal 10 karakter'),
});

export const menuItemSchema = z.object({
  name: z.string().min(1, 'Nama menu wajib diisi'),
  price: z.number().min(0, 'Harga tidak boleh negatif'),
  category: z.string().min(1, 'Kategori wajib diisi'),
});
