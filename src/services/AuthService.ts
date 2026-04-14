import { AUTH_REDIRECT_URL, supabase } from '@/lib/supabase';
import { isExistingSignupAttempt, normalizeSignupErrorMessage } from '@/utils/authFlow';

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
    if (
      password.length < 10 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      return { success: false, error: 'Password minimal 10 karakter dan wajib mengandung huruf besar, huruf kecil, serta angka' };
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
        emailRedirectTo: AUTH_REDIRECT_URL,
      }
    });

    if (error) {
      const status = typeof error.status === 'number' ? error.status : undefined;
      const normalizedError = normalizeSignupErrorMessage({
        message: error.message,
        status,
      });
      return { success: false, error: normalizedError || `Pendaftaran gagal: ${error.message}` };
    }

    if (isExistingSignupAttempt(data)) {
      return { success: false, error: 'Email ini sudah terdaftar. Coba login atau kirim ulang verifikasi.' };
    }

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cek internet kamu.';
    return { success: false, error: `Koneksi bermasalah: ${message}` };
  }
};

export const resendVerificationEmail = async (
  email: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    const cleanEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: cleanEmail,
      options: {
        emailRedirectTo: AUTH_REDIRECT_URL,
      },
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Coba lagi.';
    return { success: false, error: `Gagal kirim ulang: ${message}` };
  }
};
