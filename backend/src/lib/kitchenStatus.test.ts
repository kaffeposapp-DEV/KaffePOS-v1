import { describe, expect, it } from 'vitest';
import {
  assertKitchenTransition,
  deriveKitchenOrderStatus,
  normalizeKitchenStatus,
  terminalKitchenStatuses,
} from './kitchenStatus';

describe('backend kitchen status rules', () => {
  it('allows only forward kitchen transitions and cancellation before terminal states', () => {
    expect(() => assertKitchenTransition('pending', 'preparing')).not.toThrow();
    expect(() => assertKitchenTransition('preparing', 'ready')).not.toThrow();
    expect(() => assertKitchenTransition('ready', 'served')).not.toThrow();
    expect(() => assertKitchenTransition('pending', 'cancelled')).not.toThrow();

    expect(() => assertKitchenTransition('ready', 'pending')).toThrow('Status tidak bisa diubah dari ready ke pending.');
    expect(() => assertKitchenTransition('served', 'cancelled')).toThrow('Status tidak bisa diubah dari served ke cancelled.');
  });

  it('derives overall order status from item statuses without reviving terminal orders', () => {
    expect(deriveKitchenOrderStatus([])).toBe('pending');
    expect(deriveKitchenOrderStatus(['pending', 'pending'])).toBe('pending');
    expect(deriveKitchenOrderStatus(['pending', 'preparing'])).toBe('preparing');
    expect(deriveKitchenOrderStatus(['ready', 'served'])).toBe('ready');
    expect(deriveKitchenOrderStatus(['served', 'completed'])).toBe('served');
    expect(deriveKitchenOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled');
  });

  it('normalizes valid statuses and rejects unknown status strings', () => {
    expect(normalizeKitchenStatus('completed')).toBe('completed');
    expect(terminalKitchenStatuses.has('completed')).toBe(true);
    expect(() => normalizeKitchenStatus('done')).toThrow('Status kitchen tidak valid.');
  });
});

