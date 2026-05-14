import { jobQueue } from './jobQueue';
import { EmailService } from './email/EmailService';
import { log, serializeError } from '../core/errors';

type SendWelcomeEmailJob = {
  email: string;
  storeName: string;
};

type SendPasswordResetEmailJob = {
  email: string;
  resetLink: string;
};

type SendTrialReminderEmailJob = {
  email: string;
  storeName: string;
  daysUsed: 10 | 13;
  daysLeft: number;
  trialEndsAt?: string | null;
};

export function initEmailJobs(): void {
  const emailService = EmailService;

  jobQueue.register<SendWelcomeEmailJob>('email.welcome', async (payload) => {
    try {
      await emailService.sendWelcome({ to: payload.email, storeName: payload.storeName });
      log('info', 'email.welcome_sent', { email: payload.email });
    } catch (error) {
      log('error', 'email.welcome_failed', { email: payload.email, error: serializeError(error) });
      throw error;
    }
  });

  jobQueue.register<SendPasswordResetEmailJob>('email.password_reset', async (payload) => {
    try {
      await emailService.sendPasswordReset({ to: payload.email, resetLink: payload.resetLink });
      log('info', 'email.password_reset_sent', { email: payload.email });
    } catch (error) {
      log('error', 'email.password_reset_failed', { email: payload.email, error: serializeError(error) });
      throw error;
    }
  });

  jobQueue.register<SendTrialReminderEmailJob>('email.trial_reminder', async (payload) => {
    try {
      await emailService.sendTrialReminder({
        to: payload.email,
        storeName: payload.storeName,
        daysUsed: payload.daysUsed,
        daysLeft: payload.daysLeft,
        trialEndsAt: payload.trialEndsAt,
      });
      log('info', 'email.trial_reminder_sent', { email: payload.email, daysLeft: payload.daysLeft });
    } catch (error) {
      log('error', 'email.trial_reminder_failed', { email: payload.email, error: serializeError(error) });
      throw error;
    }
  });

  log('info', 'email_jobs.initialized', { handlers: 3 });
}

export function enqueueWelcomeEmail(email: string, storeName: string): void {
  jobQueue.enqueue('email.welcome', { email, storeName });
}

export function enqueuePasswordResetEmail(email: string, resetLink: string): void {
  jobQueue.enqueue('email.password_reset', { email, resetLink });
}

export function enqueueTrialReminderEmail(
  email: string,
  storeName: string,
  daysUsed: 10 | 13,
  daysLeft: number,
  trialEndsAt?: string | null,
): void {
  jobQueue.enqueue('email.trial_reminder', { email, storeName, daysUsed, daysLeft, trialEndsAt });
}
