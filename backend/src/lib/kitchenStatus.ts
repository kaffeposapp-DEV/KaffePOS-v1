export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';

export const terminalKitchenStatuses = new Set<KitchenStatus>(['served', 'completed', 'cancelled']);

export const kitchenStatusTransitions: Record<KitchenStatus, KitchenStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['served', 'completed', 'cancelled'],
  served: [],
  completed: [],
  cancelled: [],
};

export class KitchenStatusError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'KitchenStatusError';
    this.status = status;
  }
}

export function normalizeKitchenStatus(status: string): KitchenStatus {
  if (status === 'completed') return 'completed';
  if (status === 'served') return 'served';
  if (status === 'ready' || status === 'preparing' || status === 'pending' || status === 'cancelled') return status;
  throw new KitchenStatusError('Status kitchen tidak valid.', 400);
}

export function assertKitchenTransition(oldStatus: KitchenStatus, requestedStatus: KitchenStatus) {
  if (oldStatus === requestedStatus) return;
  const allowed = kitchenStatusTransitions[oldStatus] || [];
  if (!allowed.includes(requestedStatus)) {
    throw new KitchenStatusError(`Status tidak bisa diubah dari ${oldStatus} ke ${requestedStatus}.`, 409);
  }
}

export function deriveKitchenOrderStatus(itemStatuses: KitchenStatus[]) {
  if (itemStatuses.length === 0) return 'pending' as KitchenStatus;
  if (itemStatuses.every((status) => status === 'cancelled')) return 'cancelled';
  if (itemStatuses.every((status) => status === 'served' || status === 'completed')) return 'served';
  if (itemStatuses.every((status) => status === 'ready' || status === 'served' || status === 'completed')) return 'ready';
  if (itemStatuses.some((status) => status === 'preparing' || status === 'ready' || status === 'served' || status === 'completed')) {
    return 'preparing';
  }
  return 'pending';
}

