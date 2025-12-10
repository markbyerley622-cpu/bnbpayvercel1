/**
 * Price Utils Unit Tests
 */

import { describe, it, expect } from 'vitest';
import {
  convertToUSD,
  convertFromUSD,
  getPaymentOptions,
  getTokensForNetwork,
  getTokenImagePath,
  formatAmount,
  TOKEN_PRICES,
  getTokenPrice,
  type Token,
} from './price-utils';

describe('Price Utils', () => {
  describe('TOKEN_PRICES', () => {
    it('should have prices for all supported tokens', () => {
      expect(TOKEN_PRICES.BNB).toBeDefined();
      expect(TOKEN_PRICES.USDT).toBeDefined();
      expect(TOKEN_PRICES.USDC).toBeDefined();
      expect(TOKEN_PRICES.USD1).toBeDefined();
      expect(TOKEN_PRICES.WUSD).toBeDefined();
      expect(TOKEN_PRICES.XUSD).toBeDefined();
    });

    it('should have stablecoins at $1', () => {
      expect(TOKEN_PRICES.USDT).toBe(1);
      expect(TOKEN_PRICES.USDC).toBe(1);
      expect(TOKEN_PRICES.USD1).toBe(1);
      expect(TOKEN_PRICES.WUSD).toBe(1);
      expect(TOKEN_PRICES.XUSD).toBe(1);
    });

    it('should have BNB at realistic price', () => {
      expect(TOKEN_PRICES.BNB).toBeGreaterThan(100);
    });
  });

  describe('getTokenPrice', () => {
    it('should return price for BNB', () => {
      expect(getTokenPrice('BNB')).toBe(TOKEN_PRICES.BNB);
    });

    it('should return price for stablecoins', () => {
      expect(getTokenPrice('USDT')).toBe(1);
      expect(getTokenPrice('USDC')).toBe(1);
      expect(getTokenPrice('USD1')).toBe(1);
    });
  });

  describe('convertToUSD', () => {
    it('should convert BNB to USD correctly', () => {
      const usdValue = convertToUSD('BNB', 1);
      expect(usdValue).toBe(TOKEN_PRICES.BNB);
    });

    it('should handle stablecoins 1:1', () => {
      expect(convertToUSD('USDT', 100)).toBe(100);
      expect(convertToUSD('USDC', 50.5)).toBe(50.5);
      expect(convertToUSD('USD1', 1000)).toBe(1000);
    });

    it('should handle decimal amounts', () => {
      const usdValue = convertToUSD('BNB', 0.5);
      expect(usdValue).toBe(TOKEN_PRICES.BNB * 0.5);
    });

    it('should handle zero amount', () => {
      expect(convertToUSD('BNB', 0)).toBe(0);
      expect(convertToUSD('USDT', 0)).toBe(0);
    });

    it('should handle string amounts', () => {
      expect(convertToUSD('USDT', '100')).toBe(100);
      expect(convertToUSD('BNB', '0.5')).toBe(TOKEN_PRICES.BNB * 0.5);
    });
  });

  describe('convertFromUSD', () => {
    it('should convert USD to BNB correctly', () => {
      const bnbAmount = convertFromUSD('BNB', TOKEN_PRICES.BNB);
      expect(bnbAmount).toBeCloseTo(1, 6);
    });

    it('should handle stablecoins 1:1', () => {
      expect(convertFromUSD('USDT', 100)).toBe(100);
      expect(convertFromUSD('USDC', 50)).toBe(50);
    });

    it('should handle decimal conversions', () => {
      const amount = convertFromUSD('BNB', 100);
      expect(amount).toBeCloseTo(100 / TOKEN_PRICES.BNB, 6);
    });

    it('should handle zero USD', () => {
      expect(convertFromUSD('BNB', 0)).toBe(0);
      expect(convertFromUSD('USDT', 0)).toBe(0);
    });

    it('should handle string amounts', () => {
      expect(convertFromUSD('USDT', '100')).toBe(100);
    });
  });

  describe('getPaymentOptions', () => {
    it('should return payment options for all supported tokens', () => {
      const options = getPaymentOptions(100, 'testnet');

      expect(options).toBeInstanceOf(Array);
      expect(options.length).toBe(6); // All 6 tokens
    });

    it('should include token symbol and amount for each option', () => {
      const options = getPaymentOptions(100, 'testnet');

      options.forEach(option => {
        expect(option.token).toBeDefined();
        expect(option.tokenAmount).toBeDefined();
        expect(option.usdValue).toBeDefined();
        expect(typeof option.tokenAmount).toBe('string');
      });
    });

    it('should show $100 as 100 USDT', () => {
      const options = getPaymentOptions(100, 'testnet');
      const usdtOption = options.find(o => o.token === 'USDT');

      expect(usdtOption).toBeDefined();
      expect(parseFloat(usdtOption!.tokenAmount)).toBeCloseTo(100, 2);
    });

    it('should calculate correct BNB amount for USD', () => {
      const options = getPaymentOptions(TOKEN_PRICES.BNB, 'testnet');
      const bnbOption = options.find(o => o.token === 'BNB');

      expect(bnbOption).toBeDefined();
      expect(parseFloat(bnbOption!.tokenAmount)).toBeCloseTo(1, 4);
    });

    it('should handle different networks', () => {
      const testnetOptions = getPaymentOptions(100, 'testnet');
      const mainnetOptions = getPaymentOptions(100, 'mainnet');

      // Both should have options
      expect(testnetOptions.length).toBe(6);
      expect(mainnetOptions.length).toBe(6);
    });

    it('should handle string USD amount', () => {
      const options = getPaymentOptions('100', 'testnet');
      expect(options.length).toBe(6);
    });
  });

  describe('getTokensForNetwork', () => {
    it('should return tokens for testnet', () => {
      const tokens = getTokensForNetwork('testnet');

      expect(tokens).toContain('BNB');
      expect(tokens).toContain('USDT');
      expect(tokens.length).toBe(6);
    });

    it('should return tokens for mainnet', () => {
      const tokens = getTokensForNetwork('mainnet');

      expect(tokens).toContain('BNB');
      expect(tokens).toContain('USDT');
      expect(tokens.length).toBe(6);
    });

    it('should return all 6 tokens', () => {
      const tokens = getTokensForNetwork('testnet');

      expect(tokens).toEqual(['BNB', 'USDT', 'USDC', 'USD1', 'WUSD', 'XUSD']);
    });
  });

  describe('getTokenImagePath', () => {
    it('should return correct path for BNB', () => {
      const path = getTokenImagePath('BNB');
      expect(path).toBe('/bnblogo.png');
    });

    it('should return correct path for USD1', () => {
      const path = getTokenImagePath('USD1');
      expect(path).toBe('/USD1.png');
    });

    it('should return correct path for WUSD', () => {
      const path = getTokenImagePath('WUSD');
      expect(path).toBe('/wusd.png');
    });

    it('should return correct path for XUSD', () => {
      const path = getTokenImagePath('XUSD');
      expect(path).toBe('/xusd-removebg-preview.png');
    });

    it('should return lowercase path for USDT/USDC', () => {
      expect(getTokenImagePath('USDT')).toBe('/usdt.png');
      expect(getTokenImagePath('USDC')).toBe('/usdc.png');
    });
  });

  describe('formatAmount', () => {
    it('should format with default decimal places', () => {
      const formatted = formatAmount(1.123456789);
      expect(formatted).toBe('1.123457'); // 6 decimals, rounded
    });

    it('should format with custom decimal places', () => {
      const formatted = formatAmount(100.456789, 2);
      expect(formatted).toBe('100.46');
    });

    it('should remove trailing zeros', () => {
      expect(formatAmount(100.00, 2)).toBe('100');
      expect(formatAmount(100.50, 2)).toBe('100.5');
    });

    it('should handle large numbers', () => {
      const formatted = formatAmount(1000000.12345, 2);
      expect(formatted).toBe('1000000.12');
    });

    it('should handle very small numbers', () => {
      const formatted = formatAmount(0.000123, 6);
      expect(parseFloat(formatted)).toBeCloseTo(0.000123, 6);
    });

    it('should handle zero', () => {
      expect(formatAmount(0, 2)).toBe('0');
    });
  });
});
