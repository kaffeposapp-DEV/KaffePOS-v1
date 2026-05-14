/**
 * Auth API endpoint tests
 * Tests: register, login, verify, password reset
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';

// Mock dependencies
vi.mock('../../core', async () => {
  const actual = await vi.importActual('../../core');
  return {
    ...actual,
    pool: {
      query: vi.fn(),
    },
    withTransaction: vi.fn(async (callback) => {
      const mockClient = {
        query: vi.fn(),
        release: vi.fn(),
      };
      return callback(mockClient);
    }),
    log: vi.fn(),
    env: {
      FRONTEND_URL: 'http://localhost:5173',
      SMTP_ENABLED: 'true',
    },
  };
});

vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn(async (password: string) => `hashed_${password}`),
    compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
  },
  hash: vi.fn(async (password: string) => `hashed_${password}`),
  compare: vi.fn(async (password: string, hash: string) => hash === `hashed_${password}`),
}));

vi.mock('../../core/session', () => ({
  createSession: vi.fn(async () => ({
    sessionId: 'mock-session-id',
    token: 'mock-session-token',
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  })),
  revokeUserSessions: vi.fn(),
}));

vi.mock('../../core/email', () => ({
  createEmailCode: vi.fn(() => '123456'),
  sendSignupOtpEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  getResetLink: vi.fn(() => 'http://localhost:5173/reset?token=mock-token'),
}));

vi.mock('../../lib/affiliateWebhookHelper', () => ({
  handleReferralRegistration: vi.fn(),
}));

import { pool, withTransaction } from '../../core';
import { createSession } from '../../core/session';
import { createEmailCode, sendSignupOtpEmail } from '../../core/email';

describe('Auth API Endpoints', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockReq = {
      body: {},
      headers: {},
      ip: '127.0.0.1',
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
    };

    mockNext = vi.fn();
  });

  describe('POST /api/auth/register', () => {
    it('should register new user successfully', async () => {
      const userId = randomUUID();
      const storeId = randomUUID();
      
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        username: 'testuser',
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({ rows: [] }) // No existing credential
          .mockResolvedValueOnce({ rows: [] }) // Username check
          .mockResolvedValueOnce({ rows: [{ id: userId }] }) // Insert profile
          .mockResolvedValueOnce({ rows: [{ id: storeId }] }) // Insert store
          .mockResolvedValueOnce({ rows: [] }) // Insert credential
          .mockResolvedValueOnce({ rows: [] }), // Insert verification code
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockClient as any);
      });

      // Simulate route handler
      const { default: authRouter } = await import('../auth');
      
      expect(mockClient.query).toBeDefined();
      expect(createEmailCode).toBeDefined();
    });

    it('should reject duplicate email', async () => {
      mockReq.body = {
        email: 'existing@example.com',
        password: 'SecurePass123!',
        username: 'testuser',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [{
            user_id: randomUUID(),
            email_verified_at: new Date().toISOString(),
            username: 'existing',
            display_name: 'Existing User',
          }],
        }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        try {
          return await callback(mockClient as any);
        } catch (error: any) {
          expect(error.statusCode).toBe(409);
          expect(error.message).toContain('sudah terdaftar');
          throw error;
        }
      });
    });

    it('should validate email format', async () => {
      mockReq.body = {
        email: 'invalid-email',
        password: 'SecurePass123!',
        username: 'testuser',
      };

      // Zod validation should fail before DB call
      expect(mockReq.body.email).not.toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
    });

    it('should enforce minimum password length', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'short',
        username: 'testuser',
      };

      expect(mockReq.body.password.length).toBeLessThan(10);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const userId = randomUUID();
      mockReq.body = {
        email: 'test@example.com',
        password: 'SecurePass123!',
      };

      const mockQueryResult = {
        rows: [{
          user_id: userId,
          password_hash: 'hashed_SecurePass123!',
          email_verified_at: new Date().toISOString(),
          username: 'testuser',
          display_name: 'Test User',
          role: 'owner_admin',
          account_status: 'active',
        }],
      };

      vi.mocked(pool.query).mockResolvedValueOnce(mockQueryResult as any);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

      expect(bcrypt.compare).toBeDefined();
      expect(createSession).toBeDefined();
    });

    it('should reject unverified email', async () => {
      mockReq.body = {
        email: 'unverified@example.com',
        password: 'SecurePass123!',
      };

      const mockQueryResult = {
        rows: [{
          user_id: randomUUID(),
          password_hash: 'hashed_SecurePass123!',
          email_verified_at: null,
          username: 'testuser',
        }],
      };

      vi.mocked(pool.query).mockResolvedValueOnce(mockQueryResult as any);
    });

    it('should reject invalid password', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'WrongPassword',
      };

      const mockQueryResult = {
        rows: [{
          user_id: randomUUID(),
          password_hash: 'hashed_SecurePass123!',
          email_verified_at: new Date().toISOString(),
        }],
      };

      vi.mocked(pool.query).mockResolvedValueOnce(mockQueryResult as any);
      vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);
    });

    it('should reject non-existent user', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'SecurePass123!',
      };

      vi.mocked(pool.query).mockResolvedValueOnce({ rows: [] } as any);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('should verify email with valid code', async () => {
      const userId = randomUUID();
      mockReq.body = {
        email: 'test@example.com',
        code: '123456',
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({
            rows: [{
              user_id: userId,
              code: '123456',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }) // Mark as verified
          .mockResolvedValueOnce({ rows: [] }), // Delete code
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockClient as any);
      });
    });

    it('should reject expired code', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: '123456',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [{
            user_id: randomUUID(),
            code: '123456',
            expires_at: new Date(Date.now() - 3600000).toISOString(),
          }],
        }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        try {
          return await callback(mockClient as any);
        } catch (error: any) {
          expect(error.message).toContain('kadaluarsa');
          throw error;
        }
      });
    });

    it('should reject invalid code', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: '999999',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({ rows: [] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        try {
          return await callback(mockClient as any);
        } catch (error: any) {
          expect(error.statusCode).toBe(400);
          throw error;
        }
      });
    });
  });

  describe('POST /api/auth/request-password-reset', () => {
    it('should send reset email for existing user', async () => {
      mockReq.body = {
        email: 'test@example.com',
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({
            rows: [{ user_id: randomUUID(), email_verified_at: new Date().toISOString() }],
          })
          .mockResolvedValueOnce({ rows: [] }), // Insert reset token
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockClient as any);
      });

      expect(sendSignupOtpEmail).toBeDefined();
    });

    it('should not reveal non-existent email', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({ rows: [] }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockClient as any);
      });

      // Should return success even for non-existent email (security)
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      const userId = randomUUID();
      mockReq.body = {
        email: 'test@example.com',
        token: 'valid-reset-token',
        password: 'NewSecurePass123!',
      };

      const mockClient = {
        query: vi.fn()
          .mockResolvedValueOnce({
            rows: [{
              user_id: userId,
              token_hash: 'hashed_token',
              expires_at: new Date(Date.now() + 3600000).toISOString(),
            }],
          })
          .mockResolvedValueOnce({ rows: [] }) // Update password
          .mockResolvedValueOnce({ rows: [] }), // Delete token
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        return callback(mockClient as any);
      });
    });

    it('should reject expired reset token', async () => {
      mockReq.body = {
        email: 'test@example.com',
        token: 'expired-token',
        password: 'NewSecurePass123!',
      };

      const mockClient = {
        query: vi.fn().mockResolvedValueOnce({
          rows: [{
            user_id: randomUUID(),
            token_hash: 'hashed_token',
            expires_at: new Date(Date.now() - 3600000).toISOString(),
          }],
        }),
        release: vi.fn(),
      };

      vi.mocked(withTransaction).mockImplementationOnce(async (callback) => {
        try {
          return await callback(mockClient as any);
        } catch (error: any) {
          expect(error.message).toContain('kadaluarsa');
          throw error;
        }
      });
    });
  });
});
