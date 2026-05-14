/**
 * Standard API response helpers for consistent response format.
 * 
 * This module provides utilities to standardize API responses across all endpoints
 * while maintaining backward compatibility with existing frontend code.
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

export type ApiErrorResponse = {
  success: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ValidationErrorDetail[];
  };
};

export type ApiSuccessResponse<T = unknown> = {
  success: true;
  data: T;
  message?: string;
};

export type ApiPaginatedResponse<T = unknown> = {
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

export type ApiActionResponse = {
  success: true;
  message: string;
};

/**
 * Map HTTP status codes to error codes
 */
export function getErrorCodeFromStatus(status: number): ApiErrorCode {
  switch (status) {
    case 400:
      return 'BAD_REQUEST';
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 409:
      return 'CONFLICT';
    case 429:
      return 'RATE_LIMITED';
    case 500:
    default:
      return 'INTERNAL_SERVER_ERROR';
  }
}

/**
 * Create a standardized success response with data
 */
export function createSuccessResponse<T>(data: T, message?: string): ApiSuccessResponse<T> {
  const response: ApiSuccessResponse<T> = {
    success: true,
    data,
  };
  
  if (message) {
    response.message = message;
  }
  
  return response;
}

/**
 * Create a standardized paginated response
 */
export function createPaginatedResponse<T>(
  data: T[],
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore?: boolean;
    nextOffset?: number | null;
  },
): ApiPaginatedResponse<T> {
  return {
    success: true,
    data,
    meta,
  };
}

/**
 * Create a standardized action response (no data, just success message)
 */
export function createActionResponse(message: string): ApiActionResponse {
  return {
    success: true,
    message,
  };
}

/**
 * Create a standardized error response
 */
export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  details?: ValidationErrorDetail[],
): ApiErrorResponse {
  const response: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
  };
  
  if (details && details.length > 0) {
    response.error.details = details;
  }
  
  return response;
}

/**
 * Convert Zod validation errors to structured validation error details
 */
export function formatZodErrors(issues: Array<{ path: (string | number)[]; message: string; code?: string }>): ValidationErrorDetail[] {
  return issues.map((issue) => ({
    field: issue.path.join('.') || 'unknown',
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Helper to calculate pagination metadata from offset-based pagination
 */
export function calculatePaginationMeta(input: {
  limit: number;
  offset: number;
  total: number;
  returned: number;
}): {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextOffset: number | null;
} {
  const limit = Math.max(1, input.limit);
  const offset = Math.max(0, input.offset);
  const total = Math.max(0, input.total);
  const returned = Math.max(0, input.returned);
  
  const page = Math.floor(offset / limit) + 1;
  const totalPages = Math.ceil(total / limit);
  const hasMore = offset + returned < total;
  const nextOffset = hasMore ? offset + returned : null;
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasMore,
    nextOffset,
  };
}
