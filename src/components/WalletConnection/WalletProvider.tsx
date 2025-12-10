/**
 * Wallet Provider Component
 * Wraps the app with Wagmi + React Query providers
 * Handles auto-reconnect and error handling
 */

import { ReactNode, useEffect } from 'react';
import { WagmiProvider as WagmiProviderCore } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { wagmiConfig } from './wagmiConfig';
import { useToast } from '../../contexts/ToastContext';

// Create a stable QueryClient instance
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry failed queries up to 3 times
      retry: 3,
      // Cache data for 30 seconds
      staleTime: 30 * 1000,
      // Keep cached data for 5 minutes
      gcTime: 5 * 60 * 1000, // renamed from cacheTime in v5
      // Don't refetch on window focus in dev (annoying during development)
      refetchOnWindowFocus: import.meta.env.PROD,
    },
    mutations: {
      // Don't retry mutations by default
      retry: false,
    },
  },
});

interface WalletProviderProps {
  children: ReactNode;
}

/**
 * Main Wallet Provider
 * Provides Wagmi + React Query context to the entire app
 */
export function WalletProvider({ children }: WalletProviderProps) {
  return (
    <WagmiProviderCore config={wagmiConfig} reconnectOnMount={true}>
      <QueryClientProvider client={queryClient}>
        <WalletErrorBoundary>
          {children}
        </WalletErrorBoundary>
      </QueryClientProvider>
    </WagmiProviderCore>
  );
}

/**
 * Error Boundary for Wallet Errors
 * Catches wallet-related errors and shows toast notifications
 */
function WalletErrorBoundary({ children }: { children: ReactNode }) {
  const toast = useToast();

  // Listen for wallet events and show appropriate toasts
  useEffect(() => {
    // Handle account changes
    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        toast.info('Wallet disconnected');
      } else {
        toast.success(`Connected: ${accounts[0].slice(0, 6)}...${accounts[0].slice(-4)}`);
      }
    };

    // Handle chain changes
    const handleChainChanged = (chainId: string) => {
      const chainIdNum = parseInt(chainId, 16);
      if (chainIdNum === 56) {
        toast.success('Switched to BNB Chain Mainnet');
      } else if (chainIdNum === 97) {
        toast.info('Switched to BNB Chain Testnet');
      } else {
        toast.warning('Unsupported network. Please switch to BNB Chain.');
      }
    };

    // Handle connection errors
    const handleDisconnect = (error: { code: number; message: string }) => {
      if (error?.code === 4001) {
        toast.info('Connection request cancelled');
      } else {
        toast.error('Wallet disconnected');
      }
    };

    // Subscribe to wallet events if available
    if (typeof window !== 'undefined' && window.ethereum) {
      window.ethereum.on?.('accountsChanged', handleAccountsChanged);
      window.ethereum.on?.('chainChanged', handleChainChanged);
      window.ethereum.on?.('disconnect', handleDisconnect);

      return () => {
        window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged);
        window.ethereum?.removeListener?.('chainChanged', handleChainChanged);
        window.ethereum?.removeListener?.('disconnect', handleDisconnect);
      };
    }
  }, [toast]);

  return <>{children}</>;
}

// Export query client for use elsewhere if needed
export { queryClient };

// Re-export wagmiConfig for convenience
export { wagmiConfig } from './wagmiConfig';
