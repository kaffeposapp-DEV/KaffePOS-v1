/**
 * Admin check helper for frontend route guards.
 * 
 * Note: This is for UX only. Backend is the source of truth.
 * Backend uses ADMIN_EMAILS environment variable for actual admin check.
 */

import type { AuthUser } from '@/lib/authSession';

/**
 * Check if user is an admin based on email.
 * 
 * This should match the backend admin email list, but frontend check
 * is only for UX (showing/hiding routes). Backend enforces actual access.
 * 
 * For production, consider moving admin emails to a config endpoint
 * or using a role-based system instead of email whitelist.
 */
export function isAdminUser(user: AuthUser | null): boolean {
  if (!user?.email) return false;
  
  // TODO: This list should match ADMIN_EMAILS in backend env
  // For now, we check if user has owner_admin role as a proxy
  // Real admin check happens on backend
  
  // In production, you might want to:
  // 1. Fetch admin status from backend endpoint
  // 2. Store admin flag in user session
  // 3. Use role-based system instead of email whitelist
  
  // For now, we assume all owner_admin users can potentially be admin
  // Backend will enforce the actual email whitelist
  return user.user_metadata?.role === 'owner_admin';
}

/**
 * Check if user can access admin routes.
 * Alias for isAdminUser for clarity in route guards.
 */
export function canAccessAdminRoutes(user: AuthUser | null): boolean {
  return isAdminUser(user);
}
