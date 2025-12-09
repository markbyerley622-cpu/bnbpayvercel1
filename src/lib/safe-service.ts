/**
 * Safe Service Layer
 *
 * Production-grade service functions with comprehensive error handling.
 * All functions return structured responses - NEVER throw to callers.
 * Internal errors are logged but NEVER exposed to the UI.
 */

import {
  createInvoice as apiCreateInvoice,
  getInvoice as apiGetInvoice,
  getInvoiceStatus as apiGetInvoiceStatus,
  cancelInvoice as apiCancelInvoice,
  confirmInvoicePayment as apiConfirmPayment,
  buildPaymentIntent as apiBuildIntent,
  relayPayment as apiRelayPayment,
  canPay as apiCanPay,
  type InvoiceCreateRequest,
  type Invoice,
  type InvoiceStatusResponse,
  type BuildIntentRequest,
  type BuildIntentResponse,
  type RelayPaymentRequest,
  type RelayPaymentResponse,
  type CanPayParams,
  type CanPayResponse,
  type ConfirmPaymentRequest,
  type NetworkKey,
} from './bnbpay-api';

import {
  ErrorCode,
  getSafeMessage,
  mapToErrorCode,
  generateReferenceId,
  logInternalError,
  type ApiErrorResponse,
} from './error-codes';

// ============================================================================
// Service Response Types
// ============================================================================

export interface ServiceResult<T> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    referenceId: string;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Wrap any async operation with safe error handling.
 * NEVER exposes internal error details.
 */
async function safeExecute<T>(
  operation: () => Promise<T>,
  defaultErrorCode: ErrorCode,
  context?: Record<string, unknown>
): Promise<ServiceResult<T>> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error: unknown) {
    const errorCode = mapToErrorCode(error) || defaultErrorCode;
    const referenceId = logInternalError(errorCode, error, context);

    return {
      success: false,
      error: {
        code: errorCode,
        message: getSafeMessage(errorCode),
        referenceId,
      },
    };
  }
}

/**
 * Execute with retry logic for transient failures.
 */
async function safeExecuteWithRetry<T>(
  operation: () => Promise<T>,
  defaultErrorCode: ErrorCode,
  maxRetries: number = 3,
  delayMs: number = 1000,
  context?: Record<string, unknown>
): Promise<ServiceResult<T>> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const data = await operation();
      return { success: true, data };
    } catch (error: unknown) {
      lastError = error;

      // Don't retry user-initiated cancellations or validation errors
      const errorCode = mapToErrorCode(error);
      if (
        errorCode === ErrorCode.SIGNATURE_REJECTED ||
        errorCode === ErrorCode.VALIDATION_ERROR ||
        errorCode === ErrorCode.INVOICE_EXPIRED ||
        errorCode === ErrorCode.DUPLICATE_PAYMENT
      ) {
        break;
      }

      // Wait before retrying (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
      }
    }
  }

  const errorCode = mapToErrorCode(lastError) || defaultErrorCode;
  const referenceId = logInternalError(errorCode, lastError, {
    ...context,
    retriesExhausted: true,
  });

  return {
    success: false,
    error: {
      code: errorCode,
      message: getSafeMessage(errorCode),
      referenceId,
    },
  };
}

// ============================================================================
// Invoice Services
// ============================================================================

/**
 * Validate invoice creation request.
 * Returns null if valid, error response if invalid.
 */
function validateInvoiceRequest(request: Partial<InvoiceCreateRequest>): ApiErrorResponse | null {
  const referenceId = generateReferenceId();

  if (!request.title || request.title.trim().length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVOICE_VALIDATION_FAILED,
      userMessage: 'Please provide an invoice title.',
      referenceId,
    };
  }

  if (!request.merchantId || request.merchantId.trim().length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_MERCHANT_ADDRESS,
      userMessage: 'Please connect your wallet first.',
      referenceId,
    };
  }

  if (!request.amount || parseFloat(request.amount) <= 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_INVOICE_AMOUNT,
      userMessage: 'Please enter a valid amount greater than 0.',
      referenceId,
    };
  }

  if (!request.currencyToken) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_INVOICE_TOKEN,
      userMessage: 'Please select a settlement token.',
      referenceId,
    };
  }

  if (!request.network) {
    return {
      success: false,
      errorCode: ErrorCode.VALIDATION_ERROR,
      userMessage: 'Please select a network.',
      referenceId,
    };
  }

  return null;
}

