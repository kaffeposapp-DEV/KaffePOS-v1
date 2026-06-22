import { randomUUID } from 'node:crypto';
import { pool } from '../core/db';
import { log, serializeError } from '../core/errors';

type JobHandler<T> = (payload: T) => Promise<void>;

/**
 * Durable background job queue backed by Postgres (`public.background_jobs`).
 *
 * Jobs survive process restarts/crashes: `enqueue` persists the job, a poller
 * claims ready rows with `FOR UPDATE SKIP LOCKED` (safe across instances), runs
 * the handler, then deletes on success or reschedules with exponential backoff.
 * A job stuck in `processing` (handler crashed mid-run) is reclaimed after a
 * stale window. After `max_attempts` it is dead-lettered (`status='failed'`).
 */
export class JobQueue {
  private readonly handlers = new Map<string, JobHandler<unknown>>();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private isTicking = false;
  private schemaReady: Promise<void> | null = null;

  private readonly idlePollMs = 1500;
  private readonly drainPollMs = 15;
  private readonly staleProcessingSeconds = 300;

  register<T>(name: string, handler: JobHandler<T>): void {
    this.handlers.set(name, handler as JobHandler<unknown>);
  }

  registerHandler<T>(name: string, handler: JobHandler<T>): void {
    this.register(name, handler);
  }

  private ensureSchema(): Promise<void> {
    this.schemaReady ??= pool
      .query(`
        create table if not exists public.background_jobs (
          id uuid primary key,
          name text not null,
          payload jsonb not null default '{}'::jsonb,
          attempts integer not null default 0,
          max_attempts integer not null default 3,
          run_after timestamptz not null default now(),
          status text not null default 'pending',
          last_error text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now()
        );
        create index if not exists background_jobs_ready_idx
          on public.background_jobs (status, run_after);
      `)
      .then(() => undefined)
      .catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    return this.schemaReady;
  }

  enqueue<T>(name: string, payload: T, options?: { maxAttempts?: number; delayMs?: number }): string {
    const id = randomUUID();
    void this.persist(id, name, payload, options?.maxAttempts ?? 3, options?.delayMs ?? 0);
    return id;
  }

  private async persist(id: string, name: string, payload: unknown, maxAttempts: number, delayMs: number): Promise<void> {
    try {
      await this.ensureSchema();
      await pool.query(
        `insert into public.background_jobs (id, name, payload, max_attempts, run_after)
         values ($1, $2, $3::jsonb, $4, now() + ($5 || ' milliseconds')::interval)`,
        [id, name, JSON.stringify(payload ?? {}), maxAttempts, String(Math.max(0, delayMs))],
      );
      if (this.running) this.schedule(this.drainPollMs);
    } catch (error) {
      // DB down → the job is lost, but logged. This is strictly better than the
      // old in-memory queue, which lost every queued job on each restart.
      log('error', 'job_queue.persist_failed', { name, error: serializeError(error) });
    }
  }

  start(): void {
    this.running = true;
    this.schedule(this.drainPollMs);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.timer || !this.running) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delayMs);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (this.isTicking) {
      this.schedule(this.idlePollMs);
      return;
    }
    this.isTicking = true;
    let processedJob = false;
    try {
      processedJob = await this.processOne();
    } catch (error) {
      log('error', 'job_queue.tick_failed', { error: serializeError(error) });
    } finally {
      this.isTicking = false;
      if (this.running) this.schedule(processedJob ? this.drainPollMs : this.idlePollMs);
    }
  }

  /** Claim and run a single ready job. Returns true if one was processed. */
  private async processOne(): Promise<boolean> {
    await this.ensureSchema();
    const claimed = await pool.query(
      `
        update public.background_jobs
           set status = 'processing', updated_at = now()
         where id = (
           select id from public.background_jobs
            where (status = 'pending' and run_after <= now())
               or (status = 'processing' and updated_at < now() - ($1 || ' seconds')::interval)
            order by run_after asc
            limit 1
            for update skip locked
         )
        returning id, name, payload, attempts, max_attempts
      `,
      [String(this.staleProcessingSeconds)],
    );
    const job = claimed.rows[0] as
      | { id: string; name: string; payload: unknown; attempts: number; max_attempts: number }
      | undefined;
    if (!job) return false;

    const handler = this.handlers.get(job.name);
    if (!handler) {
      log('warn', 'job_queue.missing_handler', { jobId: job.id, name: job.name });
      await pool.query(
        `update public.background_jobs set status = 'failed', last_error = 'missing handler', updated_at = now() where id = $1`,
        [job.id],
      );
      return true;
    }

    try {
      await handler(job.payload);
      await pool.query(`delete from public.background_jobs where id = $1`, [job.id]);
      log('info', 'job_queue.completed', { jobId: job.id, name: job.name, attempts: job.attempts + 1 });
    } catch (error) {
      const attempts = job.attempts + 1;
      const lastError = JSON.stringify(serializeError(error)).slice(0, 2000);
      if (attempts < job.max_attempts) {
        const backoffMs = Math.min(30_000, 1000 * 2 ** attempts);
        await pool.query(
          `update public.background_jobs
              set status = 'pending', attempts = $2, last_error = $3,
                  run_after = now() + ($4 || ' milliseconds')::interval, updated_at = now()
            where id = $1`,
          [job.id, attempts, lastError, String(backoffMs)],
        );
        log('warn', 'job_queue.retry_scheduled', { jobId: job.id, name: job.name, attempts });
      } else {
        await pool.query(
          `update public.background_jobs set status = 'failed', attempts = $2, last_error = $3, updated_at = now() where id = $1`,
          [job.id, attempts, lastError],
        );
        log('error', 'job_queue.dead_letter', { jobId: job.id, name: job.name, attempts });
      }
    }
    return true;
  }

  /** Process queued jobs until empty or the timeout elapses (used on shutdown). */
  async drain(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let processed = false;
      try {
        processed = await this.processOne();
      } catch (error) {
        log('error', 'job_queue.drain_failed', { error: serializeError(error) });
        return;
      }
      if (!processed) return;
    }
  }

  async stats(): Promise<{ pending: number; processing: number; failed: number; handlers: number }> {
    const base = { pending: 0, processing: 0, failed: 0, handlers: this.handlers.size };
    try {
      await this.ensureSchema();
      const result = await pool.query<{ status: string; count: string }>(
        `select status, count(*)::int as count from public.background_jobs group by status`,
      );
      for (const row of result.rows) {
        if (row.status === 'pending') base.pending = Number(row.count);
        else if (row.status === 'processing') base.processing = Number(row.count);
        else if (row.status === 'failed') base.failed = Number(row.count);
      }
    } catch {
      // best-effort
    }
    return base;
  }
}

export const jobQueue = new JobQueue();

export function enqueueEmail(payload: { to: string; subject: string; body: string; html?: string }): string {
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
