import { supabase } from '@/lib/supabase';

export const registerWithEmail = async (
  username: string,
  email: string,
  password: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // Validasi frontend dulu
    if (username.length < 3) {
      return { success: false, error: 'Username minimal 3 karakter' };
    }
    if (password.length < 8) {
      return { success: false, error: 'Password minimal 8 karakter' };
    }
    if (!/\d/.test(password)) {
      return { success: false, error: 'Password harus mengandung angka' };
    }

    // Cek username sudah dipakai
    const { data: existing } = await supabase
      .from('profiles')
      .select('username')
      .eq('username', username)
      .maybeSingle();

    if (existing) {
      return { success: false, error: 'Username sudah digunakan' };
    }

    // Daftar ke Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        emailRedirectTo: 'id.kaffeepos.app://email-confirmed',
      }
    });

    if (error) {
      // Handle error spesifik
      if (error.message.includes('already registered')) {
        return { success: false, error: 'Email ini sudah terdaftar. Coba login.' };
      }
      if (error.message.includes('invalid email')) {
        return { success: false, error: 'Format email tidak valid' };
      }
      return { success: false, error: `Pendaftaran gagal: ${error.message}` };
    }

    // Jika identities kosong = email sudah terdaftar
    if (data.user?.identities?.length === 0) {
      return { success: false, error: 'Email ini sudah terdaftar. Coba login.' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Koneksi bermasalah: ${err.message || 'Cek internet kamu.'}` };
  }
};

export const resendVerificationEmail = async (
  email: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: {
        emailRedirectTo: 'id.kaffeepos.app://email-confirmed'
      }
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: any) {
    return { success: false, error: `Gagal kirim ulang: ${err.message || 'Coba lagi.'}` };
  }
};
