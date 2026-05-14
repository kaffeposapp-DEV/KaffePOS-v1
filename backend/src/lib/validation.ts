/**
 * Reusable validation schemas and middleware for consistent input validation.
 */
import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Common validation schemas
 */
export const commonSchemas = {
  uuid: z.string().uuid(),
  email: z.string().trim().email(),
  positiveInt: z.number().int().positive(),
  nonNegativeInt: z.number().int().nonnegative(),
  nonNegativeNumber: z.number().nonnegative(),
  dateString: z.string().datetime(),
  trimmedString: z.string().trim().min(1),
  optionalTrimmedString: z.string().trim().optional().nullable(),
};

/**
 * Pagination query schema
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
  offset: z.coerce.number().int().nonnegative().optional(),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  search: z.string().trim().optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Parse and validate pagination query parameters
 */
export function parsePaginationParams(query: unknown): PaginationQuery {
  const parsed = paginationQuerySchema.parse(query);
  
  // If offset is provided, use it; otherwise calculate from page
  if (parsed.offset === undefined) {
    parsed.offset = (parsed.page - 1) * parsed.limit;
  }
  
  return parsed;
}

/**
 * Validation middleware factory
 * 
 * Usage:
 * router.post('/api/endpoint', validate({ body: mySchema }), handler);
 */
export function validate(schemas: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      
      if (schemas.query) {
        req.query = schemas.query.parse(req.query) as typeof req.query;
      }
      
      if (schemas.params) {
        req.params = schemas.params.parse(req.params) as typeof req.params;
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Common validation schemas for reuse across routes
 */
export const validationSchemas = {
  storeId: z.object({
    storeId: commonSchemas.uuid,
  }),
  
  id: z.object({
    id: commonSchemas.uuid,
  }),
  
  email: z.object({
    email: commonSchemas.email,
  }),
  
  paginationQuery: paginationQuerySchema,
};

/**
 * Email normalization helper
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Sanitize search query
 */
export function sanitizeSearchQuery(search: string | undefined): string | null {
  if (!search) return null;
  return search.trim().slice(0, 200) || null;
}

/**
 * Parse sort parameters safely
 */
export function parseSortParams(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowedFields: string[],
  defaultField: string,
): { sortBy: string; sortOrder: 'asc' | 'desc' } {
  const field = sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
  const order = sortOrder === 'asc' || sortOrder === 'desc' ? sortOrder : 'desc';
  
  return { sortBy: field, sortOrder: order };
}