/**
 * Create a new invoice with full validation and error handling.
 */
export async function createInvoiceSafe(
  request: InvoiceCreateRequest
): Promise<ServiceResult<Invoice>> {
  // Validate request
  const validationError = validateInvoiceRequest(request);
  if (validationError) {
    return {
      success: false,
      error: {
        code: validationError.errorCode,
        message: validationError.userMessage,
        referenceId: validationError.referenceId || generateReferenceId(),
      },
    };
  }

  return safeExecute(
    () => apiCreateInvoice(request),
    ErrorCode.INVOICE_CREATION_FAILED,
    { action: 'createInvoice', merchantId: request.merchantId }
  );
}

/**
 * Get invoice by ID.
 */
export async function getInvoiceSafe(invoiceId: string): Promise<ServiceResult<Invoice>> {
  if (!invoiceId || invoiceId.trim().length === 0) {
    const referenceId = generateReferenceId();
    return {
      success: false,
      error: {
        code: ErrorCode.INVOICE_NOT_FOUND,
        message: getSafeMessage(ErrorCode.INVOICE_NOT_FOUND),
        referenceId,
      },
    };
  }

  return safeExecute(
    () => apiGetInvoice(invoiceId),
    ErrorCode.INVOICE_NOT_FOUND,
    { action: 'getInvoice', invoiceId }
  );
}

/**
 * Get invoice status.
 */
export async function getInvoiceStatusSafe(
  invoiceId: string
): Promise<ServiceResult<InvoiceStatusResponse>> {
  if (!invoiceId) {
    return {
      success: false,
      error: {
        code: ErrorCode.INVOICE_NOT_FOUND,
        message: getSafeMessage(ErrorCode.INVOICE_NOT_FOUND),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecuteWithRetry(
    () => apiGetInvoiceStatus(invoiceId),
    ErrorCode.INVOICE_NOT_FOUND,
    3,
    500,
    { action: 'getInvoiceStatus', invoiceId }
  );
}

/**
 * Cancel an invoice.
 */
export async function cancelInvoiceSafe(invoiceId: string): Promise<ServiceResult<Invoice>> {
  if (!invoiceId) {
    return {
      success: false,
      error: {
        code: ErrorCode.INVOICE_NOT_FOUND,
        message: getSafeMessage(ErrorCode.INVOICE_NOT_FOUND),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecute(
    () => apiCancelInvoice(invoiceId),
    ErrorCode.INVOICE_UPDATE_FAILED,
    { action: 'cancelInvoice', invoiceId }
  );
}

/**
 * Confirm invoice payment.
 */
export async function confirmInvoicePaymentSafe(
  invoiceId: string,
  payment: ConfirmPaymentRequest
): Promise<ServiceResult<Invoice>> {
  if (!invoiceId || !payment.txHash) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: getSafeMessage(ErrorCode.VALIDATION_ERROR),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecute(
    () => apiConfirmPayment(invoiceId, payment),
    ErrorCode.PAYMENT_FAILED,
    { action: 'confirmPayment', invoiceId, txHash: payment.txHash }
  );
}

// ============================================================================
// Subscription Services
// ============================================================================

export interface SubscriptionCreateRequest {
  planName: string;
  merchantId: string;
  merchantName?: string;
  price: string;
  interval: 'monthly' | 'yearly';
  currencyToken: string;
  network: NetworkKey;
  customerEmail?: string;
}

/**
 * Validate subscription creation request.
 */
function validateSubscriptionRequest(
  request: Partial<SubscriptionCreateRequest>
): ApiErrorResponse | null {
  const referenceId = generateReferenceId();

  if (!request.planName || request.planName.trim().length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.SUBSCRIPTION_VALIDATION_FAILED,
      userMessage: 'Please provide a plan name.',
      referenceId,
    };
  }

  if (!request.merchantId || request.merchantId.trim().length === 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_MERCHANT_ADDRESS,
      userMessage: 'Please connect your wallet first.',
      referenceId,
    };
  }

  if (!request.price || parseFloat(request.price) <= 0) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_SUBSCRIPTION_PRICE,
      userMessage: 'Please enter a valid price greater than 0.',
      referenceId,
    };
  }

  if (!request.interval || !['monthly', 'yearly'].includes(request.interval)) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_SUBSCRIPTION_INTERVAL,
      userMessage: 'Please select a billing interval.',
      referenceId,
    };
  }

  if (!request.currencyToken) {
    return {
      success: false,
      errorCode: ErrorCode.INVALID_INVOICE_TOKEN,
      userMessage: 'Please select a settlement token.',
      referenceId,
    };
  }

  return null;
}

