/**
 * Error Codes Unit Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ErrorCode,
  getSafeMessage,
  mapToErrorCode,
  createErrorResponse,
  createSuccessResponse,
  generateReferenceId,
  isRetryableError,
  getSuggestedAction,
  logInternalError,
} from './error-codes';

describe('Error Codes', () => {
  describe('ErrorCode enum', () => {
    it('should have all expected generic error codes', () => {
      expect(ErrorCode.UNKNOWN_ERROR).toBe('UNKNOWN_ERROR');
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.SERVER_ERROR).toBe('SERVER_ERROR');
      expect(ErrorCode.VALIDATION_ERROR).toBe('VALIDATION_ERROR');
      expect(ErrorCode.TIMEOUT_ERROR).toBe('TIMEOUT_ERROR');
    });

    it('should have all expected payment error codes', () => {
      expect(ErrorCode.PAYMENT_FAILED).toBe('PAYMENT_FAILED');
      expect(ErrorCode.INSUFFICIENT_FUNDS).toBe('INSUFFICIENT_FUNDS');
      expect(ErrorCode.DUPLICATE_PAYMENT).toBe('DUPLICATE_PAYMENT');
    });

    it('should have all expected wallet error codes', () => {
      expect(ErrorCode.WALLET_NOT_CONNECTED).toBe('WALLET_NOT_CONNECTED');
      expect(ErrorCode.SIGNATURE_REJECTED).toBe('SIGNATURE_REJECTED');
      expect(ErrorCode.WRONG_NETWORK).toBe('WRONG_NETWORK');
    });
  });

  describe('getSafeMessage', () => {
    it('should return user-friendly message for known error codes', () => {
      const message = getSafeMessage(ErrorCode.INSUFFICIENT_FUNDS);
      expect(message).toBe('Insufficient balance. Please add funds and try again.');
    });

    it('should return default message for unknown error codes', () => {
      const message = getSafeMessage('INVALID_CODE' as ErrorCode);
      expect(message).toBe('Something went wrong. Please try again.');
    });

    it('should never expose internal details', () => {
      const message = getSafeMessage(ErrorCode.CONTRACT_REVERTED);
      expect(message).not.toContain('stack');
      expect(message).not.toContain('0x');
      expect(message).not.toContain('Error:');
    });
  });

  describe('mapToErrorCode', () => {
    it('should return UNKNOWN_ERROR for null/undefined', () => {
      expect(mapToErrorCode(null)).toBe(ErrorCode.UNKNOWN_ERROR);
      expect(mapToErrorCode(undefined)).toBe(ErrorCode.UNKNOWN_ERROR);
    });

    it('should detect network errors from string', () => {
      expect(mapToErrorCode('Network request failed')).toBe(ErrorCode.NETWORK_ERROR);
      expect(mapToErrorCode('fetch error')).toBe(ErrorCode.NETWORK_ERROR);
    });

    it('should detect timeout errors', () => {
      expect(mapToErrorCode('Request timed out')).toBe(ErrorCode.TIMEOUT_ERROR);
      expect(mapToErrorCode(new Error('timeout occurred'))).toBe(ErrorCode.TIMEOUT_ERROR);
    });

    it('should detect user rejection', () => {
      expect(mapToErrorCode('user rejected transaction')).toBe(ErrorCode.SIGNATURE_REJECTED);
      expect(mapToErrorCode('User denied')).toBe(ErrorCode.SIGNATURE_REJECTED);
    });

    it('should detect insufficient funds', () => {
      expect(mapToErrorCode('insufficient funds for gas')).toBe(ErrorCode.INSUFFICIENT_FUNDS);
      expect(mapToErrorCode('balance too low')).toBe(ErrorCode.INSUFFICIENT_FUNDS);
    });

    it('should detect insufficient allowance', () => {
      expect(mapToErrorCode('insufficient allowance')).toBe(ErrorCode.INSUFFICIENT_ALLOWANCE);
    });

    it('should extract error code from API response object', () => {
      const apiError = { errorCode: 'INVOICE_EXPIRED', message: 'Invoice has expired' };
      expect(mapToErrorCode(apiError)).toBe(ErrorCode.INVOICE_EXPIRED);
    });

    it('should handle Error objects', () => {
      const error = new Error('Network connection failed');
      expect(mapToErrorCode(error)).toBe(ErrorCode.NETWORK_ERROR);
    });
  });

  describe('createErrorResponse', () => {
    it('should create a properly structured error response', () => {
      const response = createErrorResponse(ErrorCode.PAYMENT_FAILED, 'REF-123');

      expect(response.success).toBe(false);
      expect(response.errorCode).toBe(ErrorCode.PAYMENT_FAILED);
      expect(response.userMessage).toBeDefined();
      expect(response.referenceId).toBe('REF-123');
    });

    it('should never include sensitive data', () => {
      const response = createErrorResponse(ErrorCode.CONTRACT_ERROR);
      const serialized = JSON.stringify(response);

      expect(serialized).not.toContain('privateKey');
      expect(serialized).not.toContain('password');
      expect(serialized).not.toContain('secret');
    });
  });

  describe('createSuccessResponse', () => {
    it('should wrap data in success response', () => {
      const data = { id: '123', amount: '100' };
      const response = createSuccessResponse(data);

      expect(response.success).toBe(true);
      expect(response.data).toEqual(data);
    });
  });

  describe('generateReferenceId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateReferenceId();
      const id2 = generateReferenceId();

      expect(id1).not.toBe(id2);
    });

    it('should follow ERR-* format', () => {
      const id = generateReferenceId();
      expect(id).toMatch(/^ERR-[A-Z0-9]+-[A-Z0-9]+$/);
    });

    it('should be safe to show to users', () => {
      const id = generateReferenceId();
      expect(id.length).toBeLessThan(30);
      expect(id).not.toContain(' ');
    });
  });

  describe('isRetryableError', () => {
    it('should return false for user rejections', () => {
      expect(isRetryableError(ErrorCode.SIGNATURE_REJECTED)).toBe(false);
    });

    it('should return false for validation errors', () => {
      expect(isRetryableError(ErrorCode.VALIDATION_ERROR)).toBe(false);
      expect(isRetryableError(ErrorCode.INVALID_INVOICE_AMOUNT)).toBe(false);
    });

    it('should return false for expired/cancelled states', () => {
      expect(isRetryableError(ErrorCode.INVOICE_EXPIRED)).toBe(false);
      expect(isRetryableError(ErrorCode.INVOICE_CANCELLED)).toBe(false);
      expect(isRetryableError(ErrorCode.DUPLICATE_PAYMENT)).toBe(false);
    });

    it('should return true for network errors', () => {
      expect(isRetryableError(ErrorCode.NETWORK_ERROR)).toBe(true);
      expect(isRetryableError(ErrorCode.TIMEOUT_ERROR)).toBe(true);
      expect(isRetryableError(ErrorCode.SERVER_ERROR)).toBe(true);
    });

    it('should return true for transient payment errors', () => {
      expect(isRetryableError(ErrorCode.PAYMENT_TIMEOUT)).toBe(true);
      expect(isRetryableError(ErrorCode.GAS_ESTIMATION_FAILED)).toBe(true);
    });
  });

  describe('getSuggestedAction', () => {
    it('should return helpful suggestions for common errors', () => {
      expect(getSuggestedAction(ErrorCode.INSUFFICIENT_FUNDS))
        .toBe('Add funds to your wallet and try again.');

      expect(getSuggestedAction(ErrorCode.WALLET_NOT_CONNECTED))
        .toBe('Connect your wallet to continue.');

      expect(getSuggestedAction(ErrorCode.WRONG_NETWORK))
        .toBe('Switch to the correct network in your wallet.');
    });

    it('should return generic suggestion for unknown errors', () => {
      expect(getSuggestedAction(ErrorCode.UNKNOWN_ERROR))
        .toContain('try again');
    });
  });

  describe('logInternalError', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('should return a reference ID', () => {
      const refId = logInternalError(ErrorCode.PAYMENT_FAILED, new Error('test'));
      expect(refId).toMatch(/^ERR-/);
    });

    it('should sanitize sensitive data', () => {
      const sensitiveContext = {
        privateKey: '0x1234567890abcdef',
        password: 'secret123',
        email: 'user@example.com',
      };

      logInternalError(ErrorCode.PAYMENT_FAILED, new Error('test'), sensitiveContext);

      // The internal log should not contain raw sensitive data
      const calls = (console.error as ReturnType<typeof vi.fn>).mock.calls;
      const loggedData = JSON.stringify(calls);

      expect(loggedData).not.toContain('0x1234567890abcdef');
      expect(loggedData).not.toContain('secret123');
    });
  });
});
