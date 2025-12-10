/**
 * API Client Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateIdempotencyKey,
  invoiceApi,
  subscriptionApi,
  paymentApi,
  walletApi,
} from './api-client';
import { mockFetchResponse, mockFetchError } from '../test/setup';

describe('API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('generateIdempotencyKey', () => {
    it('should generate unique keys', () => {
      const key1 = generateIdempotencyKey();
      const key2 = generateIdempotencyKey();

      expect(key1).not.toBe(key2);
    });

    it('should follow idem_* format', () => {
      const key = generateIdempotencyKey();
      expect(key).toMatch(/^idem_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  describe('invoiceApi', () => {
    describe('create', () => {
      it('should create an invoice with valid data', async () => {
        const mockResponse = {
          invoiceId: 'inv_123',
          reference: 'REF-001',
          resourceId: 'res_456',
          status: 'pending',
          amount: '100.00',
          token: 'USDT',
          merchantAddress: '0x1234567890123456789012345678901234567890',
          paymentLink: 'https://pay.bnbpay.org/inv_123',
          createdAt: Date.now(),
        };

        mockFetchResponse(mockResponse);

        const result = await invoiceApi.create({
          merchantAddress: '0x1234567890123456789012345678901234567890',
          amount: '100.00',
          token: 'USDT',
          description: 'Test invoice',
        });

        expect(result.data).toEqual(mockResponse);
        expect(result.error).toBeNull();
      });

      it('should handle API errors gracefully', async () => {
        mockFetchResponse({ message: 'Invalid amount' }, 400);

        const result = await invoiceApi.create({
          merchantAddress: '0x1234',
          amount: '-100',
          token: 'USDT',
          description: 'Invalid invoice',
        });

        expect(result.data).toBeNull();
        expect(result.error).not.toBeNull();
        expect(result.error?.statusCode).toBe(400);
      });

      it('should use idempotency key for mutations', async () => {
        mockFetchResponse({ invoiceId: 'inv_123' });

        await invoiceApi.create(
          {
            merchantAddress: '0x1234567890123456789012345678901234567890',
            amount: '100.00',
            token: 'USDT',
            description: 'Test',
          },
          'custom-idem-key'
        );

        const fetchCalls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
        expect(fetchCalls[0][1].headers['Idempotency-Key']).toBe('custom-idem-key');
      });
    });

    describe('get', () => {
      it('should retrieve invoice by ID', async () => {
        const mockInvoice = {
          invoiceId: 'inv_123',
          status: 'paid',
          amount: '100.00',
        };

        mockFetchResponse(mockInvoice);

        const result = await invoiceApi.get('inv_123');

        expect(result.data?.invoiceId).toBe('inv_123');
        expect(result.error).toBeNull();
      });

      it('should handle not found errors', async () => {
        mockFetchResponse({ message: 'Invoice not found' }, 404);

        const result = await invoiceApi.get('inv_nonexistent');

        expect(result.data).toBeNull();
        expect(result.error?.statusCode).toBe(404);
      });
    });

    describe('cancel', () => {
      it('should cancel an invoice', async () => {
        mockFetchResponse({ invoiceId: 'inv_123', status: 'cancelled' });

        const result = await invoiceApi.cancel('inv_123');

        expect(result.data?.status).toBe('cancelled');
      });
    });

    describe('list', () => {
      it('should list invoices with pagination', async () => {
        const mockResponse = {
          items: [{ invoiceId: 'inv_1' }, { invoiceId: 'inv_2' }],
          total: 10,
          page: 1,
          pageSize: 10,
          hasMore: false,
        };

        mockFetchResponse(mockResponse);

        const result = await invoiceApi.list(
          '0x1234567890123456789012345678901234567890',
          { page: 1, pageSize: 10 }
        );

        expect(result.data?.items.length).toBe(2);
        expect(result.data?.total).toBe(10);
      });
    });
  });

  describe('subscriptionApi', () => {
    describe('create', () => {
      it('should create a subscription plan', async () => {
        const mockResponse = {
          subscriptionId: 'sub_123',
          planId: 1,
          status: 'active',
          planName: 'Pro Plan',
          price: '29.99',
          token: 'USDT',
          interval: 'monthly',
        };

        mockFetchResponse(mockResponse);

        const result = await subscriptionApi.create({
          merchantAddress: '0x1234567890123456789012345678901234567890',
          planName: 'Pro Plan',
          price: '29.99',
          token: 'USDT',
          interval: 'monthly',
        });

        expect(result.data?.subscriptionId).toBe('sub_123');
        expect(result.data?.planName).toBe('Pro Plan');
      });
    });

    describe('pause', () => {
      it('should pause a subscription', async () => {
        mockFetchResponse({ subscriptionId: 'sub_123', status: 'paused' });

        const result = await subscriptionApi.pause('sub_123');

        expect(result.data?.status).toBe('paused');
      });
    });

    describe('resume', () => {
      it('should resume a paused subscription', async () => {
        mockFetchResponse({ subscriptionId: 'sub_123', status: 'active' });

        const result = await subscriptionApi.resume('sub_123');

        expect(result.data?.status).toBe('active');
      });
    });
  });

  describe('paymentApi', () => {
    describe('submit', () => {
      it('should submit a payment', async () => {
        mockFetchResponse({
          paymentId: 'pay_123',
          status: 'processing',
        });

        const result = await paymentApi.submit({
          invoiceId: 'inv_123',
          payerAddress: '0x1234567890123456789012345678901234567890',
          token: 'USDT',
          amount: '100.00',
        });

        expect(result.data?.paymentId).toBe('pay_123');
        expect(result.data?.status).toBe('processing');
      });
    });

    describe('verify', () => {
      it('should verify a transaction', async () => {
        mockFetchResponse({
          paymentId: 'pay_123',
          status: 'confirmed',
          txHash: '0xabc123',
          blockNumber: 12345678,
        });

        const result = await paymentApi.verify('0xabc123');

        expect(result.data?.status).toBe('confirmed');
        expect(result.data?.blockNumber).toBe(12345678);
      });
    });
  });

  describe('walletApi', () => {
    describe('getBalances', () => {
      it('should retrieve token balances', async () => {
        const mockBalances = {
          BNB: '1.5',
          USDT: '1000.00',
          USDC: '500.00',
        };

        mockFetchResponse(mockBalances);

        const result = await walletApi.getBalances(
          '0x1234567890123456789012345678901234567890'
        );

        expect(result.data?.USDT).toBe('1000.00');
      });
    });
  });

  describe('Retry Logic', () => {
    it('should retry on 500 errors', async () => {
      // First two calls fail, third succeeds
      mockFetchResponse({ message: 'Server error' }, 500);
      mockFetchResponse({ message: 'Server error' }, 500);
      mockFetchResponse({ invoiceId: 'inv_123' }, 200);

      const result = await invoiceApi.get('inv_123');

      // Should have been called 3 times
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
      expect(result.data).not.toBeNull();
    });

    it('should not retry on 400 errors', async () => {
      mockFetchResponse({ message: 'Bad request' }, 400);

      const result = await invoiceApi.get('inv_invalid');

      // Should only be called once
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect(result.error?.statusCode).toBe(400);
    });

    it('should handle network errors with retry', async () => {
      mockFetchError('Network error');
      mockFetchError('Network error');
      mockFetchResponse({ invoiceId: 'inv_123' }, 200);

      const result = await invoiceApi.get('inv_123');

      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3);
      expect(result.data).not.toBeNull();
    });
  });

  describe('Network Headers', () => {
    it('should include network mode header', async () => {
      mockFetchResponse({ invoiceId: 'inv_123' });

      await invoiceApi.get('inv_123');

      const fetchCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(fetchCall[1].headers['X-Network']).toBeDefined();
      expect(fetchCall[1].headers['X-Chain-Id']).toBeDefined();
    });
  });
});
