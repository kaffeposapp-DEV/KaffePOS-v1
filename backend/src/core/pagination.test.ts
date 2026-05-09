import { describe, expect, it } from 'vitest';
import { buildPaginationMeta, parsePaginationQuery } from './pagination';

describe('backend pagination helpers', () => {
  it('normalizes unsafe limit and offset values', () => {
    expect(parsePaginationQuery({ limit: '9999', offset: '-2' }, { defaultLimit: 50, maxLimit: 200 })).toEqual({
      limit: 200,
      offset: 0,
    });
    expect(parsePaginationQuery({ limit: 'abc', offset: 'abc' }, { defaultLimit: 50, maxLimit: 200 })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it('builds response metadata without changing item shape', () => {
    expect(buildPaginationMeta({ limit: 25, offset: 50, returned: 25 })).toEqual({
      limit: 25,
      offset: 50,
      returned: 25,
      hasMore: true,
      nextOffset: 75,
    });
    expect(buildPaginationMeta({ limit: 25, offset: 50, returned: 10 })).toEqual({
      limit: 25,
      offset: 50,
      returned: 10,
      hasMore: false,
      nextOffset: null,
    });
  });
});
