/**
 * Environment Configuration
 *
 * Centralized configuration for mainnet/testnet switching.
 * All environment-specific values should be accessed through this module.
 *
 * MAINNET MIGRATION CHECKLIST:
 * 1. Set VITE_NETWORK_MODE=mainnet in .env.production
 * 2. Verify all contract addresses are mainnet addresses
 * 3. Verify API endpoints point to production
 * 4. Run full test suite against mainnet contracts (read-only)
 * 5. Deploy with feature flag VITE_MAINNET_ENABLED=true
 */

// ============================================================================
// Types
// ============================================================================

export type NetworkMode = 'testnet' | 'mainnet';

export interface NetworkConfig {
  chainId: number;
  chainName: string;
  rpcUrl: string;
  explorerUrl: string;
  explorerApiUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface ContractAddresses {
  paymentRegistry: string;
  bnbPayRouter: string;
  subscriptionManager: string;
  sessionStore: string;
  // Token addresses
  tokens: {
    BNB: string; // Native, use zero address
    USDT: string;
    USDC: string;
    USD1: string;
    WUSD: string;
    XUSD: string;
  };
}

export interface ApiConfig {
  baseUrl: string;
  wsUrl: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

export interface AppConfig {
  networkMode: NetworkMode;
  network: NetworkConfig;
  contracts: ContractAddresses;
  api: ApiConfig;
  features: {
    mainnetEnabled: boolean;
    gaslessPayments: boolean;
    multiTokenSettlement: boolean;
    sseUpdates: boolean;
    debugMode: boolean;
  };
}

// ============================================================================
// Environment Variable Helpers
// ============================================================================

function getEnvVar(key: string, defaultValue?: string): string {
  const value = import.meta.env[key] || defaultValue;
  if (value === undefined) {
    console.warn(`Environment variable ${key} is not set`);
    return '';
  }
  return value;
}

function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  return value === 'true' || value === '1';
}

function getEnvNumber(key: string, defaultValue: number): number {
  const value = import.meta.env[key];
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

// ============================================================================
// Network Configurations
// ============================================================================

const TESTNET_CONFIG: NetworkConfig = {
  chainId: 97,
  chainName: 'BNB Smart Chain Testnet',
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
  explorerUrl: 'https://testnet.bscscan.com',
  explorerApiUrl: 'https://api-testnet.bscscan.com/api',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'tBNB',
    decimals: 18,
  },
};

const MAINNET_CONFIG: NetworkConfig = {
  chainId: 56,
  chainName: 'BNB Smart Chain',
  rpcUrl: 'https://bsc-dataseed1.binance.org',
  explorerUrl: 'https://bscscan.com',
  explorerApiUrl: 'https://api.bscscan.com/api',
  nativeCurrency: {
    name: 'BNB',
    symbol: 'BNB',
    decimals: 18,
  },
};

// ============================================================================
// Contract Addresses
// ============================================================================

// Zero address for native BNB
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const TESTNET_CONTRACTS: ContractAddresses = {
  paymentRegistry: getEnvVar('VITE_TESTNET_PAYMENT_REGISTRY', '0x...'), // TODO: Add actual testnet address
  bnbPayRouter: getEnvVar('VITE_TESTNET_BNBPAY_ROUTER', '0x...'),
  subscriptionManager: getEnvVar('VITE_TESTNET_SUBSCRIPTION_MANAGER', '0x...'),
  sessionStore: getEnvVar('VITE_TESTNET_SESSION_STORE', '0x...'),
  tokens: {
    BNB: ZERO_ADDRESS,
    USDT: getEnvVar('VITE_TESTNET_TOKEN_USDT', '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'),
    USDC: getEnvVar('VITE_TESTNET_TOKEN_USDC', '0x64544969ed7EBf5f083679233325356EbE738930'),
    USD1: getEnvVar('VITE_TESTNET_TOKEN_USD1', '0x...'),
    WUSD: getEnvVar('VITE_TESTNET_TOKEN_WUSD', '0x...'),
    XUSD: getEnvVar('VITE_TESTNET_TOKEN_XUSD', '0x...'),
  },
};

const MAINNET_CONTRACTS: ContractAddresses = {
  paymentRegistry: getEnvVar('VITE_MAINNET_PAYMENT_REGISTRY', ''),
  bnbPayRouter: getEnvVar('VITE_MAINNET_BNBPAY_ROUTER', ''),
  subscriptionManager: getEnvVar('VITE_MAINNET_SUBSCRIPTION_MANAGER', ''),
  sessionStore: getEnvVar('VITE_MAINNET_SESSION_STORE', ''),
  tokens: {
    BNB: ZERO_ADDRESS,
    USDT: getEnvVar('VITE_MAINNET_TOKEN_USDT', '0x55d398326f99059fF775485246999027B3197955'),
    USDC: getEnvVar('VITE_MAINNET_TOKEN_USDC', '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d'),
    USD1: getEnvVar('VITE_MAINNET_TOKEN_USD1', ''),
    WUSD: getEnvVar('VITE_MAINNET_TOKEN_WUSD', ''),
    XUSD: getEnvVar('VITE_MAINNET_TOKEN_XUSD', ''),
  },
};

// ============================================================================
// API Configuration
// ============================================================================

const TESTNET_API: ApiConfig = {
  baseUrl: getEnvVar('VITE_API_URL_TESTNET', 'https://api.bnbpay.org'),
  wsUrl: getEnvVar('VITE_WS_URL_TESTNET', 'wss://api.bnbpay.org'),
  timeout: getEnvNumber('VITE_API_TIMEOUT', 30000),
  retryAttempts: getEnvNumber('VITE_API_RETRY_ATTEMPTS', 3),
  retryDelay: getEnvNumber('VITE_API_RETRY_DELAY', 1000),
};

const MAINNET_API: ApiConfig = {
  baseUrl: getEnvVar('VITE_API_URL_MAINNET', 'https://api.bnbpay.org'),
  wsUrl: getEnvVar('VITE_WS_URL_MAINNET', 'wss://api.bnbpay.org'),
  timeout: getEnvNumber('VITE_API_TIMEOUT', 30000),
  retryAttempts: getEnvNumber('VITE_API_RETRY_ATTEMPTS', 3),
  retryDelay: getEnvNumber('VITE_API_RETRY_DELAY', 1000),
};

// ============================================================================
// Build Configuration
// ============================================================================

function buildConfig(): AppConfig {
  const networkMode: NetworkMode = getEnvVar('VITE_NETWORK_MODE', 'testnet') as NetworkMode;
  const isMainnet = networkMode === 'mainnet';

  // Safety check: mainnet must be explicitly enabled
  const mainnetEnabled = getEnvBool('VITE_MAINNET_ENABLED', false);
  if (isMainnet && !mainnetEnabled) {
    console.error('CRITICAL: Mainnet mode requested but VITE_MAINNET_ENABLED is not true');
    console.error('Falling back to testnet for safety');
    return buildConfig(); // Recursive call will use testnet
  }

  return {
    networkMode,
    network: isMainnet ? MAINNET_CONFIG : TESTNET_CONFIG,
    contracts: isMainnet ? MAINNET_CONTRACTS : TESTNET_CONTRACTS,
    api: isMainnet ? MAINNET_API : TESTNET_API,
    features: {
      mainnetEnabled,
      gaslessPayments: getEnvBool('VITE_FEATURE_GASLESS', true),
      multiTokenSettlement: getEnvBool('VITE_FEATURE_MULTI_TOKEN', true),
      sseUpdates: getEnvBool('VITE_FEATURE_SSE', true),
      debugMode: getEnvBool('VITE_DEBUG_MODE', import.meta.env.DEV),
    },
  };
}

// ============================================================================
// Exported Configuration
// ============================================================================

export const config: AppConfig = buildConfig();

// Convenience exports
export const isMainnet = config.networkMode === 'mainnet';
export const isTestnet = config.networkMode === 'testnet';
export const chainId = config.network.chainId;
export const explorerUrl = config.network.explorerUrl;

// ============================================================================
// Validation & Debugging
// ============================================================================

/**
 * Validates the current configuration
 * Call this on app startup to catch misconfigurations early
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check network config
  if (!config.network.rpcUrl) {
    errors.push('Missing RPC URL');
  }

  // Check contract addresses for mainnet
  if (isMainnet) {
    if (!config.contracts.paymentRegistry || config.contracts.paymentRegistry.startsWith('0x...')) {
      errors.push('Missing or placeholder PaymentRegistry address for mainnet');
    }
    if (!config.contracts.bnbPayRouter || config.contracts.bnbPayRouter.startsWith('0x...')) {
      errors.push('Missing or placeholder BNBPayRouter address for mainnet');
    }
  }

  // Check API config
  if (!config.api.baseUrl) {
    errors.push('Missing API base URL');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Logs the current configuration (safe for production - no secrets)
 */
export function logConfig(): void {
  console.group('BNBPay Configuration');
  console.log('Network Mode:', config.networkMode);
  console.log('Chain ID:', config.network.chainId);
  console.log('Chain Name:', config.network.chainName);
  console.log('API Base URL:', config.api.baseUrl);
  console.log('Features:', config.features);
  console.groupEnd();
}

/**
 * Get transaction URL for explorer
 */
export function getTxUrl(txHash: string): string {
  return `${config.network.explorerUrl}/tx/${txHash}`;
}

/**
 * Get address URL for explorer
 */
export function getAddressUrl(address: string): string {
  return `${config.network.explorerUrl}/address/${address}`;
}

/**
 * Get token URL for explorer
 */
export function getTokenUrl(tokenAddress: string): string {
  return `${config.network.explorerUrl}/token/${tokenAddress}`;
}

export default config;
