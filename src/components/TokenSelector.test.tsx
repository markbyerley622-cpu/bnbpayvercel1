/**
 * TokenSelector Component Tests
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TokenSelector } from './TokenSelector';
import type { Token } from '../lib/price-utils';

// Mock the price-utils module
vi.mock('../lib/price-utils', () => ({
  getTokensForNetwork: () => ['BNB', 'USDT', 'USDC', 'USD1', 'WUSD', 'XUSD'] as Token[],
  getTokenImagePath: (token: string) => `/tokens/${token.toLowerCase()}.png`,
}));

describe('TokenSelector', () => {
  const defaultProps = {
    selectedTokens: ['USDT'] as Token[],
    onTokensChange: vi.fn(),
    network: 'testnet' as const,
  };

  describe('Single Select Mode', () => {
    it('should render all tokens', () => {
      render(<TokenSelector {...defaultProps} multiSelect={false} />);

      expect(screen.getByText('BNB')).toBeInTheDocument();
      expect(screen.getByText('USDT')).toBeInTheDocument();
      expect(screen.getByText('USDC')).toBeInTheDocument();
    });

    it('should highlight selected token', () => {
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT']}
          multiSelect={false}
        />
      );

      const usdtCard = screen.getByText('USDT').closest('button');
      expect(usdtCard).toHaveClass('border-bnb-yellow');
    });

    it('should call onTokensChange when token clicked', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          onTokensChange={onTokensChange}
          multiSelect={false}
        />
      );

      const usdcButton = screen.getByText('USDC').closest('button');
      fireEvent.click(usdcButton!);

      expect(onTokensChange).toHaveBeenCalledWith(['USDC']);
    });
  });

  describe('Multi Select Mode', () => {
    it('should allow multiple stablecoin selection', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT']}
          onTokensChange={onTokensChange}
          multiSelect={true}
        />
      );

      const usdcButton = screen.getByText('USDC').closest('button');
      fireEvent.click(usdcButton!);

      // Should add USDC to existing selection
      expect(onTokensChange).toHaveBeenCalledWith(expect.arrayContaining(['USDT', 'USDC']));
    });

    it('should make BNB exclusive - selecting BNB deselects others', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT', 'USDC']}
          onTokensChange={onTokensChange}
          multiSelect={true}
        />
      );

      const bnbButton = screen.getByText('BNB').closest('button');
      fireEvent.click(bnbButton!);

      // BNB is exclusive, should be only selection
      expect(onTokensChange).toHaveBeenCalledWith(['BNB']);
    });

    it('should deselect BNB when stablecoin selected', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['BNB']}
          onTokensChange={onTokensChange}
          multiSelect={true}
        />
      );

      const usdtButton = screen.getByText('USDT').closest('button');
      fireEvent.click(usdtButton!);

      // USDT should replace BNB
      expect(onTokensChange).toHaveBeenCalledWith(['USDT']);
    });

    it('should allow deselecting a token', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT', 'USDC']}
          onTokensChange={onTokensChange}
          multiSelect={true}
        />
      );

      const usdtButton = screen.getByText('USDT').closest('button');
      fireEvent.click(usdtButton!);

      // Should remove USDT from selection
      expect(onTokensChange).toHaveBeenCalledWith(['USDC']);
    });

    it('should not allow empty selection', () => {
      const onTokensChange = vi.fn();
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT']}
          onTokensChange={onTokensChange}
          multiSelect={true}
        />
      );

      const usdtButton = screen.getByText('USDT').closest('button');
      fireEvent.click(usdtButton!);

      // Should not call onTokensChange with empty array
      // or should keep last token selected
      const calls = onTokensChange.mock.calls;
      if (calls.length > 0) {
        expect(calls[0][0].length).toBeGreaterThan(0);
      }
    });
  });

  describe('Blur Effect', () => {
    it('should show blur effect when BNB selected', () => {
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['BNB']}
          showBlurEffect={true}
          multiSelect={true}
        />
      );

      // Stablecoins should have blur/opacity when BNB is selected
      const usdtCard = screen.getByText('USDT').closest('button');
      expect(usdtCard).toHaveClass('opacity-50');
    });

    it('should not show blur when disabled', () => {
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['BNB']}
          showBlurEffect={false}
          multiSelect={true}
        />
      );

      const usdtCard = screen.getByText('USDT').closest('button');
      expect(usdtCard).not.toHaveClass('opacity-50');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button elements', () => {
      render(<TokenSelector {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(6); // All 6 tokens
    });

    it('should show selection state visually', () => {
      render(
        <TokenSelector
          {...defaultProps}
          selectedTokens={['USDT', 'USDC']}
          multiSelect={true}
        />
      );

      const usdtCard = screen.getByText('USDT').closest('button');
      const usdcCard = screen.getByText('USDC').closest('button');
      const bnbCard = screen.getByText('BNB').closest('button');

      expect(usdtCard).toHaveClass('border-bnb-yellow');
      expect(usdcCard).toHaveClass('border-bnb-yellow');
      expect(bnbCard).not.toHaveClass('border-bnb-yellow');
    });
  });
});
