/**
 * Price Conversion Utilities
 *
 * Mock prices for testnet - will be replaced with real oracle in Phase 2
 *
 * Token symbols are the same for mainnet and testnet (BNB, USDT, USDC, USD1)
 * The network parameter determines which chain to use.
 */

import type { NetworkType } from './web3';

// Token prices (USD per token) - same for mainnet and testnet
export const TOKEN_PRICES = {
  BNB: 600,    // $600 per BNB
  USDT: 1,     // $1 per USDT
  USDC: 1,     // $1 per USDC
  USD1: 1,     // $1 per USD1
  WUSD: 1,     // $1 per WUSD
} as const;

// Legacy exports for backward compatibility
export const MAINNET_PRICES = TOKEN_PRICES;
export const TESTNET_PRICES = TOKEN_PRICES;

// Single token type - same symbols for both networks
export type Token = 'BNB' | 'USDT' | 'USDC' | 'USD1' | 'WUSD';
export type MainnetToken = Token;
export type TestnetToken = Token;

/**
 * Get tokens for network
 * Matches the API token list: BNB, USDT, USDC, USD1, WUSD
 * Same symbols for both mainnet and testnet
 */
export function getTokensForNetwork(_network: NetworkType): Token[] {
  // Same tokens for both mainnet and testnet - network determines chain
  return ['BNB', 'USDT', 'USDC', 'USD1', 'WUSD'];
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
 * @param token Token symbol (BNB, USDT, USDC, USD1)
 * @param amount Amount in token units
 * @returns USD value
 */
export function convertToUSD(token: Token, amount: string | number): number {
  const tokenAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  const price = getTokenPrice(token);
  return tokenAmount * price;
}

/**
 * Convert USD amount to token amount
 * @param token Token symbol (BNB, USDT, USDC, USD1)
 * @param usdAmount USD amount
 * @returns Token amount
 */
export function convertFromUSD(token: Token, usdAmount: string | number): number {
  const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const price = getTokenPrice(token);
  return usd / price;
}

/**
 * Format number to fixed decimal places
 */
export function formatAmount(amount: number, decimals: number = 6): string {
  return amount.toFixed(decimals).replace(/\.?0+$/, '');
}

/**
 * Get payment options for all supported tokens given a USD amount
 */
export function getPaymentOptions(usdAmount: string | number, network: NetworkType = 'testnet'): Array<{
  token: Token;
  tokenAmount: string;
  usdValue: string;
}> {
  const usd = typeof usdAmount === 'string' ? parseFloat(usdAmount) : usdAmount;
  const tokens = getTokensForNetwork(network);

  return tokens.map(token => ({
    token,
    tokenAmount: formatAmount(
      convertFromUSD(token, usd),
      (token.includes('USD') || token.includes('USC')) ? 2 : 6 // Stablecoins use 2 decimals, BNB uses 6
    ),
    usdValue: usd.toFixed(2),
  }));
}

/**
 * Get the correct image path for a token
 * BNB uses bnblogo.png, USD1 uses USD1.png, WUSD uses wusd.png, others use lowercase names
 */
export function getTokenImagePath(token: Token | string): string {
  if (token === 'BNB') return '/bnblogo.png';
  if (token === 'USD1') return '/USD1.png';
  if (token === 'WUSD') return '/wusd.png';
  return `/${token.toLowerCase()}.png`;
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
