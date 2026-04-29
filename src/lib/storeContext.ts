type StoreContextRecord = {
  id: string;
};

export type StoreBootstrapDecision<TStore extends StoreContextRecord> = {
  store: TStore | null;
  shouldClearCachedStore: boolean;
  needsOwnerStoreCreation: boolean;
  reason:
    | 'assigned_store'
    | 'backend_assignment_changed'
    | 'assigned_store_missing'
    | 'cached_store'
    | 'fallback_store'
    | 'owner_store_creation_required'
    | 'no_store';
};

export function selectStoreForBootstrap<TStore extends StoreContextRecord>({
  stores,
  cachedStoreId,
  assignedStoreId,
  canCreateStore,
}: {
  stores: readonly TStore[];
  cachedStoreId?: string | null;
  assignedStoreId?: string | null;
  canCreateStore: boolean;
}): StoreBootstrapDecision<TStore> {
  const firstStore = stores[0] ?? null;
  const cachedId = cachedStoreId || null;
  const assignedId = assignedStoreId || null;

  if (assignedId) {
    const assignedStore = stores.find((store) => store.id === assignedId) ?? null;
    if (assignedStore) {
      return {
        store: assignedStore,
        shouldClearCachedStore: Boolean(cachedId && cachedId !== assignedStore.id),
        needsOwnerStoreCreation: false,
        reason: 'assigned_store',
      };
    }

    if (firstStore) {
      return {
        store: firstStore,
        shouldClearCachedStore: Boolean(cachedId),
        needsOwnerStoreCreation: false,
        reason: 'backend_assignment_changed',
      };
    }

    return {
      store: null,
      shouldClearCachedStore: Boolean(cachedId),
      needsOwnerStoreCreation: false,
      reason: 'assigned_store_missing',
    };
  }

  if (cachedId) {
    const cachedStore = stores.find((store) => store.id === cachedId) ?? null;
    if (cachedStore) {
      return {
        store: cachedStore,
        shouldClearCachedStore: false,
        needsOwnerStoreCreation: false,
        reason: 'cached_store',
      };
    }

    return {
      store: firstStore,
      shouldClearCachedStore: true,
      needsOwnerStoreCreation: !firstStore && canCreateStore,
      reason: firstStore ? 'fallback_store' : (canCreateStore ? 'owner_store_creation_required' : 'no_store'),
    };
  }

  if (firstStore) {
    return {
      store: firstStore,
      shouldClearCachedStore: false,
      needsOwnerStoreCreation: false,
      reason: 'fallback_store',
    };
  }

  return {
    store: null,
    shouldClearCachedStore: false,
    needsOwnerStoreCreation: canCreateStore,
    reason: canCreateStore ? 'owner_store_creation_required' : 'no_store',
  };
}
