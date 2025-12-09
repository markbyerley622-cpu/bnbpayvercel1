/**
 * Error Handling Module
 *
 * Central export point for all error handling utilities.
 * This module provides production-quality error handling for the USD1 Payments UI.
 *
 * DESIGN PRINCIPLES:
 * 1. NEVER expose internal error details to users
 * 2. All errors are logged internally for debugging
 * 3. User-facing messages are generic but helpful
 * 4. UI components are bounded and overflow-safe
 * 5. Retry logic is provided where appropriate
 */

// Re-export from error-codes
export {
  ErrorCode,
  getSafeMessage,
  mapToErrorCode,
  createErrorResponse,
  createSuccessResponse,
  generateReferenceId,
  logInternalError,
  isRetryableError,
  getSuggestedAction,
  type ApiErrorResponse,
  type ApiSuccessResponse,
  type ApiResponse,
  type InternalErrorLog,
} from './error-codes';

// Re-export safe service layer
export {
  createInvoiceSafe,
  getInvoiceSafe,
  getInvoiceStatusSafe,
  cancelInvoiceSafe,
  confirmInvoicePaymentSafe,
  createSubscriptionSafe,
  checkCanPaySafe,
  buildPaymentIntentSafe,
  relayPaymentSafe,
  executePaymentFlowSafe,
  processSubscriptionRenewalSafe,
  type ServiceResult,
  type PaymentFlowParams,
  type PaymentFlowResult,
  type RenewalResult,
  type SubscriptionCreateRequest,
} from './safe-service';
