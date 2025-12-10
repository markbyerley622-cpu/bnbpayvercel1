/**
 * Price Conversion Utilities
 *
 * Mock prices for testnet - will be replaced with real oracle in Phase 2
 *
 * Token symbols are the same for mainnet and testnet (BNB, USDT, USDC, USD1)
 * The network parameter determines which chain to use.
 */

import type { NetworkType } from './web3';
import { safeParseFloat, safeFormatNumber, safeDivide, safeMultiply } from './safe-numbers';

// Token prices (USD per token) - same for mainnet and testnet
export const TOKEN_PRICES = {
  BNB: 600,    // $600 per BNB
  USDT: 1,     // $1 per USDT
  USDC: 1,     // $1 per USDC
  USD1: 1,     // $1 per USD1
  WUSD: 1,     // $1 per WUSD
  XUSD: 1,     // $1 per XUSD (EIP-3009 compatible)
} as const;

// Legacy exports for backward compatibility
export const MAINNET_PRICES = TOKEN_PRICES;
export const TESTNET_PRICES = TOKEN_PRICES;

// Single token type - same symbols for both networks
export type Token = 'BNB' | 'USDT' | 'USDC' | 'USD1' | 'WUSD' | 'XUSD';
export type MainnetToken = Token;
export type TestnetToken = Token;

/**
 * Get tokens for network
 * Matches the API token list: BNB, USDT, USDC, USD1, WUSD, XUSD
 * Same symbols for both mainnet and testnet
 */
export function getTokensForNetwork(_network: NetworkType): Token[] {
  // Same tokens for both mainnet and testnet - network determines chain
  return ['BNB', 'USDT', 'USDC', 'USD1', 'WUSD', 'XUSD'];
}

/**
 * Get mock price for a token
 */
export function getTokenPrice(token: Token, _network?: NetworkType): number {
  // Same prices for mainnet and testnet
  return TOKEN_PRICES[token];
}

/**
 * Convert token amount to USD value
 * Uses safe number utilities to prevent NaN
 * @param token Token symbol (BNB, USDT, USDC, USD1)
 * @param amount Amount in token units
 * @returns USD value (never NaN)
 */
export function convertToUSD(token: Token, amount: string | number): number {
  const tokenAmount = safeParseFloat(amount, 0);
  const price = getTokenPrice(token);
  return safeMultiply(tokenAmount, price);
}

/**
 * Convert USD amount to token amount
 * Uses safe number utilities to prevent NaN
 * @param token Token symbol (BNB, USDT, USDC, USD1)
 * @param usdAmount USD amount
 * @returns Token amount (never NaN)
 */
export function convertFromUSD(token: Token, usdAmount: string | number): number {
  const usd = safeParseFloat(usdAmount, 0);
  const price = getTokenPrice(token);
  return safeDivide(usd, price, 0);
}

/**
 * Format number to fixed decimal places
 * Uses safe formatting to prevent NaN
 */
export function formatAmount(amount: number | string | unknown, decimals: number = 6): string {
  const num = safeParseFloat(amount, 0);
  const formatted = safeFormatNumber(num, decimals, '0');
  // Remove trailing zeros for cleaner display
  return formatted.replace(/\.?0+$/, '') || '0';
}

/**
 * Get payment options for all supported tokens given a USD amount
 * Uses safe number utilities to prevent NaN
 */
export function getPaymentOptions(usdAmount: string | number, network: NetworkType = 'testnet'): Array<{
  token: Token;
  tokenAmount: string;
  usdValue: string;
}> {
  const usd = safeParseFloat(usdAmount, 0);
  const tokens = getTokensForNetwork(network);

  return tokens.map(token => ({
    token,
    tokenAmount: formatAmount(
      convertFromUSD(token, usd),
      (token.includes('USD') || token.includes('USC')) ? 2 : 6 // Stablecoins use 2 decimals, BNB uses 6
    ),
    usdValue: safeFormatNumber(usd, 2, '0.00'),
  }));
}

/**
 * Token image configuration
 * Primary paths for local assets, with CDN fallbacks
 */
