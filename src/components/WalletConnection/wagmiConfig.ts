/**
 * Wagmi Configuration for BNBPay
 * Supports BNB Chain Mainnet (56) and Testnet (97)
 * Uses Reown AppKit (formerly WalletConnect) for mobile wallet support
 * Note: MetaMask/injected wallets are excluded - use WalletConnect or Trust Wallet
 */

// @ts-nocheck - Disable strict type checking for AppKit compatibility
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';

// WalletConnect Project ID - Get from https://cloud.reown.com
// Using a fallback ID for development - REPLACE WITH YOUR OWN IN PRODUCTION
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '98363cb7dabd04bd755d6883b8c36d43';

// Chain configuration - BNB Chain first (default)
// Note: Using spread to create mutable arrays for AppKit compatibility
const mainnetChains = [bsc];
const testnetChains = [bscTestnet];

// Always include both mainnet and testnet chains
// Users need to be able to switch between networks
const allChains = [...mainnetChains, ...testnetChains];

// Create Wagmi adapter with BNB Chain as primary
// Exclude injected (MetaMask) connector to avoid network issues
const wagmiAdapter = new WagmiAdapter({
  networks: allChains as any,
  projectId,
});

// Metadata URL - use current page origin to avoid WalletConnect warnings
const metadataUrl = typeof window !== 'undefined'
  ? window.location.origin
  : (import.meta.env.VITE_APP_URL || 'https://bnb-pay-eight.vercel.app');

// Create AppKit modal with Pepay/BNBPay branding
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks: allChains as any,
  defaultNetwork: bscTestnet, // Default to BNB Chain Testnet for development
  metadata: {
    name: 'BNBPay',
    description: 'USD1-first payments on BNB Chain with multi-token support',
    url: metadataUrl,
    icons: ['/2.png', '/bnblogo.png'], // BNBPay logos
  },
  // BNB yellow theme
  themeMode: 'dark',
  themeVariables: {
    '--w3m-color-mix': '#F0B90B', // BNB Yellow
    '--w3m-color-mix-strength': 25,
    '--w3m-border-radius-master': '12px',
    '--w3m-accent': '#F0B90B',
  },
  // Wallet features - disable email/social, focus on crypto wallets
  // Exclude MetaMask/injected to avoid testnet compatibility issues
  features: {
    analytics: true, // Enable analytics for debugging
    email: false,
    socials: false,
    emailShowWallets: false,
  },
  // Exclude MetaMask and other injected wallets that have testnet issues
  // Only allow WalletConnect-based connections (Trust Wallet, etc.)
  excludeWalletIds: [
    'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
  ],
  // Include only wallets that work well with testnet
  featuredWalletIds: [
    '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
    '8a0ee50d1f22f6651afcae7eb4253e52a3310b90af5daef78a8c4929a9bb99d4', // Binance Web3 Wallet
    'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e3cfb6b3a38bd033aa', // Coinbase Wallet
  ],
});

// Export the wagmi config for use in providers
export const wagmiConfig = wagmiAdapter.wagmiConfig;

// Type augmentation for wagmi
declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig;
  }
}

// Export chains for reference
export { bsc, bscTestnet };
export const supportedChains = allChains;

// Helper to get chain by network type
export function getChainByNetwork(network: 'mainnet' | 'testnet') {
  return network === 'mainnet' ? bsc : bscTestnet;
}

// Helper to check if chain is testnet
export function isTestnetChain(chainId: number): boolean {
  return chainId === bscTestnet.id;
}

// Export project ID for debugging
export const walletConnectProjectId = projectId;
