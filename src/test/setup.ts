 
 
 
 
 
 
import '@testing-library/jest-dom';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Reset mocks between tests
afterEach(() => {
  cleanup();
});

// Mock Capacitor plugins
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => false,
    getPlatform: () => 'web'
  }
}));

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn()
  }
}));

vi.mock('@capacitor/toast', () => ({
  Toast: {
    show: vi.fn()
  }
}));
