import { log, serializeError } from '../core/errors';

type JobHandler<T> = (payload: T) => Promise<void>;

type QueuedJob<T = unknown> = {
  id: string;
  name: string;
  payload: T;
  attempts: number;
  maxAttempts: number;
  createdAt: number;
  runAfter: number;
};

export class JobQueue {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private readonly queue: QueuedJob[] = [];
  private isProcessing = false;
  private timer: NodeJS.Timeout | null = null;

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  registerHandler<T>(name: string, handler: JobHandler<T>): void {
    this.register(name, handler);
  }

  enqueue<T>(name: string, payload: T, options?: { maxAttempts?: number; delayMs?: number }): string {
    const id = `${name}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    this.queue.push({
      id,
      name,
      payload,
      attempts: 0,
      maxAttempts: options?.maxAttempts ?? 3,
      createdAt: Date.now(),
      runAfter: Date.now() + (options?.delayMs ?? 0),
    });
    this.schedule();
    return id;
  }

  stats() {
    return {
      queued: this.queue.length,
      handlers: this.handlers.size,
      processing: this.isProcessing,
    };
  }

  async drain(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while ((this.queue.length > 0 || this.isProcessing) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  start(): void {
    this.schedule();
  }

  private schedule(): void {
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.process();
    }, 10);
    this.timer.unref?.();
  }

  private async process(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const now = Date.now();
      const readyIndex = this.queue.findIndex((job) => job.runAfter <= now);
      if (readyIndex === -1) return;

      const [job] = this.queue.splice(readyIndex, 1);
      const handler = this.handlers.get(job.name);

      if (!handler) {
        log('warn', 'job_queue.missing_handler', { jobId: job.id, name: job.name });
        return;
      }

      try {
        await handler(job.payload);
        log('info', 'job_queue.completed', { jobId: job.id, name: job.name, attempts: job.attempts + 1 });
      } catch (error) {
        job.attempts += 1;
        log('error', 'job_queue.failed', {
          jobId: job.id,
          name: job.name,
          attempts: job.attempts,
          error: serializeError(error),
        });

        if (job.attempts < job.maxAttempts) {
          job.runAfter = Date.now() + Math.min(30_000, 1000 * 2 ** job.attempts);
          this.queue.push(job);
        }
      }
    } finally {
      this.isProcessing = false;
      if (this.queue.length > 0) this.schedule();
    }
  }
}

export const jobQueue = new JobQueue();

export function enqueueEmail(payload: {
  to: string;
  subject: string;
  body: string;
  html?: string;
}): string {
  return jobQueue.enqueue('email', payload);
}

export function enqueueAnalytics(payload: {
  event: string;
  userId?: string;
  storeId?: string;
  properties?: Record<string, unknown>;
}): string {
  return jobQueue.enqueue('analytics', payload);
}

export function enqueueNotification(payload: {
  userId: string;
  storeId: string;
  title: string;
  message: string;
  type: string;
  category: string;
  metadata?: Record<string, unknown>;
}): string {
  return jobQueue.enqueue('notification', payload);
}

export function enqueueCommissionCalculation(payload: {
  transactionId: string;
  storeId: string;
  amount: number;
  referralCode?: string;
}): string {
  return jobQueue.enqueue('commission', payload);
}
