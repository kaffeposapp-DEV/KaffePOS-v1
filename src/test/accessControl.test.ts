import { describe, expect, it } from 'vitest';
import {
  canAccessTab,
  getDefaultTabForRole,
  getPermissionsForRole,
  getVisibleTabs,
  hasPermission,
  normalizeUserRole,
} from '@/lib/accessControl';

describe('frontend RBAC access control', () => {
  it('keeps the visible role model simple', () => {
    expect(normalizeUserRole('owner')).toBe('owner_admin');
    expect(normalizeUserRole('kasir')).toBe('cashier');
    expect(normalizeUserRole('unknown')).toBe('cashier');
  });

  it('gives owner/admin access to business and billing surfaces', () => {
    expect(hasPermission('owner_admin', 'can_manage_billing')).toBe(true);
    expect(hasPermission('owner_admin', 'can_manage_settings')).toBe(true);
    expect(hasPermission('owner_admin', 'can_view_reports')).toBe(true);
    expect(canAccessTab('owner_admin', 'settings')).toBe(true);
    expect(canAccessTab('owner_admin', 'report')).toBe(true);
  });

  it('keeps cashier focused on POS, kitchen, and limited history', () => {
    expect(getVisibleTabs('cashier')).toEqual(['pos', 'kitchen', 'history']);
    expect(getDefaultTabForRole('cashier')).toBe('pos');
    expect(hasPermission('cashier', 'can_use_pos')).toBe(true);
    expect(hasPermission('cashier', 'can_view_kitchen')).toBe(true);
    expect(hasPermission('cashier', 'can_manage_billing')).toBe(false);
    expect(hasPermission('cashier', 'can_manage_settings')).toBe(false);
    expect(hasPermission('cashier', 'can_void_transaction')).toBe(false);
    expect(canAccessTab('cashier', 'settings')).toBe(false);
    expect(canAccessTab('cashier', 'report')).toBe(false);
  });

  it('denies unknown roles by default to cashier-level access', () => {
    expect(getPermissionsForRole(null)).toEqual(getPermissionsForRole('cashier'));
    expect(canAccessTab(undefined, 'settings')).toBe(false);
  });
});

