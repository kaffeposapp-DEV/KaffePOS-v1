import { describe, expect, it } from 'vitest';
import { getPermissionsForRole, hasPermission, normalizeUserRole, serializeAccess } from './accessControl';

describe('backend RBAC access control', () => {
  it('normalizes legacy role labels into the two visible roles', () => {
    expect(normalizeUserRole('owner')).toBe('owner_admin');
    expect(normalizeUserRole('admin')).toBe('owner_admin');
    expect(normalizeUserRole('kasir')).toBe('cashier');
  });

  it('denies unknown roles by falling back to cashier permissions', () => {
    expect(normalizeUserRole('waiter')).toBe('cashier');
    expect(getPermissionsForRole('waiter')).toEqual(getPermissionsForRole('cashier'));
    expect(hasPermission('waiter', 'can_manage_billing')).toBe(false);
  });

  it('allows owner/admin to manage sensitive business surfaces', () => {
    expect(hasPermission('owner_admin', 'can_manage_billing')).toBe(true);
    expect(hasPermission('owner_admin', 'can_manage_settings')).toBe(true);
    expect(hasPermission('owner_admin', 'can_manage_users')).toBe(true);
    expect(hasPermission('owner_admin', 'can_void_transaction')).toBe(true);
  });

  it('allows cashier operational access but blocks owner-only actions', () => {
    expect(hasPermission('cashier', 'can_use_pos')).toBe(true);
    expect(hasPermission('cashier', 'can_view_kitchen')).toBe(true);
    expect(hasPermission('cashier', 'can_print_receipt')).toBe(true);
    expect(hasPermission('cashier', 'can_manage_billing')).toBe(false);
    expect(hasPermission('cashier', 'can_manage_settings')).toBe(false);
    expect(hasPermission('cashier', 'can_void_transaction')).toBe(false);
  });

  it('serializes the role and permissions for frontend sync', () => {
    expect(serializeAccess('cashier')).toEqual({
      role: 'cashier',
      permissions: getPermissionsForRole('cashier'),
    });
  });
});

