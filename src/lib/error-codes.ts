/**
 * Production Error Codes and Types
 *
 * Centralized error code definitions for all payment operations.
 * NEVER expose internal error details to users.
 */

// ============================================================================
// Error Code Enums
// ============================================================================

export enum ErrorCode {
  // Generic Errors
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',

  // Merchant/Onboarding Errors
  MERCHANT_CREATION_FAILED = 'MERCHANT_CREATION_FAILED',
  MERCHANT_VALIDATION_FAILED = 'MERCHANT_VALIDATION_FAILED',
  MERCHANT_ALREADY_EXISTS = 'MERCHANT_ALREADY_EXISTS',
  MERCHANT_NOT_FOUND = 'MERCHANT_NOT_FOUND',
  INVALID_MERCHANT_ADDRESS = 'INVALID_MERCHANT_ADDRESS',

  // Invoice Errors
  INVOICE_CREATION_FAILED = 'INVOICE_CREATION_FAILED',
  INVOICE_VALIDATION_FAILED = 'INVOICE_VALIDATION_FAILED',
  INVOICE_NOT_FOUND = 'INVOICE_NOT_FOUND',
  INVOICE_ALREADY_PAID = 'INVOICE_ALREADY_PAID',
  INVOICE_EXPIRED = 'INVOICE_EXPIRED',
  INVOICE_CANCELLED = 'INVOICE_CANCELLED',
  INVOICE_UPDATE_FAILED = 'INVOICE_UPDATE_FAILED',
  INVOICE_IMMUTABLE = 'INVOICE_IMMUTABLE',
  INVALID_INVOICE_AMOUNT = 'INVALID_INVOICE_AMOUNT',
  INVALID_INVOICE_TOKEN = 'INVALID_INVOICE_TOKEN',

  // Subscription Errors
  SUBSCRIPTION_CREATION_FAILED = 'SUBSCRIPTION_CREATION_FAILED',
  SUBSCRIPTION_VALIDATION_FAILED = 'SUBSCRIPTION_VALIDATION_FAILED',
  SUBSCRIPTION_NOT_FOUND = 'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_ALREADY_ACTIVE = 'SUBSCRIPTION_ALREADY_ACTIVE',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_RENEWAL_FAILED = 'SUBSCRIPTION_RENEWAL_FAILED',
  INVALID_SUBSCRIPTION_INTERVAL = 'INVALID_SUBSCRIPTION_INTERVAL',
  INVALID_SUBSCRIPTION_PRICE = 'INVALID_SUBSCRIPTION_PRICE',

  // Payment Errors
  PAYMENT_FAILED = 'PAYMENT_FAILED',
  PAYMENT_REJECTED = 'PAYMENT_REJECTED',
  PAYMENT_TIMEOUT = 'PAYMENT_TIMEOUT',
  PAYMENT_CANCELLED = 'PAYMENT_CANCELLED',
  DUPLICATE_PAYMENT = 'DUPLICATE_PAYMENT',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INSUFFICIENT_ALLOWANCE = 'INSUFFICIENT_ALLOWANCE',
  INVALID_PAYMENT_AMOUNT = 'INVALID_PAYMENT_AMOUNT',
  INVALID_PAYMENT_TOKEN = 'INVALID_PAYMENT_TOKEN',
  PAYMENT_AMOUNT_MISMATCH = 'PAYMENT_AMOUNT_MISMATCH',

  // Wallet/Signature Errors
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_CONNECTION_FAILED = 'WALLET_CONNECTION_FAILED',
  SIGNATURE_REJECTED = 'SIGNATURE_REJECTED',
  SIGNATURE_EXPIRED = 'SIGNATURE_EXPIRED',
  SIGNATURE_INVALID = 'SIGNATURE_INVALID',
  WRONG_NETWORK = 'WRONG_NETWORK',
  NETWORK_SWITCH_FAILED = 'NETWORK_SWITCH_FAILED',

  // Token/Contract Errors
  TOKEN_NOT_SUPPORTED = 'TOKEN_NOT_SUPPORTED',
  TOKEN_APPROVAL_FAILED = 'TOKEN_APPROVAL_FAILED',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  CONTRACT_REVERTED = 'CONTRACT_REVERTED',
  GAS_ESTIMATION_FAILED = 'GAS_ESTIMATION_FAILED',

