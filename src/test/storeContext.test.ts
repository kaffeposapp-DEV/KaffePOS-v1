import { describe, expect, it } from 'vitest';
import { selectStoreForBootstrap } from '@/lib/storeContext';

const outletUtama = { id: '11111111-1111-4111-8111-111111111111', store_name: 'Outlet Utama' };
const outletBaru = { id: '22222222-2222-4222-8222-222222222222', store_name: 'Outlet Baru' };

describe('store bootstrap context selection', () => {
  it('uses a cached store only after backend confirms it is still accessible', () => {
    const decision = selectStoreForBootstrap({
      stores: [outletUtama, outletBaru],
      cachedStoreId: outletBaru.id,
      assignedStoreId: null,
      canCreateStore: true,
    });

    expect(decision).toMatchObject({
      store: outletBaru,
      shouldClearCachedStore: false,
      reason: 'cached_store',
    });
  });

  it('prefers the cashier assigned outlet over stale local cache', () => {
    const decision = selectStoreForBootstrap({
      stores: [outletBaru],
      cachedStoreId: outletUtama.id,
      assignedStoreId: outletBaru.id,
      canCreateStore: false,
    });

    expect(decision).toMatchObject({
      store: outletBaru,
      shouldClearCachedStore: true,
      needsOwnerStoreCreation: false,
      reason: 'assigned_store',
    });
  });

  it('trusts the backend-accessible outlet when the cashier session assignment is stale', () => {
    const decision = selectStoreForBootstrap({
      stores: [outletBaru],
      cachedStoreId: outletUtama.id,
      assignedStoreId: outletUtama.id,
      canCreateStore: false,
    });

    expect(decision).toMatchObject({
      store: outletBaru,
      shouldClearCachedStore: true,
      needsOwnerStoreCreation: false,
      reason: 'backend_assignment_changed',
    });
  });

  it('does not create stores for a cashier without an active outlet assignment', () => {
    const decision = selectStoreForBootstrap({
      stores: [],
      cachedStoreId: outletUtama.id,
      assignedStoreId: outletUtama.id,
      canCreateStore: false,
    });

    expect(decision).toMatchObject({
      store: null,
      shouldClearCachedStore: true,
      needsOwnerStoreCreation: false,
      reason: 'assigned_store_missing',
    });
  });

  it('lets owner/admin create the first store when no outlet exists yet', () => {
    const decision = selectStoreForBootstrap({
      stores: [],
      cachedStoreId: null,
      assignedStoreId: null,
      canCreateStore: true,
    });

    expect(decision).toMatchObject({
      store: null,
      shouldClearCachedStore: false,
      needsOwnerStoreCreation: true,
      reason: 'owner_store_creation_required',
    });
  });
});
