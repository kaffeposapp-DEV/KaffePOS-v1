/**
 * Centralized error handler with standardized error responses.
 * 
 * This module provides an enhanced error handler that returns structured
 * error responses with specific error codes while maintaining backward
 * compatibility with existing error handling.
 */
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ApiError, log, serializeError, getSafeApiErrorMessage } from './errors';
import { KitchenStatusError } from '../lib/kitchenStatus';
import { captureBackendException } from './errorTracking';
import {
  createErrorResponse,
  formatZodErrors,
  getErrorCodeFromStatus,
  type ApiErrorCode,
} from '../lib/apiResponse';

/**
 * Enhanced ApiError class with error code support
 */
export class ApiErrorWithCode extends ApiError {
  code: ApiErrorCode;

  constructor(status: number, message: string, code?: ApiErrorCode) {
    super(status, message);
    this.code = code ?? getErrorCodeFromStatus(status);
  }
}

/**
 * Global error handler middleware with standardized error responses
 */
export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  // Handle Zod validation errors
  if (error instanceof z.ZodError) {
    log('warn', 'request.validation_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      issues: error.issues,
    });

    const response = createErrorResponse(
      'VALIDATION_ERROR',
      error.issues[0]?.message ?? 'Payload tidak valid.',
      formatZodErrors(error.issues as any),
    );

    res.status(400).json(response);
    return;
  }

  // Handle ApiErrorWithCode (new enhanced error class)
  if (error instanceof ApiErrorWithCode) {
    const clientMessage = getSafeApiErrorMessage(error);
    log('warn', 'request.api_error_with_code', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      errorCode: error.code,
      message: error.message,
    });

    const response = createErrorResponse(error.code, clientMessage);
    res.status(error.status).json(response);
    return;
  }

  // Handle legacy ApiError (backward compatibility)
  if (error instanceof ApiError) {
    const clientMessage = getSafeApiErrorMessage(error);
    const errorCode = getErrorCodeFromStatus(error.status);

    log('warn', 'request.api_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      errorCode,
      message: error.message,
    });

    const response = createErrorResponse(errorCode, clientMessage);
    res.status(error.status).json(response);
    return;
  }

  // Handle KitchenStatusError
  if (error instanceof KitchenStatusError) {
    const errorCode = getErrorCodeFromStatus(error.status);
    log('warn', 'request.kitchen_status_error', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      statusCode: error.status,
      errorCode,
      message: error.message,
    });

    const response = createErrorResponse(errorCode, error.message);
    res.status(error.status).json(response);
    return;
  }

  // Handle CORS errors
  if (error instanceof Error && error.message.includes('is not allowed')) {
    log('warn', 'request.cors_rejected', {
      requestId: req.requestId ?? null,
      method: req.method,
      path: req.originalUrl,
      message: error.message,
    });

    const response = createErrorResponse('FORBIDDEN', 'Origin tidak diizinkan.');
    res.status(403).json(response);
    return;
  }

  // Handle unhandled errors
  log('error', 'request.unhandled_error', {
    requestId: req.requestId ?? null,
    method: req.method,
    path: req.originalUrl,
    error: serializeError(error),
  });

  captureBackendException(error, {
    source: 'global_error_handler',
    method: req.method,
    path: req.originalUrl,
    statusCode: 500,
    metadata: {
      requestId: req.requestId ?? null,
      userId: req.authUser?.id ?? null,
    },
  });

  const response = createErrorResponse(
    'INTERNAL_SERVER_ERROR',
    'Terjadi gangguan pada server. Coba lagi beberapa saat.',
  );

  res.status(500).json(response);
}

/**
 * Helper to throw common API errors with proper error codes
 */
export const throwApiError = {
  unauthorized: (message = 'Sesi tidak valid atau sudah kedaluwarsa.') => {
    throw new ApiErrorWithCode(401, message, 'UNAUTHORIZED');
  },
  forbidden: (message = 'Akses tidak diizinkan.') => {
    throw new ApiErrorWithCode(403, message, 'FORBIDDEN');
  },
  notFound: (message = 'Data tidak ditemukan.') => {
    throw new ApiErrorWithCode(404, message, 'NOT_FOUND');
  },
  conflict: (message = 'Data sudah ada atau konflik.') => {
    throw new ApiErrorWithCode(409, message, 'CONFLICT');
  },
  rateLimited: (message = 'Terlalu banyak permintaan. Tunggu sebentar lalu coba lagi.') => {
    throw new ApiErrorWithCode(429, message, 'RATE_LIMITED');
  },
  paymentError: (message = 'Terjadi kesalahan pada pembayaran.') => {
    throw new ApiErrorWithCode(400, message, 'PAYMENT_ERROR');
  },
  webhookSignatureInvalid: (message = 'Signature webhook tidak valid.') => {
    throw new ApiErrorWithCode(401, message, 'WEBHOOK_SIGNATURE_INVALID');
  },
  featureDisabled: (message = 'Fitur ini sedang tidak tersedia.') => {
    throw new ApiErrorWithCode(403, message, 'FEATURE_DISABLED');
  },
  badRequest: (message = 'Permintaan tidak valid.') => {
    throw new ApiErrorWithCode(400, message, 'BAD_REQUEST');
  },
};
