/**
 * Wallet Connection Module
 * Export all wallet-related components and utilities
 */

// Main components
export { WalletProvider, queryClient } from './WalletProvider';
export { WalletConnectButton, useWallet } from './WalletConnectButton';

// Configuration
export {
  wagmiConfig,
  bsc,
  bscTestnet,
  supportedChains,
  getChainByNetwork,
  isTestnetChain,
  walletConnectProjectId,
} from './wagmiConfig';
