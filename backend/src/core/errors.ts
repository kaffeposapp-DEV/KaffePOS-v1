/**
 * Error handling, logging, and ApiError class.
 */
import { env } from './env';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const logPriority: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function shouldLog(level: LogLevel) {
  return logPriority[level] >= logPriority[env.LOG_LEVEL];
}

export function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return { value: String(error) };
}

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  if (!shouldLog(level)) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    service: env.SERVICE_NAME,
    version: env.APP_VERSION,
    msg: message,
    ...meta,
  };

  const line = JSON.stringify(payload);
  if (level === 'error' || level === 'warn') {
    console.error(line);
    return;
  }

  console.log(line);
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function getSafeApiErrorMessage(error: ApiError) {
  if (error.status >= 500) {
    return 'Terjadi gangguan pada server. Coba lagi beberapa saat.';
  }
  if (error.message === 'Missing bearer token.') {
    return 'Sesi login tidak ditemukan.';
  }
  return error.message;
}