  // Session Errors
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  SESSION_REVOKED = 'SESSION_REVOKED',
  SESSION_BUDGET_EXCEEDED = 'SESSION_BUDGET_EXCEEDED',

  // Rate Limiting
  RATE_LIMITED = 'RATE_LIMITED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
}

// ============================================================================
// Structured API Error Response
// ============================================================================

export interface ApiErrorResponse {
  success: false;
  errorCode: ErrorCode;
  userMessage: string;
  /** Internal reference ID for support - safe to show to users */
  referenceId?: string;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;

// ============================================================================
// Internal Error Logging (NEVER exposed to UI)
// ============================================================================

export interface InternalErrorLog {
  errorCode: ErrorCode;
  timestamp: string;
  referenceId: string;
  originalError?: unknown;
  stackTrace?: string;
  context?: Record<string, unknown>;
  userId?: string;
  walletAddress?: string;
  invoiceId?: string;
  subscriptionId?: string;
  paymentId?: string;
}

// ============================================================================
// User-Friendly Error Messages
// ============================================================================

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // Generic Errors
  [ErrorCode.UNKNOWN_ERROR]: 'Something went wrong. Please try again.',
  [ErrorCode.NETWORK_ERROR]: 'Unable to connect. Please check your internet connection.',
  [ErrorCode.SERVER_ERROR]: 'Our servers are temporarily unavailable. Please try again later.',
  [ErrorCode.VALIDATION_ERROR]: 'Please check your input and try again.',
  [ErrorCode.TIMEOUT_ERROR]: 'The request took too long. Please try again.',

  // Merchant/Onboarding Errors
  [ErrorCode.MERCHANT_CREATION_FAILED]: 'Unable to create merchant account. Please try again.',
  [ErrorCode.MERCHANT_VALIDATION_FAILED]: 'Please verify your merchant details and try again.',
  [ErrorCode.MERCHANT_ALREADY_EXISTS]: 'A merchant account already exists for this address.',
  [ErrorCode.MERCHANT_NOT_FOUND]: 'Merchant account not found.',
  [ErrorCode.INVALID_MERCHANT_ADDRESS]: 'Please provide a valid wallet address.',

  // Invoice Errors
  [ErrorCode.INVOICE_CREATION_FAILED]: 'Unable to create invoice. Please try again.',
  [ErrorCode.INVOICE_VALIDATION_FAILED]: 'Please check the invoice details and try again.',
  [ErrorCode.INVOICE_NOT_FOUND]: 'Invoice not found.',
  [ErrorCode.INVOICE_ALREADY_PAID]: 'This invoice has already been paid.',
  [ErrorCode.INVOICE_EXPIRED]: 'This invoice is no longer payable.',
  [ErrorCode.INVOICE_CANCELLED]: 'This invoice has been cancelled.',
  [ErrorCode.INVOICE_UPDATE_FAILED]: 'Unable to update invoice. Please try again.',
  [ErrorCode.INVOICE_IMMUTABLE]: 'This invoice cannot be modified.',
  [ErrorCode.INVALID_INVOICE_AMOUNT]: 'Please enter a valid amount.',
  [ErrorCode.INVALID_INVOICE_TOKEN]: 'The selected payment token is not available.',

  // Subscription Errors
  [ErrorCode.SUBSCRIPTION_CREATION_FAILED]: 'Unable to create subscription. Please try again.',
  [ErrorCode.SUBSCRIPTION_VALIDATION_FAILED]: 'Please check the subscription details and try again.',
  [ErrorCode.SUBSCRIPTION_NOT_FOUND]: 'Subscription not found.',
  [ErrorCode.SUBSCRIPTION_ALREADY_ACTIVE]: 'You already have an active subscription.',
  [ErrorCode.SUBSCRIPTION_CANCELLED]: 'This subscription has been cancelled.',
  [ErrorCode.SUBSCRIPTION_EXPIRED]: 'This subscription has expired.',
  [ErrorCode.SUBSCRIPTION_RENEWAL_FAILED]: 'Unable to renew subscription. Please update your payment method.',
  [ErrorCode.INVALID_SUBSCRIPTION_INTERVAL]: 'Please select a valid billing interval.',
  [ErrorCode.INVALID_SUBSCRIPTION_PRICE]: 'Please enter a valid subscription price.',

