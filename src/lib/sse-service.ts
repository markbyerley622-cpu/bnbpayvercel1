/**
 * Unified SSE (Server-Sent Events) Subscription Service
 *
 * Provides a centralized, robust SSE connection management system
 * for real-time invoice and subscription status updates.
 */

// ============================================================================
// Types
// ============================================================================

export type InvoiceStatus = 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled' | 'expired' | 'past_due';

export interface SSEInvoiceUpdate {
  event: 'snapshot' | 'update' | 'connected' | 'error';
  data?: {
    invoiceId?: string;
    status?: InvoiceStatus;
    txHash?: string;
    paidAt?: string;
    amount?: string;
    token?: string;
  };
  error?: string;
}

export interface SSESubscriptionUpdate {
  event: 'snapshot' | 'update' | 'connected' | 'error';
  data?: {
    subscriptionId?: string;
    status?: SubscriptionStatus;
    nextBillingDate?: string;
    lastPaymentDate?: string;
  };
  error?: string;
}

export interface SSEConnectionOptions {
  onUpdate: (data: SSEInvoiceUpdate | SSESubscriptionUpdate) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  maxRetries?: number;
  retryDelay?: number;
}

export interface SSEConnection {
  disconnect: () => void;
  isConnected: () => boolean;
  getConnectionId: () => string;
}

// ============================================================================
// Constants
// ============================================================================

const API_BASE_URL = '/api';
const DEFAULT_MAX_RETRIES = 5;
const DEFAULT_RETRY_DELAY = 2000;
const MAX_RETRY_DELAY = 30000;

// ============================================================================
// Connection Manager
// ============================================================================

class SSEConnectionManager {
  private connections: Map<string, EventSource> = new Map();
  private retryAttempts: Map<string, number> = new Map();
  private retryTimeouts: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Subscribe to invoice updates via SSE
   */
  subscribeToInvoice(invoiceId: string, options: SSEConnectionOptions): SSEConnection {
    const connectionId = `invoice_${invoiceId}`;
    return this.createConnection(
      connectionId,
      `${API_BASE_URL}/invoices/${invoiceId}/stream-sse`,
      options
    );
  }

  /**
   * Subscribe to subscription updates via SSE
   */
  subscribeToSubscription(subscriptionId: string, options: SSEConnectionOptions): SSEConnection {
    const connectionId = `subscription_${subscriptionId}`;
    return this.createConnection(
      connectionId,
      `${API_BASE_URL}/subscriptions/${subscriptionId}/stream-sse`,
      options
    );
  }

