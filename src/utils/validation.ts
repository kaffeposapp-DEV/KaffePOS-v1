 
 
 
 
 
 
import { z } from 'zod';

const strongPassword = z.string()
  .min(10, 'Password minimal 10 karakter')
  .regex(/[A-Z]/, 'Password wajib mengandung huruf besar')
  .regex(/[a-z]/, 'Password wajib mengandung huruf kecil')
  .regex(/\d/, 'Password wajib mengandung angka');

export const loginSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
});

export const signUpSchema = z.object({
  email: z.string().email('Format email tidak valid'),
  password: strongPassword,
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
