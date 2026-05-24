import { useEffect, useMemo, useState } from 'react';

interface PaginationOptions {
  pageSize?: number;
  resetKeys?: unknown[];
}

export function usePagination<T>(items: T[], options: PaginationOptions = {}) {
  const { pageSize = 30, resetKeys = [] } = options;
  const [page, setPage] = useState(1);
  const resetKey = resetKeys.map((key) => String(key)).join('\u0001');

  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const visibleItems = useMemo(() => items.slice(0, page * pageSize), [items, page, pageSize]);
  const hasMore = visibleItems.length < items.length;
  const remaining = Math.max(0, items.length - visibleItems.length);

  return {
    page,
    pageCount,
    visibleItems,
    hasMore,
    remaining,
    loadMore: () => setPage((current) => Math.min(current + 1, pageCount)),
    reset: () => setPage(1),
  };
}