/**
 * Create subscription with validation and error handling.
 * Note: This creates the subscription data structure locally.
 * Actual on-chain subscription would use contract calls.
 */
export async function createSubscriptionSafe(
  request: SubscriptionCreateRequest
): Promise<ServiceResult<{ subscriptionId: string; planName: string; interval: string }>> {
  const validationError = validateSubscriptionRequest(request);
  if (validationError) {
    return {
      success: false,
      error: {
        code: validationError.errorCode,
        message: validationError.userMessage,
        referenceId: validationError.referenceId || generateReferenceId(),
      },
    };
  }

  // For now, create locally since the API doesn't have a subscription endpoint
  const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  return {
    success: true,
    data: {
      subscriptionId,
      planName: request.planName,
      interval: request.interval,
    },
  };
}

// ============================================================================
// Payment Services
// ============================================================================

/**
 * Check if payer can pay.
 */
export async function checkCanPaySafe(params: CanPayParams): Promise<ServiceResult<CanPayResponse>> {
  if (!params.from || !params.to || !params.amount) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: getSafeMessage(ErrorCode.VALIDATION_ERROR),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecute(
    () => apiCanPay(params),
    ErrorCode.PAYMENT_FAILED,
    { action: 'canPay', from: params.from, to: params.to }
  );
}

/**
 * Build payment intent.
 */
export async function buildPaymentIntentSafe(
  request: BuildIntentRequest
): Promise<ServiceResult<BuildIntentResponse>> {
  if (!request.merchant || !request.token || !request.amount) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: getSafeMessage(ErrorCode.VALIDATION_ERROR),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecute(
    () => apiBuildIntent(request),
    ErrorCode.PAYMENT_FAILED,
    { action: 'buildIntent', merchant: request.merchant }
  );
}

/**
 * Relay payment transaction.
 */
export async function relayPaymentSafe(
  request: RelayPaymentRequest
): Promise<ServiceResult<RelayPaymentResponse>> {
  if (!request.intent || !request.witness || !request.witnessSignature) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: getSafeMessage(ErrorCode.VALIDATION_ERROR),
        referenceId: generateReferenceId(),
      },
    };
  }

  return safeExecuteWithRetry(
    () => apiRelayPayment(request),
    ErrorCode.PAYMENT_FAILED,
    2,
    2000,
    { action: 'relayPayment', paymentId: request.intent.paymentId }
  );
}

// ============================================================================
// Payment Flow Handler
// ============================================================================

export interface PaymentFlowParams {
  invoiceId: string;
  payerAddress: string;
  merchantAddress: string;
  amount: string;
  tokenAddress: string;
  tokenSymbol: string;
  network: NetworkKey;
  onStatusUpdate?: (status: string) => void;
}

export interface PaymentFlowResult {
  success: boolean;
  txHash?: string;
  paymentId?: string;
  error?: {
    code: ErrorCode;
    message: string;
    referenceId: string;
  };
}

/**
 * Execute the complete payment flow with comprehensive error handling.
 * This orchestrates: can-pay check -> build intent -> relay payment.
 */