  // Payment Errors
  [ErrorCode.PAYMENT_FAILED]: 'There was an issue processing your payment. Please try again.',
  [ErrorCode.PAYMENT_REJECTED]: 'Payment was declined. Please try a different payment method.',
  [ErrorCode.PAYMENT_TIMEOUT]: 'Payment timed out. Please try again.',
  [ErrorCode.PAYMENT_CANCELLED]: 'Payment was cancelled.',
  [ErrorCode.DUPLICATE_PAYMENT]: 'This payment has already been processed.',
  [ErrorCode.INSUFFICIENT_FUNDS]: 'Insufficient balance. Please add funds and try again.',
  [ErrorCode.INSUFFICIENT_ALLOWANCE]: 'Token approval required. Please approve the transaction.',
  [ErrorCode.INVALID_PAYMENT_AMOUNT]: 'Invalid payment amount.',
  [ErrorCode.INVALID_PAYMENT_TOKEN]: 'The selected token is not accepted for this payment.',
  [ErrorCode.PAYMENT_AMOUNT_MISMATCH]: 'Payment amount does not match the invoice.',

  // Wallet/Signature Errors
  [ErrorCode.WALLET_NOT_CONNECTED]: 'Please connect your wallet to continue.',
  [ErrorCode.WALLET_CONNECTION_FAILED]: 'Unable to connect wallet. Please try again.',
  [ErrorCode.SIGNATURE_REJECTED]: 'Transaction was rejected. Please try again.',
  [ErrorCode.SIGNATURE_EXPIRED]: 'Your signature has expired. Please try again.',
  [ErrorCode.SIGNATURE_INVALID]: 'Invalid signature. Please try again.',
  [ErrorCode.WRONG_NETWORK]: 'Please switch to the correct network.',
  [ErrorCode.NETWORK_SWITCH_FAILED]: 'Unable to switch network. Please switch manually.',

  // Token/Contract Errors
  [ErrorCode.TOKEN_NOT_SUPPORTED]: 'This token is not supported.',
  [ErrorCode.TOKEN_APPROVAL_FAILED]: 'Unable to approve token. Please try again.',
  [ErrorCode.CONTRACT_ERROR]: 'Transaction failed. Please try again.',
  [ErrorCode.CONTRACT_REVERTED]: 'Transaction was reverted. Please try again.',
  [ErrorCode.GAS_ESTIMATION_FAILED]: 'Unable to estimate transaction cost. Please try again.',

  // Session Errors
  [ErrorCode.SESSION_EXPIRED]: 'Your session has expired. Please reconnect.',
  [ErrorCode.SESSION_INVALID]: 'Invalid session. Please reconnect.',
  [ErrorCode.SESSION_REVOKED]: 'This session has been revoked.',
  [ErrorCode.SESSION_BUDGET_EXCEEDED]: 'Session spending limit reached.',

  // Rate Limiting
  [ErrorCode.RATE_LIMITED]: 'Too many requests. Please wait a moment.',
  [ErrorCode.TOO_MANY_REQUESTS]: 'Please slow down and try again.',
};

// ============================================================================
// Safe Error Mapper
// ============================================================================

/**
 * Get a user-friendly message for an error code.
 * ALWAYS returns a safe, non-revealing message.
 */
export function getSafeMessage(errorCode: ErrorCode | string): string {
  if (errorCode in ERROR_MESSAGES) {
    return ERROR_MESSAGES[errorCode as ErrorCode];
  }
  return ERROR_MESSAGES[ErrorCode.UNKNOWN_ERROR];
}

/**
 * Map any error to a safe ErrorCode.
 * This function NEVER exposes internal details.
 */
