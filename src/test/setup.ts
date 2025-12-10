/**
 * Test Setup
 *
 * Global test configuration and mocks for Vitest.
 */

import { vi, beforeAll, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Mock window.ethereum for wallet tests
const mockEthereum = {
  isMetaMask: true,
  request: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
  selectedAddress: '0x1234567890123456789012345678901234567890',
  chainId: '0x61', // BSC Testnet
};

beforeAll(() => {
  // Mock window.ethereum
  Object.defineProperty(window, 'ethereum', {
    value: mockEthereum,
    writable: true,
  });

  // Mock localStorage
  const localStorageMock = {
    store: {} as Record<string, string>,
    getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      localStorageMock.store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete localStorageMock.store[key];
    }),
    clear: vi.fn(() => {
      localStorageMock.store = {};
    }),
  };

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
  });

  // Mock matchMedia for responsive tests
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Mock IntersectionObserver
  const mockIntersectionObserver = vi.fn();
  mockIntersectionObserver.mockReturnValue({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  });
  window.IntersectionObserver = mockIntersectionObserver as unknown as typeof IntersectionObserver;

  // Mock clipboard API
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue(''),
    },
    writable: true,
  });

  // Mock fetch
  global.fetch = vi.fn();
});

afterEach(() => {
  vi.clearAllMocks();
  (window.localStorage as { store: Record<string, string> }).store = {};
});

// Global test utilities
export const mockEthereumProvider = mockEthereum;

export function mockFetchResponse<T>(data: T, status = 200): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

export function mockFetchError(message: string): void {
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error(message));
}

// Type augmentations for vitest globals
declare global {
  interface Window {
    ethereum: typeof mockEthereum;
  }
}
