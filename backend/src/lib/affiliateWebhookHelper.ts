import { Pool, PoolClient } from 'pg';
import { AffiliateService } from '../services/AffiliateService';
import { log, serializeError } from '../core';

/**
 * Handle affiliate commission creation when a subscription payment is successful.
 * This should be called after subscription activation in the payment webhook.
 * 
 * @param client - Database client (within transaction)
 * @param pool - Database pool (for AffiliateService)
 * @param userId - User who made the payment
 * @param paymentAmount - Payment amount in IDR
 * @param orderId - Midtrans order ID
 */
export async function handleAffiliateCommissionOnPayment(
  client: PoolClient,
  pool: Pool,
  userId: string,
  paymentAmount: number,
  orderId: string
): Promise<void> {
  try {
    const affiliateService = new AffiliateService(pool);

    // Check if this user was referred
    const referralRegistration = await affiliateService.getReferralRegistrationByReferredUser(userId);

    if (!referralRegistration) {
      // User was not referred, nothing to do
      return;
    }

    // Mark first payment if not already marked
    if (!referralRegistration.first_payment_at) {
      await affiliateService.markReferralFirstPayment(userId, orderId);
      log('info', 'affiliate.referral_first_payment', {
        referredUserId: userId,
        referrerUserId: referralRegistration.referrer_user_id,
        orderId,
      });
    }

    // Check if referrer is an active affiliate
    const affiliateProfile = await affiliateService.getAffiliateProfile(referralRegistration.referrer_user_id);

    if (!affiliateProfile || affiliateProfile.status !== 'active') {
      log('info', 'affiliate.referrer_not_active', {
        referredUserId: userId,
        referrerUserId: referralRegistration.referrer_user_id,
        affiliateStatus: affiliateProfile?.status || 'none',
      });
      return;
    }

    // Create commission (idempotent - won't create duplicate)
    const commission = await affiliateService.createCommission(
      referralRegistration.referrer_user_id,
      userId,
      referralRegistration.id,
      orderId,
      paymentAmount,
      affiliateProfile.commission_rate
    );

    if (commission) {
      log('info', 'affiliate.commission_created', {
        commissionId: commission.id,
        affiliateUserId: referralRegistration.referrer_user_id,
        referredUserId: userId,
        paymentAmount,
        commissionAmount: commission.commission_amount_idr,
        orderId,
      });

      // Update affiliate stats
      await affiliateService.updateAffiliateStats(referralRegistration.referrer_user_id);
    } else {
      log('info', 'affiliate.commission_already_exists', {
        referralRegistrationId: referralRegistration.id,
        orderId,
      });
    }
  } catch (error) {
    // Log error but don't throw - we don't want to fail the payment webhook
    log('error', 'affiliate.commission_creation_failed', {
      error: serializeError(error),
      userId,
      orderId,
    });
  }
}

/**
 * Handle referral registration tracking during user registration.
 * This should be called after user registration is complete.
 * 
 * @param pool - Database pool
 * @param userId - Newly registered user ID
 * @param referralCode - Referral code from cookie or query param
 */
export async function handleReferralRegistration(
  pool: Pool,
  userId: string,
  referralCode?: string
): Promise<void> {
  if (!referralCode) {
    return;
  }

  try {
    const affiliateService = new AffiliateService(pool);

    // Get referral code details
    const referralCodeRecord = await affiliateService.getReferralCodeByCode(referralCode);

    if (!referralCodeRecord) {
      log('warn', 'affiliate.referral_code_not_found', { referralCode, userId });
      return;
    }

    // Create referral registration (idempotent - prevents self-referral and duplicates)
    const registration = await affiliateService.createReferralRegistration(
      referralCodeRecord.id,
      userId,
      referralCodeRecord.user_id
    );

    if (registration) {
      log('info', 'affiliate.referral_registration_created', {
        registrationId: registration.id,
        referredUserId: userId,
        referrerUserId: referralCodeRecord.user_id,
        referralCode,
      });

      // Update affiliate stats if referrer is an affiliate
      const affiliateProfile = await affiliateService.getAffiliateProfile(referralCodeRecord.user_id);
      if (affiliateProfile) {
        await affiliateService.updateAffiliateStats(referralCodeRecord.user_id);
      }
    }
  } catch (error) {
    // Log error but don't throw - we don't want to fail user registration
    log('error', 'affiliate.referral_registration_failed', {
      error: serializeError(error),
      userId,
      referralCode,
    });
  }
}
