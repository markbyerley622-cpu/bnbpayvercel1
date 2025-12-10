/**
 * Production API Client
 *
 * Centralized API wrapper with:
 * - Retry logic with exponential backoff
 * - Request cancellation support
 * - Idempotency tokens for mutations
 * - Type-safe request/response shapes
 * - Comprehensive error handling
 *
 * SECURITY NOTES:
 * - Never store API keys in frontend code
 * - All sensitive operations require backend validation
 * - CSRF tokens are handled server-side
 */

import { config } from './config';
import { ErrorCode, mapToErrorCode, logInternalError, generateReferenceId } from './error-codes';

// ============================================================================
// Types
// ============================================================================

export interface ApiRequestOptions {
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Idempotency key for mutations */
  idempotencyKey?: string;
  /** AbortController signal for cancellation */
  signal?: AbortSignal;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Skip retry on specific error codes */
  noRetryOnCodes?: number[];
}

export interface ApiResponse<T> {
  data: T | null;
  error: ApiError | null;
  status: number;
  headers: Headers;
}

export interface ApiError {
  code: ErrorCode;
  message: string;
  referenceId: string;
  statusCode: number;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// Request/Response types for API endpoints
export interface CreateInvoiceRequest {
  merchantAddress: string;
  amount: string;
  token: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  dueDate?: string;
  payeeWalletAddress?: string;
  allowedTokens?: string[];
  metadata?: Record<string, string>;
}

export interface InvoiceResponse {
  invoiceId: string;
  reference: string;
  resourceId: string;
  status: 'pending' | 'paid' | 'cancelled' | 'expired';
  amount: string;
  token: string;
  merchantAddress: string;
  paymentLink: string;
  createdAt: number;
  expiresAt?: number;
  paidAt?: number;
  txHash?: string;
}

export interface CreateSubscriptionRequest {
  merchantAddress: string;
  planName: string;
  price: string;
  token: string;
  interval: 'monthly' | 'yearly';
  allowedTokens?: string[];
  metadata?: Record<string, string>;
}

export interface SubscriptionResponse {
  subscriptionId: string;
  planId: number;
  status: 'active' | 'paused' | 'cancelled' | 'expired';
  planName: string;
  price: string;
  token: string;
  interval: 'monthly' | 'yearly';
  merchantAddress: string;
  paymentLink: string;
  createdAt: number;
  nextBillingDate?: number;
  txHash?: string;
}

export interface PaymentRequest {
  invoiceId?: string;
  subscriptionId?: string;
  payerAddress: string;
  token: string;
  amount: string;
  signature?: string;
  permitData?: {
    deadline: number;
    v: number;
    r: string;
    s: string;
  };
}

export interface PaymentResponse {
  paymentId: string;
  status: 'pending' | 'processing' | 'confirmed' | 'failed';
  txHash?: string;
  blockNumber?: number;
  confirmedAt?: number;
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: config.api.retryAttempts,
  baseDelay: config.api.retryDelay,
  maxDelay: 30000,
  backoffMultiplier: 2,
};

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const exponentialDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelay);
  // Add jitter (0-25% of delay) to prevent thundering herd
  const jitter = cappedDelay * Math.random() * 0.25;
  return cappedDelay + jitter;
}

/**
 * Determine if an error is retryable
 */
function isRetryableError(status: number, noRetryOnCodes?: number[]): boolean {
  // Never retry these
  if (noRetryOnCodes?.includes(status)) return false;

  // Retry on server errors and rate limits
  if (status >= 500) return true;
  if (status === 429) return true; // Rate limited
  if (status === 408) return true; // Timeout

  // Don't retry client errors
  return false;
}

// ============================================================================
// Idempotency Key Management
// ============================================================================

/**
 * Generate a unique idempotency key
 * Format: idem_[timestamp]_[random]
 */
export function generateIdempotencyKey(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `idem_${timestamp}_${random}`;
}