export function mapToErrorCode(error: unknown): ErrorCode {
  if (!error) {
    return ErrorCode.UNKNOWN_ERROR;
  }

  // Handle string errors
  if (typeof error === 'string') {
    return detectErrorCode(error);
  }

  // Handle Error objects
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return detectErrorCode(message);
  }

  // Handle API error responses
  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;

    // Check for explicit error code
    if (obj.errorCode && typeof obj.errorCode === 'string') {
      if (obj.errorCode in ErrorCode) {
        return obj.errorCode as ErrorCode;
      }
    }

    // Check for code field
    if (obj.code && typeof obj.code === 'string') {
      return detectErrorCode(obj.code);
    }

    // Check for message field
    if (obj.message && typeof obj.message === 'string') {
      return detectErrorCode(obj.message);
    }
  }

  return ErrorCode.UNKNOWN_ERROR;
}

/**
 * Detect error code from error message or code string.
 * Internal function - pattern matching on error content.
 */
function detectErrorCode(content: string): ErrorCode {
  const lower = content.toLowerCase();

  // Network errors
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('connection')) {
    return ErrorCode.NETWORK_ERROR;
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return ErrorCode.TIMEOUT_ERROR;
  }

  // User rejection
  if (lower.includes('user rejected') || lower.includes('user denied') || lower.includes('cancelled')) {
    return ErrorCode.SIGNATURE_REJECTED;
  }

  // Insufficient funds
  if (lower.includes('insufficient') && (lower.includes('fund') || lower.includes('balance'))) {
    return ErrorCode.INSUFFICIENT_FUNDS;
  }
  if (lower.includes('insufficient') && lower.includes('allowance')) {
    return ErrorCode.INSUFFICIENT_ALLOWANCE;
  }

  // Invoice states
  if (lower.includes('expired') && lower.includes('invoice')) {
    return ErrorCode.INVOICE_EXPIRED;
  }
  if (lower.includes('already paid') || lower.includes('duplicate')) {
    return ErrorCode.DUPLICATE_PAYMENT;
  }
  if (lower.includes('cancelled') && lower.includes('invoice')) {
    return ErrorCode.INVOICE_CANCELLED;
  }

  // Signature errors
  if (lower.includes('signature') && lower.includes('invalid')) {
    return ErrorCode.SIGNATURE_INVALID;
  }
  if (lower.includes('signature') && lower.includes('expired')) {
    return ErrorCode.SIGNATURE_EXPIRED;
  }

  // Contract errors
  if (lower.includes('revert') || lower.includes('reverted')) {
    return ErrorCode.CONTRACT_REVERTED;
  }
  if (lower.includes('gas')) {
    return ErrorCode.GAS_ESTIMATION_FAILED;
  }

  // Rate limiting
  if (lower.includes('rate') || lower.includes('too many')) {
    return ErrorCode.RATE_LIMITED;
  }

  // Server errors (HTTP status patterns)
  if (lower.includes('500') || lower.includes('502') || lower.includes('503')) {
    return ErrorCode.SERVER_ERROR;
  }
  if (lower.includes('404') || lower.includes('not found')) {
    return ErrorCode.INVOICE_NOT_FOUND;
  }
  if (lower.includes('400') || lower.includes('validation')) {
    return ErrorCode.VALIDATION_ERROR;
  }

  // Default
  return ErrorCode.UNKNOWN_ERROR;
}

// ============================================================================
// Error Response Factory
// ============================================================================

/**
 * Create a safe API error response.
 * NEVER includes internal error details.
 */
export function createErrorResponse(
  errorCode: ErrorCode,
  referenceId?: string
): ApiErrorResponse {
  return {
    success: false,
    errorCode,
    userMessage: getSafeMessage(errorCode),
    referenceId,
  };
}

/**
 * Create a success response.
 */
export function createSuccessResponse<T>(data: T): ApiSuccessResponse<T> {
  return {
    success: true,
    data,
  };
}

// ============================================================================
// Reference ID Generator
// ============================================================================

/**
 * Generate a unique reference ID for error tracking.
 * Safe to show to users for support purposes.
 */
export function generateReferenceId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `ERR-${timestamp}-${random}`.toUpperCase();
}

// ============================================================================
// Internal Error Logger
// ============================================================================

/**
 * Log an error internally. NEVER expose this data to users.
 * In production, this would send to a logging service.
 */
