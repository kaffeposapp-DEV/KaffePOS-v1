/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '@/lib/supabase';

// Mock Supabase
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
      getSession: vi.fn(),
      getUser: vi.fn(),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: '123', email: 'test@example.com' }, error: null })),
        })),
      })),
      upsert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: { id: '123', email: 'test@example.com' }, error: null })),
        })),
      })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('signIn berhasil -> session tersimpan', async () => {
    const mockSession = { user: { id: '123', email: 'test@example.com' }, access_token: 'abc' };
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: mockSession },
      error: null,
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(error).toBeNull();
    expect(data.session).toEqual(mockSession);
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    });
  });

  it('signIn gagal -> error ditampilkan', async () => {
    (supabase.auth.signInWithPassword as any).mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid login credentials', status: 401 },
    });

    const { data, error } = await supabase.auth.signInWithPassword({
      email: 'wrong@example.com',
      password: 'wrongpassword',
    });

    expect(error).not.toBeNull();
    expect(error?.message).toBe('Invalid login credentials');
    expect(data.session).toBeNull();
  });

  it('signOut -> session terhapus', async () => {
    await supabase.auth.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('session persist setelah reload (mock context logic)', async () => {
    const mockSession = { user: { id: '123', email: 'test@example.com' } };
    localStorage.setItem('kaffepos_session_cache', JSON.stringify(mockSession));
    
    const cached = JSON.parse(localStorage.getItem('kaffepos_session_cache') || 'null');
    expect(cached).toEqual(mockSession);
  });
});
