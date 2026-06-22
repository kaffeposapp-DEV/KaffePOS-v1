/**
 * Email sending, templates, and OTP/reset code management.
 * Extracted from monolith index.ts — exact same logic.
 */
import type { PoolClient } from 'pg';
import { env } from './env';
import { generateOtpCode, addMinutes } from './helpers';
import { buildPasswordResetLink } from '../lib/emailLinks';
import { EmailService } from '../lib/email/EmailService';

// ── Core send ──────────────────────────────────────────────────

export async function sendEmail(payload: { to: string; subject: string; html: string; text: string }) {
  return EmailService.send(payload);
}

// ── Email code ─────────────────────────────────────────────────

export async function createEmailCode(client: PoolClient, email: string, purpose: 'signup' | 'reset_password') {
  const code = generateOtpCode();
  const expiresAt = addMinutes(new Date(), env.EMAIL_CODE_TTL_MINUTES).toISOString();

  await client.query(
    `
      insert into public.email_verification_codes (
        email,
        purpose,
        code,
        expires_at
      ) values ($1, $2, $3, $4)
    `,
    [email, purpose, code, expiresAt],
  );

  return { code, expiresAt };
}

export function getResetLink(email: string, token: string) {
  return buildPasswordResetLink({ webBaseUrl: env.WEB_BASE_URL, email, token });
}

// ── Specific email senders (all routed through EmailService for escaping) ──

export async function sendSignupOtpEmail(email: string, code: string, storeName: string) {
  await EmailService.sendSignupOtp({ to: email, code, storeName, ttlMinutes: env.EMAIL_CODE_TTL_MINUTES });
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  await EmailService.sendPasswordReset({ to: email, resetLink });
}

export async function sendWelcomeEmail(email: string, storeName: string) {
  await EmailService.sendWelcome({ to: email, storeName });
}

export async function sendPasswordChangedEmail(email: string) {
  await EmailService.sendPasswordChanged({ to: email });
}

export async function sendAccountLockoutEmail(email: string, lockedUntil: Date) {
  await EmailService.sendAccountLockout({ to: email, lockedUntil });
}

export async function sendPaymentSuccessEmail(email: string, storeName: string, planName: string, amount: number, orderId: string) {
  await EmailService.sendInvoiceReceipt({ to: email, storeName, planName, amount, orderId });
}

export async function sendTrialReminderEmail(email: string, storeName: string, daysUsed: 10 | 13, daysLeft: number, trialEndsAt?: string | null) {
  await EmailService.sendTrialReminder({ to: email, storeName, daysUsed, daysLeft, trialEndsAt });
}

export async function sendFeedbackThankYouEmail(email: string, category: string, storeName?: string | null) {
  await EmailService.sendFeedbackThankYou({ to: email, category, storeName });
}
