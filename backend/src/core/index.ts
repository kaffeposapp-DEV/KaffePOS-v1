/**
 * Core barrel export — all route modules import from '@core' via this file.
 * Re-exports everything from env, db, errors, middleware, helpers, email, session.
 */
export { env, adminEmails, type Env } from './env';
export { pool, withTransaction, type PoolClient } from './db';
export {
  log,
  serializeError,
  shouldLog,
  ApiError,
  getSafeApiErrorMessage,
  type LogLevel,
} from './errors';
export {
  buildBackendErrorTrackingConfig,
  getCurrentBackendErrorTrackingConfig,
  initBackendErrorTracking,
  captureBackendException,
} from './errorTracking';
export {
  authenticate,
  requireAdmin,
  requirePermission,
  getBearerToken,
  hashToken,
  createOpaqueToken,
  isAdminUser,
  getRateLimitIp,
  createRateLimiter,
  authLoginRateLimiter,
  authEmailRateLimiter,
  authVerifyRateLimiter,
  paymentCreateRateLimiter,
  type AuthenticatedUser,
  type AuthenticatedSession,
} from './middleware';
export {
  toNumber,
  normalizeStore,
  serializeCashier,
  normalizeInventory,
  normalizeStockUnitConversion,
  normalizeTransaction,
  normalizeSubscription,
  normalizePaymentHistory,
  normalizeSubscriptionPaymentSession,
  normalizeEmail,
  serializeProfile,
  getCashierAssignment,
  serializeProfileWithAssignment,
  assertStoreOwned,
  ensureProfile,
  insertNotification,
  resolveUniqueUsername,
  pickDefined,
  buildUpdateClause,
  countRowsForStore,
  addMinutes,
  addDays,
  generateOtpCode,
  profileColumns,
  storeColumns,
  menuColumns,
  inventoryColumns,
  stockUnitConversionColumns,
  expenseColumns,
  cashFlowColumns,
  cashRegisterColumns,
  transactionColumns,
  kitchenOrderColumns,
  kitchenOrderItemColumns,
  syncProfileSubscriptionState,
} from './helpers';
export {
  sendEmail,
  createEmailCode,
  getResetLink,
  buildEmailTemplate,
  sendSignupOtpEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
  sendPaymentSuccessEmail,
  sendTrialReminderEmail,
  sendFeedbackThankYouEmail,
} from './email';
export {
  revokeUserSessions,
  createSession,
} from './session';
export {
  type KitchenRealtimeEventType,
  type KitchenRealtimeEvent,
  type KitchenSseClient,
  type AuthenticatedUser as KitchenAuthUser,
  kitchenClients,
  normalizeKitchenItem,
  normalizeKitchenOrder,
  inferKitchenStation,
  writeSse,
  broadcastKitchenEvent,
  fetchKitchenOrder,
  insertKitchenEvent,
  createKitchenOrderFromTransaction,
  recalculateKitchenOrderStatus,
} from './kitchen';
export * from './billing';
export * from './misc';
export * from './pagination';
