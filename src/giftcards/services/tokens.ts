/**
 * Token utilities for Gift Cards
 */

import type { Token, TokenInfo, NetworkType } from '../types';

// Available tokens per network
export const TOKENS: Record<NetworkType, TokenInfo[]> = {
  mainnet: [
    { symbol: 'BNB', name: 'BNB', decimals: 18, icon: '/bnblogo.png' },
    { symbol: 'USDT', name: 'Tether USD', decimals: 18, icon: '/usdt.png' },
    { symbol: 'USDC', name: 'USD Coin', decimals: 18, icon: '/usdc.png' },
    { symbol: 'USD1', name: 'USD1 Stablecoin', decimals: 6, icon: '/USD1.png' },
    { symbol: 'WUSD', name: 'Wrapped USD', decimals: 18, icon: '/wusd.png' },
    { symbol: 'XUSD', name: 'XUSD Stablecoin', decimals: 18, icon: '/xusd-removebg-preview.png' },
    { symbol: 'BUSD', name: 'Binance USD', decimals: 18, icon: '/busd.png' },
  ],
  testnet: [
    { symbol: 'BNB', name: 'Test BNB', decimals: 18, icon: '/bnblogo.png' },
    { symbol: 'USDT', name: 'Test USDT', decimals: 18, icon: '/usdt.png' },
    { symbol: 'USDC', name: 'Test USDC', decimals: 18, icon: '/usdc.png' },
    { symbol: 'USD1', name: 'USD1 (Permit2)', decimals: 6, icon: '/USD1.png' },
    { symbol: 'WUSD', name: 'WUSD (EIP-2612)', decimals: 18, icon: '/wusd.png' },
    { symbol: 'XUSD', name: 'XUSD (EIP-3009)', decimals: 18, icon: '/xusd-removebg-preview.png' },
  ],
};

// Get tokens for network
export function getTokensForNetwork(network: NetworkType): Token[] {
  return TOKENS[network].map(t => t.symbol);
}

// Get token info
export function getTokenInfo(token: Token, network: NetworkType): TokenInfo | undefined {
  return TOKENS[network].find(t => t.symbol === token);
}

// Get token image path
export function getTokenImagePath(token: Token): string {
  switch (token) {
    case 'BNB': return '/bnblogo.png';
    case 'USDT': return '/usdt.png';
    case 'USDC': return '/usdc.png';
    case 'USD1': return '/USD1.png';
    case 'WUSD': return '/wusd.png';
    case 'XUSD': return '/xusd-removebg-preview.png';
    case 'BUSD': return '/busd.png';
    default: return '/bnblogo.png';
  }
}

// Format token amount for display
export function formatTokenAmount(amount: string, _decimals: number = 18): string {
  void _decimals; // Available for future precision formatting
  try {
    const value = parseFloat(amount);
    if (isNaN(value)) return '0';

    // Format with appropriate decimal places
    if (value >= 1000) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
    } else if (value >= 1) {
      return value.toLocaleString('en-US', { maximumFractionDigits: 4 });
    } else {
      return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
    }
  } catch {
    return amount;
  }
}

// Parse token amount to wei
export function parseTokenAmount(amount: string, decimals: number = 18): bigint {
  try {
    const [integerPart, fractionalPart = ''] = amount.split('.');
    const paddedFractional = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
    return BigInt(integerPart + paddedFractional);
  } catch {
    return BigInt(0);
  }
}

// Format wei to token amount
export function formatFromWei(wei: string | bigint, decimals: number = 18): string {
  try {
    const value = typeof wei === 'string' ? BigInt(wei) : wei;
    const divisor = BigInt(10 ** decimals);
    const integerPart = value / divisor;
    const fractionalPart = value % divisor;

    if (fractionalPart === 0n) {
      return integerPart.toString();
    }

    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    const trimmedFractional = fractionalStr.replace(/0+$/, '');
    return `${integerPart}.${trimmedFractional}`;
  } catch {
    return '0';
  }
}
