/**
 * React Hooks for BNBPay API
 *
 * Provides easy-to-use hooks for fetching data from the BNBPay API
 * with loading states, error handling, and automatic refetching.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  bnbpayApi,
  type Payment,
  type PaymentStatusResponse,
  type PaymentsResponse,
  type Session,
  type SessionsResponse,
  type SessionSpendsResponse,
  type SessionPaymentsResponse,
  type NetworkConfig,
  type NetworksResponse,
  type WalletPaymentsResponse,
  type CanPayResponse,
  type CanPayParams,
  type HealthResponse,
  type NetworkKey,
  type PaymentsParams,
  type WalletPaymentsParams,
  type SessionsParams,
  type AgentSessionsParams,
  type BuildIntentRequest,
  type BuildIntentResponse,
  type Token,
  type TokensResponse,
} from './bnbpay-api';

// ============================================================================
// Types
// ============================================================================

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

interface UseApiOptions {
  enabled?: boolean;
  refetchInterval?: number; // milliseconds
  onSuccess?: (data: unknown) => void;
  onError?: (error: Error) => void;
}

// ============================================================================
// Generic Hook Factory
// ============================================================================

function useApiQuery<T>(
  queryFn: () => Promise<T>,
  dependencies: unknown[] = [],
  options: UseApiOptions = {}
): UseApiState<T> {
  const { enabled = true, refetchInterval, onSuccess, onError } = options;
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<Error | null>(null);

  const fetchData = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = await queryFn();
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [queryFn, enabled, onSuccess, onError]);

  useEffect(() => {
    fetchData();
  }, [...dependencies, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional refetch interval
  useEffect(() => {
    if (!refetchInterval || !enabled) return;

    const interval = setInterval(fetchData, refetchInterval);
    return () => clearInterval(interval);
  }, [refetchInterval, enabled, fetchData]);

  return {
    data,
    loading,
    error,
    refetch: fetchData,
  };
}

// ============================================================================
// Health Hook
// ============================================================================

/**
 * Check API health status
 * Polls every 30 seconds by default to keep status indicator up-to-date
 */
export function useApiHealth(options?: UseApiOptions): UseApiState<HealthResponse> {
  return useApiQuery(
    () => bnbpayApi.getHealth(),
    [],
    { refetchInterval: 30000, ...options }
  );
}

// ============================================================================
// Network Hooks
// ============================================================================

/**
 * Get all supported networks
 */
export function useNetworks(options?: UseApiOptions): UseApiState<NetworksResponse> {
  return useApiQuery(() => bnbpayApi.getNetworks(), [], options);
}

/**
 * Get network config by key
 */
export function useNetwork(
  key: NetworkKey | null,
  options?: UseApiOptions
): UseApiState<NetworkConfig | undefined> {
  return useApiQuery(
    () => bnbpayApi.getNetworkByKey(key!),
    [key],
    { ...options, enabled: !!key && options?.enabled !== false }
  );
}

// ============================================================================
// Token Hooks
// ============================================================================

/**
 * Get all supported tokens across all networks
 */
export function useTokens(options?: UseApiOptions): UseApiState<TokensResponse> {
  return useApiQuery(() => bnbpayApi.getTokens(), [], options);
}

/**
 * Get tokens for a specific network
 */
export function useTokensByNetwork(
  network: NetworkKey | null,
  options?: UseApiOptions
): UseApiState<Token[]> {
  return useApiQuery(
    () => bnbpayApi.getTokensByNetwork(network!),
    [network],
    { ...options, enabled: !!network && options?.enabled !== false }
  );
}

// ============================================================================
// Payment Hooks
// ============================================================================

/**
 * Get all payments with optional filters
 */
export function usePayments(
  params?: PaymentsParams,
  options?: UseApiOptions
): UseApiState<PaymentsResponse> {
  return useApiQuery(
    () => bnbpayApi.getPayments(params),
    [params?.page, params?.pageSize, params?.network, params?.invoice_type, params?.reference],
    options
  );
}

/**
 * Get a specific payment by ID
 */
export function usePayment(
  paymentId: string | null,
  options?: UseApiOptions
): UseApiState<Payment> {
  return useApiQuery(
    () => bnbpayApi.getPayment(paymentId!),
    [paymentId],
    { ...options, enabled: !!paymentId && options?.enabled !== false }
  );
}

/**
 * Get payment status by ID
 */
export function usePaymentStatus(
  paymentId: string | null,
  network?: NetworkKey,
  options?: UseApiOptions
): UseApiState<PaymentStatusResponse> {
  return useApiQuery(
    () => bnbpayApi.getPaymentStatus(paymentId!, network),
    [paymentId, network],
    { ...options, enabled: !!paymentId && options?.enabled !== false }
  );
}

/**
 * Check if a payer can make a payment
 */
export function useCanPay(
  params: CanPayParams | null,
  options?: UseApiOptions
): UseApiState<CanPayResponse> {
  return useApiQuery(
    () => bnbpayApi.canPay(params!),
    [params?.network, params?.from, params?.to, params?.token, params?.amount],
    { ...options, enabled: !!params && options?.enabled !== false }
  );
}

/**
 * Build payment intent
 */
export function useBuildIntent(
  request: BuildIntentRequest | null,
  options?: UseApiOptions
): UseApiState<BuildIntentResponse> {
  return useApiQuery(
    () => bnbpayApi.buildPaymentIntent(request!),
    [request?.network, request?.merchant, request?.token, request?.amount],
    { ...options, enabled: !!request && options?.enabled !== false }
  );
}

