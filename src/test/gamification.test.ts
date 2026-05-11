import { describe, expect, it } from 'vitest';
import {
  buildStaffPersonalProfileStats,
  calculateDailyStreak,
  calculateTransactionPoints,
} from '@/lib/gamification';
import type { Profile, Transaction } from '@/types';

const now = new Date('2026-05-10T10:00:00.000Z');

function tx(partial: Partial<Transaction>): Transaction {
  const base: Transaction = {
    id: partial.id || crypto.randomUUID(),
    store_id: 'store_1',
    date: partial.date || now.toISOString(),
    items: partial.items || [{ name: 'Americano', qty: 1, price: 18000, subtotal: 18000 }],
    subtotal: partial.subtotal ?? 18000,
    discount: partial.discount ?? 0,
    tax: partial.tax ?? 0,
    total: partial.total ?? 18000,
    paid: partial.paid ?? 18000,
    change: partial.change ?? 0,
    method: partial.method || 'Tunai',
    cashier: partial.cashier || 'Rina',
    is_void: partial.is_void ?? false,
  };
  return { ...base, ...partial };
}

describe('staff gamification stats', () => {
  it('awards extra points for larger baskets and QRIS checkout', () => {
    expect(calculateTransactionPoints(tx({ total: 18000 }))).toBe(10);
    expect(calculateTransactionPoints(tx({
      total: 65000,
      method: 'QRIS',
      items: [{ name: 'Bundle', qty: 3, price: 20000, subtotal: 60000 }],
    }))).toBe(24);
    expect(calculateTransactionPoints(tx({ is_void: true }))).toBe(0);
  });

  it('calculates consecutive daily streak from non-void transactions', () => {
    expect(calculateDailyStreak([
      tx({ date: '2026-05-10T09:00:00.000Z' }),
      tx({ date: '2026-05-09T09:00:00.000Z' }),
      tx({ date: '2026-05-08T09:00:00.000Z' }),
      tx({ date: '2026-05-07T09:00:00.000Z', is_void: true }),
    ], now)).toBe(3);
  });

  it('builds personal stats, badges, missions, and ranking for the logged-in cashier', () => {
    const profile: Profile = {
      id: 'cashier_1',
      email: 'rina@example.com',
      display_name: 'Rina',
      role: 'cashier',
    };
    const stats = buildStaffPersonalProfileStats({
      profile,
      now,
      transactions: [
        tx({ cashier: 'Rina', total: 65000, method: 'QRIS' }),
        tx({ cashier: 'Rina', date: '2026-05-09T09:00:00.000Z', total: 52000 }),
        tx({ cashier: 'Budi', total: 150000, method: 'QRIS' }),
      ],
    });

    expect(stats.staffName).toBe('Rina');
    expect(stats.points).toBeGreaterThan(20);
    expect(stats.dailyStreak).toBe(2);
    expect(stats.challenges.some((challenge) => challenge.code === 'qris-3')).toBe(true);
    expect(stats.leaderboard.map((entry) => entry.name)).toContain('Rina');
    expect(stats.rank).toBe(1);
  });

  it('keeps new staff at zero points with safe empty defaults', () => {
    const stats = buildStaffPersonalProfileStats({
      profile: {
        id: 'cashier_new',
        email: 'baru@example.com',
        display_name: 'Kasir Baru',
        role: 'cashier',
      },
      now,
      transactions: [],
    });

    expect(stats.points).toBe(0);
    expect(stats.rank).toBe(1);
    expect(stats.totalStaff).toBe(1);
    expect(stats.level).toBe(1);
    expect(stats.levelProgress).toBe(0);
    expect(stats.isEmpty).toBe(true);
    expect(stats.badges.every((badge) => !badge.unlocked)).toBe(true);
    expect(stats.challenges.every((challenge) => !challenge.completed)).toBe(true);
  });

  it('handles level up and max level progress without overflow', () => {
    const profile: Profile = {
      id: 'cashier_1',
      email: 'rina@example.com',
      display_name: 'Rina',
      role: 'cashier',
    };
    const levelTwoStats = buildStaffPersonalProfileStats({
      profile,
      now,
      transactions: Array.from({ length: 5 }, (_, index) => tx({
        id: crypto.randomUUID(),
        cashier: 'Rina',
        date: `2026-05-10T0${index}:00:00.000Z`,
        total: 65000,
        method: 'QRIS',
        items: [{ name: 'Bundle', qty: 3, price: 20000, subtotal: 60000 }],
      })),
    });
    const maxLevelStats = buildStaffPersonalProfileStats({
      profile,
      now,
      transactions: Array.from({ length: 45 }, (_, index) => tx({
        id: crypto.randomUUID(),
        cashier: 'Rina',
        date: `2026-05-10T${String(index % 10).padStart(2, '0')}:00:00.000Z`,
        total: 65000,
        method: 'QRIS',
        items: [{ name: 'Bundle', qty: 3, price: 20000, subtotal: 60000 }],
      })),
    });

    expect(levelTwoStats.level).toBe(2);
    expect(levelTwoStats.levelLabel).toBe('Barista Fokus');
    expect(levelTwoStats.levelProgress).toBe(0);
    expect(maxLevelStats.level).toBe(5);
    expect(maxLevelStats.isMaxLevel).toBe(true);
    expect(maxLevelStats.levelProgress).toBe(100);
  });

  it('builds owner team scope without injecting a fake staff row', () => {
    const stats = buildStaffPersonalProfileStats({
      profile: {
        id: 'owner_1',
        email: 'owner@example.com',
        display_name: 'Owner',
        role: 'owner_admin',
      },
      scope: 'team',
      displayName: 'Tim Kopi Test',
      now,
      transactions: [
        tx({ cashier: 'Rina', total: 65000 }),
        tx({ cashier: 'Budi', total: 150000, method: 'QRIS' }),
      ],
    });

    expect(stats.scope).toBe('team');
    expect(stats.staffName).toBe('Tim Kopi Test');
    expect(stats.activeStaffCount).toBe(2);
    expect(stats.leaderboard.map((entry) => entry.name)).toEqual(['Budi', 'Rina']);
    expect(stats.leaderboard.map((entry) => entry.name)).not.toContain('Tim Kopi Test');
  });
});
