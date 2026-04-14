import { AUTH_REDIRECT_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase';
import { normalizeRequestedUsername, normalizeSignupErrorMessage } from '@/utils/authFlow';

async function invokeAuthEmail(body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/auth-email`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  let data: Record<string, unknown> | null = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  return { status: response.status, data };
}

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
    const cleanEmail = email.trim().toLowerCase();
    const cleanUsername = username.trim();
    const normalizedUsername = normalizeRequestedUsername(cleanUsername);

    if (!normalizedUsername) {
      return { success: false, error: 'Username minimal 3 karakter setelah dirapikan' };
    }

    const { status, data } = await invokeAuthEmail({
      action: 'signup',
      email: cleanEmail,
      password,
      username: cleanUsername,
      displayName: cleanUsername,
      redirectTo: AUTH_REDIRECT_URL,
    });

    if (status >= 400) {
      const normalizedError = normalizeSignupErrorMessage({
        message: String(data?.error || 'Pendaftaran gagal'),
        status,
      });
      return { success: false, error: normalizedError || String(data?.error || 'Pendaftaran gagal') };
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
    const { status, data } = await invokeAuthEmail({
      action: 'resend_signup',
      email: cleanEmail,
    });
    if (status >= 400) return { success: false, error: String(data?.error || 'Gagal kirim ulang email') };
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Coba lagi.';
    return { success: false, error: `Gagal kirim ulang: ${message}` };
  }
};
