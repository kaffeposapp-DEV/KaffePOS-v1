/**
 * Enhanced pagination helpers with page-based and offset-based support.
 * 
 * This module extends the existing pagination system to support both
 * page-based and offset-based pagination with total count support.
 */
import type { PoolClient } from 'pg';

export type PaginationInput = {
  page?: number;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
};

export type PaginationMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
  nextOffset: number | null;
  offset: number;
  returned: number;
};

export type PaginatedResult<T> = {
  items: T[];
  meta: PaginationMeta;
};

/**
 * Parse pagination parameters from query
 */
export function parsePaginationInput(input: PaginationInput): {
  limit: number;
  offset: number;
  page: number;
} {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
  
  // If offset is explicitly provided, use it
  if (input.offset !== undefined) {
    const offset = Math.max(input.offset, 0);
    const page = Math.floor(offset / limit) + 1;
    return { limit, offset, page };
  }
  
  // Otherwise, calculate offset from page
  const page = Math.max(input.page ?? 1, 1);
  const offset = (page - 1) * limit;
  
  return { limit, offset, page };
}

/**
 * Build pagination metadata with total count
 */
export function buildPaginationMeta(input: {
  limit: number;
  offset: number;
  total: number;
  returned: number;
}): PaginationMeta {
  const limit = Math.max(input.limit, 1);
  const offset = Math.max(input.offset, 0);
  const total = Math.max(input.total, 0);
  const returned = Math.max(input.returned, 0);
  
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
    offset,
    returned,
  };
}

/**
 * Execute paginated query with total count
 * 
 * This helper executes both the data query and count query in parallel
 * and returns a properly formatted paginated result.
 */
export async function executePaginatedQuery<T>(
  client: PoolClient,
  options: {
    dataQuery: string;
    countQuery: string;
    params: unknown[];
    limit: number;
    offset: number;
  },
): Promise<PaginatedResult<T>> {
  const [dataResult, countResult] = await Promise.all([
    client.query(options.dataQuery, options.params),
    client.query(options.countQuery, options.params.slice(0, -2)), // Remove LIMIT and OFFSET params
  ]);
  
  const items = dataResult.rows as T[];
  const total = Number(countResult.rows[0]?.count ?? 0);
  
  const meta = buildPaginationMeta({
    limit: options.limit,
    offset: options.offset,
    total,
    returned: items.length,
  });
  
  return { items, meta };
}

/**
 * Build SQL ORDER BY clause safely
 */
export function buildOrderByClause(
  sortBy: string | undefined,
  sortOrder: 'asc' | 'desc' | undefined,
  allowedFields: string[],
  defaultField: string,
): string {
  const field = sortBy && allowedFields.includes(sortBy) ? sortBy : defaultField;
  const order = sortOrder === 'asc' ? 'ASC' : 'DESC';
  
  return `ORDER BY ${field} ${order}`;
}

/**
 * Build SQL WHERE clause for search
 */
export function buildSearchClause(
  search: string | undefined,
  searchFields: string[],
  paramIndex: number,
): { clause: string; param: string | null } {
  if (!search || searchFields.length === 0) {
    return { clause: '', param: null };
  }
  
  const searchPattern = `%${search.trim().slice(0, 200)}%`;
  const conditions = searchFields.map((field) => `${field} ILIKE $${paramIndex}`).join(' OR ');
  
  return {
    clause: `AND (${conditions})`,
    param: searchPattern,
  };
}