const TOKEN_IMAGES: Record<string, { primary: string; fallback: string }> = {
  BNB: {
    primary: '/bnblogo.png',
    fallback: 'https://assets.coingecko.com/coins/images/825/small/bnb-icon2_2x.png',
  },
  USD1: {
    primary: '/USD1.png',
    fallback: 'https://assets.coingecko.com/coins/images/39256/small/Usual_USD_Logo.png',
  },
  USDT: {
    primary: '/usdt.png',
    fallback: 'https://assets.coingecko.com/coins/images/325/small/Tether.png',
  },
  USDC: {
    primary: '/usdc.png',
    fallback: 'https://assets.coingecko.com/coins/images/6319/small/usdc.png',
  },
  WUSD: {
    primary: '/wusd.png',
    fallback: 'https://assets.coingecko.com/coins/images/325/small/Tether.png', // Use USDT as fallback
  },
  XUSD: {
    primary: '/xusd-removebg-preview.png',
    fallback: 'https://assets.coingecko.com/coins/images/325/small/Tether.png', // Use USDT as fallback
  },
};

// Default fallback SVG (inline data URI for guaranteed availability)
const DEFAULT_TOKEN_SVG = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='18' fill='%23F0B90B' stroke='%23000' stroke-width='2'/%3E%3Ctext x='20' y='26' text-anchor='middle' fill='%23000' font-size='14' font-weight='bold'%3E%24%3C/text%3E%3C/svg%3E`;

/**
 * Get the correct image path for a token
 * BNB uses bnblogo.png, USD1 uses USD1.png, WUSD uses wusd.png, XUSD uses xusd-removebg-preview.png
 */
export function getTokenImagePath(token: Token | string): string {
  const upperToken = token.toUpperCase();
  const config = TOKEN_IMAGES[upperToken];
  if (config) {
    return config.primary;
  }
  // Default: try lowercase version
  return `/${token.toLowerCase()}.png`;
}

/**
 * Get fallback image URL for a token
 * Use this when the primary image fails to load
 */
export function getTokenImageFallback(token: Token | string): string {
  const upperToken = token.toUpperCase();
  const config = TOKEN_IMAGES[upperToken];
  if (config) {
    return config.fallback;
  }
  return DEFAULT_TOKEN_SVG;
}

/**
 * Get the default fallback SVG for any token
 */
export function getDefaultTokenImage(): string {
  return DEFAULT_TOKEN_SVG;
}

/**
 * Preload token images for better UX
 * Call this early in app initialization
 */
export function preloadTokenImages(network: NetworkType = 'testnet'): void {
  const tokens = getTokensForNetwork(network);
  tokens.forEach(token => {
    const img = new Image();
    const config = TOKEN_IMAGES[token];
    if (config) {
      img.src = config.primary;
      // Also preload fallback
      const fallbackImg = new Image();
      fallbackImg.src = config.fallback;
    }
  });
}

// Cache for tracking which images have failed
const failedImages = new Set<string>();

/**
 * Check if an image has previously failed to load
 */
export function hasImageFailed(src: string): boolean {
  return failedImages.has(src);
}

/**
 * Mark an image as failed
 */
export function markImageFailed(src: string): void {
  failedImages.add(src);
}

/**
 * Get the best available image for a token
 * Returns fallback if primary has previously failed
 */
export function getBestTokenImage(token: Token | string): string {
  const primary = getTokenImagePath(token);
  if (hasImageFailed(primary)) {
    const fallback = getTokenImageFallback(token);
    if (hasImageFailed(fallback)) {
      return DEFAULT_TOKEN_SVG;
    }
    return fallback;
  }
  return primary;
}

/**
 * Get display name for token
 */
export function getTokenDisplayName(token: Token | string): string {
  return token;
}

/**
 * Check if token is testnet token
 * Note: With unified token symbols, this always returns false
 * Use the network parameter to determine testnet vs mainnet
 */
export function isTestnetToken(_token: Token): boolean {
  return false; // Tokens don't have T prefix anymore
}
