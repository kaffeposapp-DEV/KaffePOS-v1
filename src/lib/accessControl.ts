import type { Tab } from '@/types';

export type UserRole = 'owner_admin' | 'cashier';

export type Permission =
  | 'can_view_dashboard'
  | 'can_use_pos'
  | 'can_view_reports'
  | 'can_manage_settings'
  | 'can_manage_billing'
  | 'can_manage_products'
  | 'can_manage_inventory'
  | 'can_manage_users'
  | 'can_manage_theme'
  | 'can_manage_printer'
  | 'can_view_kitchen'
  | 'can_manage_kitchen_status'
  | 'can_view_transaction_history'
  | 'can_print_receipt'
  | 'can_apply_discount'
  | 'can_void_transaction';

export const ROLE_LABELS: Record<UserRole, string> = {
  owner_admin: 'Owner/Admin',
  cashier: 'Kasir',
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner_admin: [
    'can_view_dashboard',
    'can_use_pos',
    'can_view_reports',
    'can_manage_settings',
    'can_manage_billing',
    'can_manage_products',
    'can_manage_inventory',
    'can_manage_users',
    'can_manage_theme',
    'can_manage_printer',
    'can_view_kitchen',
    'can_manage_kitchen_status',
    'can_view_transaction_history',
    'can_print_receipt',
    'can_apply_discount',
    'can_void_transaction',
  ],
  cashier: [
    'can_use_pos',
    'can_view_kitchen',
    'can_manage_kitchen_status',
    'can_view_transaction_history',
    'can_print_receipt',
    'can_apply_discount',
  ],
};

const ROLE_TAB_ACCESS: Record<UserRole, Tab[]> = {
  owner_admin: ['dashboard', 'performance', 'challenges', 'pos', 'loyalty', 'kitchen', 'warehouse', 'menu', 'history', 'report', 'settings'],
  cashier: ['pos', 'loyalty', 'performance', 'challenges', 'kitchen', 'history'],
};

export function normalizeUserRole(value: unknown): UserRole {
  if (value === 'owner_admin' || value === 'owner' || value === 'admin') return 'owner_admin';
  if (value === 'cashier' || value === 'kasir') return 'cashier';
  return 'cashier';
}

export function getPermissionsForRole(role: unknown): Permission[] {
  return ROLE_PERMISSIONS[normalizeUserRole(role)];
}

export function hasPermission(role: unknown, permission: Permission): boolean {
  return getPermissionsForRole(role).includes(permission);
}

export function getVisibleTabs(role: unknown): Tab[] {
  return ROLE_TAB_ACCESS[normalizeUserRole(role)];
}

export function canAccessTab(role: unknown, tab: Tab): boolean {
  return getVisibleTabs(role).includes(tab);
}

export function getDefaultTabForRole(role: unknown): Tab {
  return normalizeUserRole(role) === 'cashier' ? 'pos' : 'dashboard';
}
