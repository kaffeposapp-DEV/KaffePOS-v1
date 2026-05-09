export type PaginationOptions = {
  defaultLimit?: number;
  maxLimit?: number;
};

export type PaginationQuery = Record<string, unknown>;

export type PaginationMeta = {
  limit: number;
  offset: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
};

function readPositiveInteger(value: unknown, fallback: number) {
  const source = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(String(source ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

export function parsePaginationQuery(query: PaginationQuery, options: PaginationOptions = {}) {
  const defaultLimit = Math.max(1, options.defaultLimit ?? 100);
  const maxLimit = Math.max(defaultLimit, options.maxLimit ?? 500);
  const rawLimit = readPositiveInteger(query.limit, defaultLimit);
  const limit = Math.min(Math.max(rawLimit, 1), maxLimit);
  const offset = readPositiveInteger(query.offset, 0);

  return { limit, offset };
}

export function buildPaginationMeta(input: { limit: number; offset: number; returned: number }): PaginationMeta {
  const limit = Math.max(1, input.limit);
  const offset = Math.max(0, input.offset);
  const returned = Math.max(0, input.returned);
  const hasMore = returned >= limit;

  return {
    limit,
    offset,
    returned,
    hasMore,
    nextOffset: hasMore ? offset + returned : null,
  };
}
