/**
 * Enhanced API client with support for standardized API responses.
 * 
 * This module extends the existing backendApi.ts with support for
 * the new standardized response format while maintaining backward
 * compatibility with existing code.
 */

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'PAYMENT_ERROR'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'FEATURE_DISABLED'
  | 'INTERNAL_SERVER_ERROR'
  | 'BAD_REQUEST';

export type ValidationErrorDetail = {
  field: string;
  message: string;
  code?: string;
};

export type StandardApiErrorResponse = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationErrorDetail[] | undefined;
  };
};

export type StandardApiSuccessResponse<T> = {
  success: true;
  data: T;
  message?: string;
};

export type StandardApiPaginatedResponse<T> = {
  success: true;
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore?: boolean;
    nextOffset?: number | null;
  };
};

export type StandardApiActionResponse = {
  success: true;
  message: string;
};

/**
 * Enhanced ApiError with error code support
 */
export class ApiClientError extends Error {
  status: number;
  code?: ApiErrorCode;
  details?: ValidationErrorDetail[];

  constructor(message: string, status: number, code?: ApiErrorCode, details?: ValidationErrorDetail[]) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    if (code !== undefined) this.code = code;
    if (details !== undefined) this.details = details;
  }
}

/**
 * Check if response is a standardized error response
 */
export function isStandardErrorResponse(data: unknown): data is StandardApiErrorResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    data.success === false &&
    'error' in data &&
    typeof (data as StandardApiErrorResponse).error === 'object'
  );
}

/**
 * Check if response is a standardized success response
 */
export function isStandardSuccessResponse(data: unknown): data is StandardApiSuccessResponse<unknown> {
  return (
    typeof data === 'object' &&
    data !== null &&
    'success' in data &&
    data.success === true &&
    'data' in data
  );
}

/**
 * Check if response is a standardized paginated response
 */
export function isStandardPaginatedResponse(data: unknown): data is StandardApiPaginatedResponse<unknown> {
  return (
    isStandardSuccessResponse(data) &&
    Array.isArray((data as StandardApiPaginatedResponse<unknown>).data) &&
    'meta' in data &&
    typeof (data as StandardApiPaginatedResponse<unknown>).meta === 'object'
  );
}

/**
 * Parse error response and throw ApiClientError
 */
export function parseErrorResponse(data: unknown, status: number): never {
  if (isStandardErrorResponse(data)) {
    throw new ApiClientError(
      data.error.message,
      status,
      data.error.code,
      data.error.details,
    );
  }

  // Legacy error format: { error: 'CODE', message: '...' }
  if (
    typeof data === 'object' &&
    data !== null &&
    'message' in data &&
    typeof (data as { message: string }).message === 'string'
  ) {
    const legacyError = data as { message: string; error?: string };
    throw new ApiClientError(
      legacyError.message,
      status,
      legacyError.error as ApiErrorCode | undefined,
    );
  }

  // Fallback
  throw new ApiClientError(`Request gagal (${status})`, status);
}

/**
 * Unwrap standardized response data
 * 
 * If response is in new standard format, extract the data field.
 * Otherwise, return the response as-is for backward compatibility.
 */
export function unwrapResponseData<T>(data: unknown): T {
  if (isStandardSuccessResponse(data)) {
    return data.data as T;
  }
  
  return data as T;
}

/**
 * Get validation errors from error response
 */
export function getValidationErrors(error: ApiClientError): ValidationErrorDetail[] {
  return error.details ?? [];
}

/**
 * Check if error is a specific error code
 */
export function isErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return error instanceof ApiClientError && error.code === code;
}

/**
 * Helper functions for common error checks
 */
export const errorChecks = {
  isUnauthorized: (error: unknown) => isErrorCode(error, 'UNAUTHORIZED'),
  isForbidden: (error: unknown) => isErrorCode(error, 'FORBIDDEN'),
  isNotFound: (error: unknown) => isErrorCode(error, 'NOT_FOUND'),
  isValidationError: (error: unknown) => isErrorCode(error, 'VALIDATION_ERROR'),
  isRateLimited: (error: unknown) => isErrorCode(error, 'RATE_LIMITED'),
  isPaymentError: (error: unknown) => isErrorCode(error, 'PAYMENT_ERROR'),
  isFeatureDisabled: (error: unknown) => isErrorCode(error, 'FEATURE_DISABLED'),
};