export function logInternalError(
  errorCode: ErrorCode,
  originalError: unknown,
  context?: Record<string, unknown>
): string {
  const referenceId = generateReferenceId();

  const logEntry: InternalErrorLog = {
    errorCode,
    timestamp: new Date().toISOString(),
    referenceId,
    originalError: sanitizeForLogging(originalError),
    stackTrace: originalError instanceof Error ? originalError.stack : undefined,
    context: sanitizeForLogging(context) as Record<string, unknown>,
    ...context,
  };

  // In development, log to console
  // In production, this would go to a logging service (DataDog, Sentry, etc.)
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Internal Error Log]', logEntry);
  }

  return referenceId;
}

/**
 * Sanitize sensitive data before logging.
 * Removes potential PII and sensitive values.
 */
function sanitizeForLogging(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }

  if (typeof data === 'string') {
    // Redact potential private keys
    if (data.length === 64 || data.length === 66) {
      return '[REDACTED_KEY]';
    }
    // Redact email addresses
    if (data.includes('@')) {
      return '[REDACTED_EMAIL]';
    }
    return data;
  }

  if (typeof data !== 'object') {
    return data;
  }

  if (Array.isArray(data)) {
    return data.map(sanitizeForLogging);
  }

  const sanitized: Record<string, unknown> = {};
  const sensitiveKeys = ['password', 'secret', 'key', 'token', 'signature', 'privateKey', 'seed'];

  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = sanitizeForLogging(value);
    }
  }

  return sanitized;
}

// ============================================================================
// Error Recovery Utilities
// ============================================================================

/**
 * Determine if an error is retryable.
 * Non-retryable errors include user rejections and validation failures.
 */
export function isRetryableError(errorCode: ErrorCode): boolean {
  const nonRetryable = [
    ErrorCode.SIGNATURE_REJECTED,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.INVOICE_EXPIRED,
    ErrorCode.INVOICE_CANCELLED,
    ErrorCode.INVOICE_ALREADY_PAID,
    ErrorCode.DUPLICATE_PAYMENT,
    ErrorCode.INVALID_INVOICE_AMOUNT,
    ErrorCode.INVALID_INVOICE_TOKEN,
    ErrorCode.INVOICE_NOT_FOUND,
    ErrorCode.MERCHANT_NOT_FOUND,
    ErrorCode.SUBSCRIPTION_EXPIRED,
    ErrorCode.SUBSCRIPTION_CANCELLED,
    ErrorCode.INVALID_MERCHANT_ADDRESS,
    ErrorCode.INVALID_PAYMENT_AMOUNT,
    ErrorCode.INVALID_PAYMENT_TOKEN,
  ];

  return !nonRetryable.includes(errorCode);
}

/**
 * Get suggested action for an error.
 * Returns a user-friendly suggestion for resolution.
 */
export function getSuggestedAction(errorCode: ErrorCode): string {
  const actions: Partial<Record<ErrorCode, string>> = {
    [ErrorCode.INSUFFICIENT_FUNDS]: 'Add funds to your wallet and try again.',
    [ErrorCode.INSUFFICIENT_ALLOWANCE]: 'Approve the token spending first.',
    [ErrorCode.WALLET_NOT_CONNECTED]: 'Connect your wallet to continue.',
    [ErrorCode.WRONG_NETWORK]: 'Switch to the correct network in your wallet.',
    [ErrorCode.SIGNATURE_REJECTED]: 'Approve the transaction in your wallet.',
    [ErrorCode.INVOICE_EXPIRED]: 'Request a new invoice from the merchant.',
    [ErrorCode.NETWORK_ERROR]: 'Check your internet connection and try again.',
    [ErrorCode.SERVER_ERROR]: 'Wait a moment and try again.',
    [ErrorCode.RATE_LIMITED]: 'Please wait a few seconds before trying again.',
    [ErrorCode.TIMEOUT_ERROR]: 'The request timed out. Please try again.',
    [ErrorCode.TOKEN_APPROVAL_FAILED]: 'Token approval failed. Please try again.',
    [ErrorCode.PAYMENT_TIMEOUT]: 'Payment timed out. Please try again.',
  };

  return actions[errorCode] || 'Please try again or contact support.';
}

export default {
  ErrorCode,
  getSafeMessage,
  mapToErrorCode,
  createErrorResponse,
  createSuccessResponse,
  generateReferenceId,
  logInternalError,
  isRetryableError,
  getSuggestedAction,
};