/**
 * Storage for tracking in-flight requests
 */
const inFlightRequests = new Map<string, Promise<ApiResponse<unknown>>>();

// ============================================================================
// API Client Class
// ============================================================================

class ApiClient {
  private baseUrl: string;
  private defaultTimeout: number;

  constructor() {
    this.baseUrl = config.api.baseUrl;
    this.defaultTimeout = config.api.timeout;
  }

  /**
   * Make an API request with retry logic
   */
  async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
    path: string,
    body?: unknown,
    options: ApiRequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const {
      timeout = this.defaultTimeout,
      retries = DEFAULT_RETRY_CONFIG.maxAttempts,
      idempotencyKey,
      signal,
      headers: customHeaders = {},
      noRetryOnCodes,
    } = options;

    // Check for duplicate requests with same idempotency key
    if (idempotencyKey && inFlightRequests.has(idempotencyKey)) {
      console.warn(`Duplicate request detected for idempotency key: ${idempotencyKey}`);
      return inFlightRequests.get(idempotencyKey) as Promise<ApiResponse<T>>;
    }

    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...customHeaders,
    };

    // Add idempotency key header for mutations
    if (idempotencyKey && method !== 'GET') {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    // Add network identifier
    headers['X-Network'] = config.networkMode;
    headers['X-Chain-Id'] = config.network.chainId.toString();

    let lastError: ApiError | null = null;
    let attempt = 0;

    const executeRequest = async (): Promise<ApiResponse<T>> => {
      while (attempt < retries) {
        attempt++;

        // Create timeout controller
        const timeoutController = new AbortController();
        const timeoutId = setTimeout(() => timeoutController.abort(), timeout);

        // Combine with external signal if provided
        const combinedSignal = signal
          ? AbortSignal.any([signal, timeoutController.signal])
          : timeoutController.signal;

        try {
          const response = await fetch(url, {
            method,
            headers,
            body: body ? this.serializeBody(body) : undefined,
            signal: combinedSignal,
          });

          clearTimeout(timeoutId);

          // Parse response
          let data: T | null = null;
          const contentType = response.headers.get('content-type');

          if (contentType?.includes('application/json')) {
            const text = await response.text();
            data = text ? this.parseResponse<T>(text) : null;
          }

          // Success
          if (response.ok) {
            return {
              data,
              error: null,
              status: response.status,
              headers: response.headers,
            };
          }

          // Error response
          const errorData = data as unknown as { message?: string; code?: string; details?: Record<string, unknown> };
          const apiError = this.createError(
            response.status,
            errorData?.message || `Request failed with status ${response.status}`,
            errorData?.details
          );

          // Check if retryable
          if (isRetryableError(response.status, noRetryOnCodes) && attempt < retries) {
            lastError = apiError;
            const delay = calculateDelay(attempt, DEFAULT_RETRY_CONFIG);
            console.warn(`Request failed (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          return {
            data: null,
            error: apiError,
            status: response.status,
            headers: response.headers,
          };

        } catch (err) {
          clearTimeout(timeoutId);

          // Handle abort/timeout
          if (err instanceof Error && err.name === 'AbortError') {
            const isTimeout = !signal?.aborted;
            const errorMessage = isTimeout ? 'Request timeout' : 'Request cancelled';
            const errorCode = isTimeout ? ErrorCode.TIMEOUT_ERROR : ErrorCode.NETWORK_ERROR;

            return {
              data: null,
              error: {
                code: errorCode,
                message: errorMessage,
                referenceId: generateReferenceId(),
                statusCode: 0,
                retryable: isTimeout,
              },
              status: 0,
              headers: new Headers(),
            };
          }

          // Network error - retry
          if (attempt < retries) {
            lastError = this.createError(0, 'Network error');
            const delay = calculateDelay(attempt, DEFAULT_RETRY_CONFIG);
            console.warn(`Network error (attempt ${attempt}/${retries}), retrying in ${delay}ms...`);
            await sleep(delay);
            continue;
          }

          return {
            data: null,
            error: this.createError(0, 'Network error - please check your connection'),
            status: 0,
            headers: new Headers(),
          };
        }
      }

      // All retries exhausted
      return {
        data: null,
        error: lastError || this.createError(0, 'Request failed after all retries'),
        status: 0,
        headers: new Headers(),
      };
    };

    // Track in-flight request if idempotency key provided
    const requestPromise = executeRequest();

    if (idempotencyKey) {
      inFlightRequests.set(idempotencyKey, requestPromise as Promise<ApiResponse<unknown>>);
      requestPromise.finally(() => {
        inFlightRequests.delete(idempotencyKey);
      });
    }

    return requestPromise;
  }

  /**
   * Serialize request body with BigInt support
   */
  private serializeBody(body: unknown): string {
    return JSON.stringify(body, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
  }

  /**
   * Parse response with BigInt support
   */
  private parseResponse<T>(text: string): T {
    return JSON.parse(text, (_, value) => {
      // Convert large number strings back to BigInt if needed
      if (typeof value === 'string' && /^\d{15,}$/.test(value)) {
        try {
          return BigInt(value);
        } catch {
          return value;
        }
      }
      return value;
    });
  }

  /**
   * Create a standardized API error
   */
  private createError(statusCode: number, message: string, details?: Record<string, unknown>): ApiError {
    const code = mapToErrorCode(new Error(message));
    const referenceId = logInternalError(code, new Error(message), { statusCode, details });

    return {
      code,
      message,
      referenceId,
      statusCode,
      retryable: isRetryableError(statusCode),
      details,
    };
  }

  // ============================================================================
  // Convenience Methods
  // ============================================================================

  async get<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('GET', path, undefined, options);
  }

  async post<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('POST', path, body, options);
  }

  async put<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PUT', path, body, options);
  }

  async patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('PATCH', path, body, options);
  }

  async delete<T>(path: string, options?: ApiRequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>('DELETE', path, undefined, options);
  }
}

// ============================================================================
// API Service Methods
// ============================================================================

const client = new ApiClient();

/**
 * Invoice API
 */
export const invoiceApi = {
  /**
   * Create a new invoice
   * Uses idempotency to prevent duplicate invoices
   */
  async create(data: CreateInvoiceRequest, idempotencyKey?: string): Promise<ApiResponse<InvoiceResponse>> {
    return client.post<InvoiceResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/invoices`,
      data,
      { idempotencyKey: idempotencyKey || generateIdempotencyKey() }
    );
  },

  /**
   * Get invoice by ID
   */
  async get(invoiceId: string): Promise<ApiResponse<InvoiceResponse>> {
    return client.get<InvoiceResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/invoices/${invoiceId}`
    );
  },

  /**
   * Cancel an invoice
   */
  async cancel(invoiceId: string): Promise<ApiResponse<InvoiceResponse>> {
    return client.post<InvoiceResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/invoices/${invoiceId}/cancel`,
      {},
      { idempotencyKey: generateIdempotencyKey() }
    );
  },

  /**
   * List invoices for a merchant
   */
  async list(
    merchantAddress: string,
    options?: { page?: number; pageSize?: number; status?: string }
  ): Promise<ApiResponse<PaginatedResponse<InvoiceResponse>>> {
    const params = new URLSearchParams({
      merchant: merchantAddress,
      ...(options?.page && { page: options.page.toString() }),
      ...(options?.pageSize && { pageSize: options.pageSize.toString() }),
      ...(options?.status && { status: options.status }),
    });
    return client.get<PaginatedResponse<InvoiceResponse>>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/invoices?${params}`
    );
  },
};

/**
 * Subscription API
 */
export const subscriptionApi = {
  /**
   * Create a new subscription plan
   */
  async create(data: CreateSubscriptionRequest, idempotencyKey?: string): Promise<ApiResponse<SubscriptionResponse>> {
    return client.post<SubscriptionResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions`,
      data,
      { idempotencyKey: idempotencyKey || generateIdempotencyKey() }
    );
  },

  /**
   * Get subscription by ID
   */
  async get(subscriptionId: string): Promise<ApiResponse<SubscriptionResponse>> {
    return client.get<SubscriptionResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions/${subscriptionId}`
    );
  },

  /**
   * Pause a subscription
   */
  async pause(subscriptionId: string): Promise<ApiResponse<SubscriptionResponse>> {
    return client.post<SubscriptionResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions/${subscriptionId}/pause`,
      {},
      { idempotencyKey: generateIdempotencyKey() }
    );
  },

  /**
   * Resume a paused subscription
   */
  async resume(subscriptionId: string): Promise<ApiResponse<SubscriptionResponse>> {
    return client.post<SubscriptionResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions/${subscriptionId}/resume`,
      {},
      { idempotencyKey: generateIdempotencyKey() }
    );
  },

  /**
   * Cancel a subscription
   */
  async cancel(subscriptionId: string): Promise<ApiResponse<SubscriptionResponse>> {
    return client.post<SubscriptionResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions/${subscriptionId}/cancel`,
      {},
      { idempotencyKey: generateIdempotencyKey() }
    );
  },

  /**
   * List subscriptions for a merchant
   */
  async list(
    merchantAddress: string,
    options?: { page?: number; pageSize?: number; status?: string }
  ): Promise<ApiResponse<PaginatedResponse<SubscriptionResponse>>> {
    const params = new URLSearchParams({
      merchant: merchantAddress,
      ...(options?.page && { page: options.page.toString() }),
      ...(options?.pageSize && { pageSize: options.pageSize.toString() }),
      ...(options?.status && { status: options.status }),
    });
    return client.get<PaginatedResponse<SubscriptionResponse>>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/subscriptions?${params}`
    );
  },
};

/**
 * Payment API
 */
export const paymentApi = {
  /**
   * Submit a payment
   */
  async submit(data: PaymentRequest, idempotencyKey?: string): Promise<ApiResponse<PaymentResponse>> {
    return client.post<PaymentResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/payments`,
      data,
      { idempotencyKey: idempotencyKey || generateIdempotencyKey() }
    );
  },

  /**
   * Get payment status
   */
  async getStatus(paymentId: string): Promise<ApiResponse<PaymentResponse>> {
    return client.get<PaymentResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/payments/${paymentId}`
    );
  },

  /**
   * Verify a transaction on-chain
   */
  async verify(txHash: string): Promise<ApiResponse<PaymentResponse>> {
    return client.get<PaymentResponse>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/payments/verify/${txHash}`
    );
  },
};

/**
 * Wallet API - for checking balances and approvals
 */
export const walletApi = {
  /**
   * Get token balances for an address
   */
  async getBalances(address: string): Promise<ApiResponse<Record<string, string>>> {
    return client.get<Record<string, string>>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/wallets/${address}/balances`
    );
  },

  /**
   * Get payments for a wallet
   */
  async getPayments(
    address: string,
    options?: { page?: number; pageSize?: number; role?: 'payer' | 'merchant' | 'all' }
  ): Promise<ApiResponse<PaginatedResponse<PaymentResponse>>> {
    const params = new URLSearchParams({
      ...(options?.page && { page: options.page.toString() }),
      ...(options?.pageSize && { pageSize: options.pageSize.toString() }),
      ...(options?.role && { role: options.role }),
    });
    return client.get<PaginatedResponse<PaymentResponse>>(
      `/v1/${config.networkMode === 'mainnet' ? 'bnb' : 'bnbTestnet'}/wallets/${address}/payments?${params}`
    );
  },
};

export { client as apiClient };
export default client;