export async function executePaymentFlowSafe(
  params: PaymentFlowParams
): Promise<PaymentFlowResult> {
  const { onStatusUpdate } = params;

  try {
    // Step 1: Check if payer can pay
    onStatusUpdate?.('Checking balance...');

    const canPayResult = await checkCanPaySafe({
      network: params.network,
      from: params.payerAddress,
      to: params.merchantAddress,
      token: params.tokenAddress,
      amount: params.amount,
    });

    if (!canPayResult.success) {
      return {
        success: false,
        error: canPayResult.error,
      };
    }

    if (!canPayResult.data?.canPay) {
      const errorCode =
        canPayResult.data?.reason?.toLowerCase().includes('balance')
          ? ErrorCode.INSUFFICIENT_FUNDS
          : ErrorCode.INSUFFICIENT_ALLOWANCE;

      return {
        success: false,
        error: {
          code: errorCode,
          message: getSafeMessage(errorCode),
          referenceId: generateReferenceId(),
        },
      };
    }

    // Step 2: Build payment intent
    onStatusUpdate?.('Preparing payment...');

    const intentResult = await buildPaymentIntentSafe({
      mode: 'minimal',
      network: params.network,
      merchant: params.merchantAddress,
      token: params.tokenAddress,
      amount: params.amount,
      invoiceId: params.invoiceId,
      payer: params.payerAddress,
    });

    if (!intentResult.success || !intentResult.data) {
      return {
        success: false,
        error: intentResult.error || {
          code: ErrorCode.PAYMENT_FAILED,
          message: getSafeMessage(ErrorCode.PAYMENT_FAILED),
          referenceId: generateReferenceId(),
        },
      };
    }

    // At this point, the caller would need to sign the transaction
    // and call relayPaymentSafe with the signature

    return {
      success: true,
      paymentId: intentResult.data.derived?.paymentId || intentResult.data.paymentId,
    };
  } catch (error: unknown) {
    const errorCode = mapToErrorCode(error);
    const referenceId = logInternalError(errorCode, error, {
      action: 'executePaymentFlow',
      invoiceId: params.invoiceId,
    });

    return {
      success: false,
      error: {
        code: errorCode,
        message: getSafeMessage(errorCode),
        referenceId,
      },
    };
  }
}

// ============================================================================
// Subscription Renewal Handler
// ============================================================================

export interface RenewalResult {
  success: boolean;
  txHash?: string;
  nextDueDate?: Date;
  error?: {
    code: ErrorCode;
    message: string;
    referenceId: string;
  };
}

/**
 * Process subscription renewal with error handling.
 */
export async function processSubscriptionRenewalSafe(
  subscriptionId: string,
  payerAddress: string,
  merchantAddress: string,
  amount: string,
  tokenAddress: string,
  network: NetworkKey
): Promise<RenewalResult> {
  // Check can pay first
  const canPayResult = await checkCanPaySafe({
    network,
    from: payerAddress,
    to: merchantAddress,
    token: tokenAddress,
    amount,
  });

  if (!canPayResult.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.SUBSCRIPTION_RENEWAL_FAILED,
        message: getSafeMessage(ErrorCode.SUBSCRIPTION_RENEWAL_FAILED),
        referenceId: canPayResult.error?.referenceId || generateReferenceId(),
      },
    };
  }

  if (!canPayResult.data?.canPay) {
    return {
      success: false,
      error: {
        code: ErrorCode.INSUFFICIENT_FUNDS,
        message: getSafeMessage(ErrorCode.INSUFFICIENT_FUNDS),
        referenceId: generateReferenceId(),
      },
    };
  }

  // Build intent for renewal
  const intentResult = await buildPaymentIntentSafe({
    mode: 'minimal',
    network,
    merchant: merchantAddress,
    token: tokenAddress,
    amount,
    referenceId: `renewal_${subscriptionId}_${Date.now()}`,
    payer: payerAddress,
  });

  if (!intentResult.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.SUBSCRIPTION_RENEWAL_FAILED,
        message: getSafeMessage(ErrorCode.SUBSCRIPTION_RENEWAL_FAILED),
        referenceId: intentResult.error?.referenceId || generateReferenceId(),
      },
    };
  }

  // At this point, caller would sign and relay the payment
  return {
    success: true,
    nextDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
  };
}

// ============================================================================
// Error Recovery Utilities
// ============================================================================

/**
 * Determine if an error is retryable.
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
  ];

  return !nonRetryable.includes(errorCode);
}

/**
 * Get suggested action for an error.
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
  };

  return actions[errorCode] || 'Please try again or contact support.';
}

export default {
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
  isRetryableError,
  getSuggestedAction,
};