// ============================================================================
// Wallet Hooks
// ============================================================================

/**
 * Get all payments for a wallet address
 * @param address - Wallet address to fetch payments for
 * @param params.role - 'payer', 'merchant', or 'all' (default: fetches payments as payer)
 * @param params.network - Optional network filter ('bnb' | 'bnbTestnet')
 */
export function useWalletPayments(
  address: string | null,
  params?: WalletPaymentsParams,
  options?: UseApiOptions
): UseApiState<WalletPaymentsResponse> {
  return useApiQuery(
    () => bnbpayApi.getWalletPayments(address!, params),
    [address, params?.page, params?.pageSize, params?.role, params?.network],
    { ...options, enabled: !!address && options?.enabled !== false }
  );
}

// ============================================================================
// Session Hooks
// ============================================================================

/**
 * Get sessions for a wallet
 */
export function useSessions(
  params: SessionsParams | null,
  options?: UseApiOptions
): UseApiState<SessionsResponse> {
  return useApiQuery(
    () => bnbpayApi.getSessions(params!),
    [params?.wallet, params?.role, params?.network, params?.page, params?.pageSize],
    { ...options, enabled: !!params?.wallet && options?.enabled !== false }
  );
}

/**
 * Get sessions for a specific agent address
 */
export function useAgentSessions(
  agentAddress: string | null,
  params: AgentSessionsParams | null,
  options?: UseApiOptions
): UseApiState<SessionsResponse> {
  return useApiQuery(
    () => bnbpayApi.getAgentSessions(agentAddress!, params!),
    [agentAddress, params?.network, params?.page, params?.pageSize],
    { ...options, enabled: !!agentAddress && !!params && options?.enabled !== false }
  );
}

/**
 * Get a specific session by ID
 */
export function useSession(
  sessionId: string | null,
  options?: UseApiOptions
): UseApiState<Session> {
  return useApiQuery(
    () => bnbpayApi.getSession(sessionId!),
    [sessionId],
    { ...options, enabled: !!sessionId && options?.enabled !== false }
  );
}

/**
 * Get all spends for a session
 */
export function useSessionSpends(
  sessionId: string | null,
  params?: { page?: number; pageSize?: number },
  options?: UseApiOptions
): UseApiState<SessionSpendsResponse> {
  return useApiQuery(
    () => bnbpayApi.getSessionSpends(sessionId!, params),
    [sessionId, params?.page, params?.pageSize],
    { ...options, enabled: !!sessionId && options?.enabled !== false }
  );
}

/**
 * Get all payments for a session
 */
export function useSessionPayments(
  sessionId: string | null,
  params?: { page?: number; pageSize?: number },
  options?: UseApiOptions
): UseApiState<SessionPaymentsResponse> {
  return useApiQuery(
    () => bnbpayApi.getSessionPayments(sessionId!, params),
    [sessionId, params?.page, params?.pageSize],
    { ...options, enabled: !!sessionId && options?.enabled !== false }
  );
}

// ============================================================================
// Combined Hooks for Common Use Cases
// ============================================================================

/**
 * Hook for payment history with real-time status updates
 * Combines wallet payments with automatic status polling
 */
export function usePaymentHistory(
  walletAddress: string | null,
  options?: { pollInterval?: number; pageSize?: number; role?: 'payer' | 'merchant' }
) {
  const { pollInterval = 30000, pageSize = 50, role } = options || {};

  const {
    data: walletData,
    loading,
    error,
    refetch,
  } = useWalletPayments(
    walletAddress,
    { pageSize, role },
    { refetchInterval: pollInterval }
  );

  return {
    payments: walletData?.data || [],
    totalCount: walletData?.total || 0,
    hasMore: walletData?.hasMore || false,
    page: walletData?.page || 0,
    loading,
    error,
    refetch,
  };
}

/**
 * Hook for session management with spend tracking
 */
export function useSessionWithSpends(sessionId: string | null) {
  const session = useSession(sessionId);
  const spends = useSessionSpends(sessionId, undefined, {
    enabled: !!session.data,
  });

  return {
    session: session.data,
    spends: spends.data?.data || [],
    totalSpends: spends.data?.total || 0,
    loading: session.loading || spends.loading,
    error: session.error || spends.error,
    refetch: async () => {
      await session.refetch();
      await spends.refetch();
    },
  };
}

/**
 * Hook to get network contracts info
 */
export function useNetworkContracts(networkKey: NetworkKey | null) {
  const { data, loading, error, refetch } = useNetwork(networkKey);

  return {
    registry: data?.registry,
    router: data?.router,
    sessionStore: data?.sessionStore,
    permit2: data?.permit2,
    chainId: data?.chainId,
    name: data?.name,
    loading,
    error,
    refetch,
  };
}

// ============================================================================
// Export all hooks
// ============================================================================

export const bnbpayHooks = {
  useApiHealth,
  useNetworks,
  useNetwork,
  useNetworkContracts,
  useTokens,
  useTokensByNetwork,
  usePayments,
  usePayment,
  usePaymentStatus,
  useCanPay,
  useBuildIntent,
  useWalletPayments,
  useSessions,
  useAgentSessions,
  useSession,
  useSessionSpends,
  useSessionPayments,
  usePaymentHistory,
  useSessionWithSpends,
};

export default bnbpayHooks;