  /**
   * Create a new SSE connection with automatic reconnection
   */
  private createConnection(
    connectionId: string,
    url: string,
    options: SSEConnectionOptions
  ): SSEConnection {
    const {
      onUpdate,
      onError,
      onConnect,
      onDisconnect,
      maxRetries = DEFAULT_MAX_RETRIES,
      retryDelay = DEFAULT_RETRY_DELAY,
    } = options;

    // Close existing connection if any
    this.closeConnection(connectionId);

    const connect = () => {
      try {
        const eventSource = new EventSource(url);
        this.connections.set(connectionId, eventSource);

        eventSource.onopen = () => {
          console.log(`[SSE] Connected: ${connectionId}`);
          this.retryAttempts.set(connectionId, 0);
          onConnect?.();
        };

        eventSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log(`[SSE] Message received for ${connectionId}:`, data);
            onUpdate(data);
          } catch (parseError) {
            console.error(`[SSE] Failed to parse message for ${connectionId}:`, parseError);
            // Don't treat parse errors as connection errors
          }
        };

        eventSource.onerror = (error) => {
          console.error(`[SSE] Error for ${connectionId}:`, error);

          // Check if connection is closed
          if (eventSource.readyState === EventSource.CLOSED) {
            onDisconnect?.();
            this.handleReconnect(connectionId, url, options, maxRetries, retryDelay);
          } else if (eventSource.readyState === EventSource.CONNECTING) {
            // Connection is attempting to reconnect automatically
            console.log(`[SSE] Reconnecting: ${connectionId}`);
          } else {
            onError?.(new Error('SSE connection error'));
          }
        };
      } catch (error) {
        console.error(`[SSE] Failed to create connection for ${connectionId}:`, error);
        onError?.(error instanceof Error ? error : new Error('Failed to create SSE connection'));
        this.handleReconnect(connectionId, url, options, maxRetries, retryDelay);
      }
    };

    connect();

    return {
      disconnect: () => this.closeConnection(connectionId),
      isConnected: () => this.isConnected(connectionId),
      getConnectionId: () => connectionId,
    };
  }

  /**
   * Handle reconnection with exponential backoff
   */
  private handleReconnect(
    connectionId: string,
    url: string,
    options: SSEConnectionOptions,
    maxRetries: number,
    baseRetryDelay: number
  ) {
    const currentAttempts = this.retryAttempts.get(connectionId) || 0;

    if (currentAttempts >= maxRetries) {
      console.warn(`[SSE] Max retries reached for ${connectionId}, stopping reconnection`);
      options.onError?.(new Error('Max reconnection attempts reached'));
      this.closeConnection(connectionId);
      return;
    }

    // Exponential backoff with jitter
    const delay = Math.min(
      baseRetryDelay * Math.pow(2, currentAttempts) + Math.random() * 1000,
      MAX_RETRY_DELAY
    );

    console.log(`[SSE] Scheduling reconnect for ${connectionId} in ${delay}ms (attempt ${currentAttempts + 1}/${maxRetries})`);

    this.retryAttempts.set(connectionId, currentAttempts + 1);

    const timeout = setTimeout(() => {
      if (!this.connections.has(connectionId) || this.connections.get(connectionId)?.readyState === EventSource.CLOSED) {
        this.createConnection(connectionId, url, options);
      }
    }, delay);

    this.retryTimeouts.set(connectionId, timeout);
  }

  /**
   * Close a connection and clean up resources
   */
  private closeConnection(connectionId: string) {
    const eventSource = this.connections.get(connectionId);
    if (eventSource) {
      eventSource.close();
      this.connections.delete(connectionId);
    }

    const timeout = this.retryTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.retryTimeouts.delete(connectionId);
    }

    this.retryAttempts.delete(connectionId);
    console.log(`[SSE] Disconnected: ${connectionId}`);
  }

  /**
   * Check if a connection is active
   */
  private isConnected(connectionId: string): boolean {
    const eventSource = this.connections.get(connectionId);
    return eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Close all connections
   */
  disconnectAll() {
    for (const connectionId of this.connections.keys()) {
      this.closeConnection(connectionId);
    }
  }

  /**
   * Get all active connection IDs
   */
  getActiveConnections(): string[] {
    return Array.from(this.connections.keys()).filter((id) => this.isConnected(id));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const sseManager = new SSEConnectionManager();

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Subscribe to invoice status updates
 */
export function subscribeToInvoice(
  invoiceId: string,
  onUpdate: (status: InvoiceStatus, data?: SSEInvoiceUpdate['data']) => void,
  options?: Partial<SSEConnectionOptions>
): SSEConnection {
  return sseManager.subscribeToInvoice(invoiceId, {
    onUpdate: (update) => {
      const invoiceUpdate = update as SSEInvoiceUpdate;
      if (invoiceUpdate.data?.status) {
        onUpdate(invoiceUpdate.data.status, invoiceUpdate.data);
      }
    },
    ...options,
  });
}

/**
 * Subscribe to subscription status updates
 */
export function subscribeToSubscriptionStatus(
  subscriptionId: string,
  onUpdate: (status: SubscriptionStatus, data?: SSESubscriptionUpdate['data']) => void,
  options?: Partial<SSEConnectionOptions>
): SSEConnection {
  return sseManager.subscribeToSubscription(subscriptionId, {
    onUpdate: (update) => {
      const subUpdate = update as SSESubscriptionUpdate;
      if (subUpdate.data?.status) {
        onUpdate(subUpdate.data.status, subUpdate.data);
      }
    },
    ...options,
  });
}

/**
 * Get status color class based on invoice status
 */
export function getInvoiceStatusColor(status: InvoiceStatus): string {
  switch (status) {
    case 'paid':
      return 'bg-green-500';
    case 'pending':
      return 'bg-yellow-500';
    case 'expired':
      return 'bg-gray-500';
    case 'cancelled':
      return 'bg-red-500';
    case 'failed':
      return 'bg-red-600';
    default:
      return 'bg-gray-400';
  }
}

/**
 * Get status text color class based on invoice status
 */
export function getInvoiceStatusTextColor(status: InvoiceStatus): string {
  switch (status) {
    case 'paid':
      return 'text-green-500';
    case 'pending':
      return 'text-yellow-500';
    case 'expired':
      return 'text-gray-500';
    case 'cancelled':
      return 'text-red-500';
    case 'failed':
      return 'text-red-600';
    default:
      return 'text-gray-400';
  }
}

/**
 * Get status badge styles based on invoice status
 */
export function getInvoiceStatusBadge(status: InvoiceStatus): { bg: string; text: string; label: string } {
  switch (status) {
    case 'paid':
      return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Paid' };
    case 'pending':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Pending' };
    case 'expired':
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Expired' };
    case 'cancelled':
      return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Cancelled' };
    case 'failed':
      return { bg: 'bg-red-600/20', text: 'text-red-500', label: 'Failed' };
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Unknown' };
  }
}

/**
 * Get status badge styles based on subscription status
 */
export function getSubscriptionStatusBadge(status: SubscriptionStatus): { bg: string; text: string; label: string } {
  switch (status) {
    case 'active':
      return { bg: 'bg-green-500/20', text: 'text-green-400', label: 'Active' };
    case 'paused':
      return { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Paused' };
    case 'cancelled':
      return { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Cancelled' };
    case 'expired':
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Expired' };
    case 'past_due':
      return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Past Due' };
    default:
      return { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'Unknown' };
  }
}

export default sseManager;
