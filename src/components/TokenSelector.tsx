/**
 * Token Selector Component
 *
 * A visual token selection UI with 6 token cards.
 * - BNB (native) is exclusive: selecting BNB deselects all others
 * - Stablecoins can be multi-selected: USDT, USDC, USD1, WUSD, XUSD
 * - If BNB is selected, all stablecoins are blurred
 * - If any stablecoin is selected, BNB is blurred but available
 */

import { useState } from 'react';
import { getTokenImagePath, getTokensForNetwork, type Token } from '../lib/price-utils';

// Props for single-select mode (legacy)
interface TokenSelectorSingleProps {
  selectedToken: Token;
  onTokenSelect: (token: Token) => void;
  network: 'mainnet' | 'testnet';
  disabled?: boolean;
  showBlurEffect?: boolean;
  className?: string;
  multiSelect?: false;
}

// Props for multi-select mode
interface TokenSelectorMultiProps {
  selectedTokens: Token[];
  onTokensChange: (tokens: Token[]) => void;
  network: 'mainnet' | 'testnet';
  disabled?: boolean;
  showBlurEffect?: boolean;
  className?: string;
  multiSelect: true;
}

type TokenSelectorProps = TokenSelectorSingleProps | TokenSelectorMultiProps;

// Token metadata for display
const TOKEN_INFO: Record<string, { name: string; description: string }> = {
  BNB: { name: 'BNB', description: 'Native' },
  USDT: { name: 'USDT', description: 'Tether' },
  USDC: { name: 'USDC', description: 'Circle' },
  USD1: { name: 'USD1', description: 'Stable' },
  WUSD: { name: 'WUSD', description: 'Wrapped' },
  XUSD: { name: 'XUSD', description: 'X-USD' },
};

export function TokenSelector(props: TokenSelectorProps) {
  const {
    network,
    disabled = false,
    showBlurEffect = true,
    className = '',
  } = props;

  const availableTokens = getTokensForNetwork(network);
  const [hoveredToken, setHoveredToken] = useState<Token | null>(null);

  // Determine if multi-select mode
  const isMultiSelect = 'multiSelect' in props && props.multiSelect === true;

  // Get selected tokens array (works for both modes)
  const selectedTokens: Token[] = isMultiSelect
    ? (props as TokenSelectorMultiProps).selectedTokens
    : [(props as TokenSelectorSingleProps).selectedToken];

  // Check if BNB is selected
  const isBnbSelected = selectedTokens.includes('BNB');

  // Handle token click
  const handleTokenClick = (token: Token) => {
    if (disabled) return;

    if (isMultiSelect) {
      const multiProps = props as TokenSelectorMultiProps;

      if (token === 'BNB') {
        // BNB is exclusive - selecting it deselects everything else
        if (isBnbSelected) {
          // If BNB already selected, deselect it (allow empty selection or keep at least one)
          multiProps.onTokensChange([]);
        } else {
          // Select only BNB
          multiProps.onTokensChange(['BNB']);
        }
      } else {
        // Stablecoin clicked
        const currentTokens = selectedTokens.filter(t => t !== 'BNB'); // Remove BNB if present

        if (currentTokens.includes(token)) {
          // Deselect this stablecoin
          const newTokens = currentTokens.filter(t => t !== token);
          multiProps.onTokensChange(newTokens);
        } else {
          // Add this stablecoin to selection
          multiProps.onTokensChange([...currentTokens, token]);
        }
      }
    } else {
      // Single select mode (legacy)
      (props as TokenSelectorSingleProps).onTokenSelect(token);
    }
  };

  // Format selected tokens for display
  const getSelectedDisplay = () => {
    if (selectedTokens.length === 0) return 'None';
    if (selectedTokens.length === 1) return selectedTokens[0];
    if (isBnbSelected) return 'BNB';
    return selectedTokens.join(', ');
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {/* Label */}
      <div className="flex items-center justify-between">
        <label className="text-gray-300 font-semibold text-sm">
          {isMultiSelect ? 'Accepted Tokens' : 'Settlement Token'}
        </label>
        <span className="text-xs text-bnb-yellow truncate max-w-[150px]">
          {getSelectedDisplay()}
        </span>
      </div>

      {/* Token Cards Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {availableTokens.map((token) => {
          const isSelected = selectedTokens.includes(token);
          const isHovered = token === hoveredToken;

          // Blur logic:
          // - If BNB is selected: blur all non-BNB tokens
          // - If any stablecoin is selected: blur BNB
          // - If nothing selected: no blur
          const shouldBlur = showBlurEffect && !isSelected && (
            (isBnbSelected && token !== 'BNB') ||
            (!isBnbSelected && selectedTokens.length > 0 && token === 'BNB')
          );

          const info = TOKEN_INFO[token] || { name: token, description: '' };

          return (
            <button
              key={token}
              type="button"
              onClick={() => handleTokenClick(token)}
              onMouseEnter={() => setHoveredToken(token)}
              onMouseLeave={() => setHoveredToken(null)}
              disabled={disabled}
              className={`
                relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl
                border-2 transition-all duration-300 transform
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${isSelected
                  ? 'border-bnb-yellow bg-bnb-yellow/20 scale-105 shadow-lg shadow-bnb-yellow/30'
                  : shouldBlur
                  ? 'border-bnb-gray/50 bg-bnb-gray/30 opacity-40 blur-[1px] grayscale hover:opacity-60 hover:blur-0'
                  : 'border-bnb-gray bg-bnb-gray/50 hover:border-bnb-yellow/50 hover:bg-bnb-yellow/10 hover:scale-102'
                }
              `}
            >
              {/* Selection Indicator */}
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-bnb-yellow rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-bnb-dark" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}

              {/* Token Logo */}
              <div className={`relative mb-1 sm:mb-2 ${isSelected ? 'animate-pulse-slow' : ''}`}>
                <img
                  src={getTokenImagePath(token)}
                  alt={token}
                  className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full transition-all ${
                    isSelected ? 'ring-2 ring-bnb-yellow ring-offset-1 ring-offset-bnb-dark' : ''
                  }`}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/2.png';
                  }}
                />
                {/* Glow effect on hover/select */}
                {(isSelected || isHovered) && !shouldBlur && (
                  <div className="absolute inset-0 rounded-full bg-bnb-yellow/30 blur-md -z-10" />
                )}
              </div>

              {/* Token Symbol */}
              <span className={`font-bold text-xs sm:text-sm ${
                isSelected ? 'text-bnb-yellow' : 'text-white'
              }`}>
                {info.name}
              </span>

              {/* Token Description - Hidden on mobile for compactness */}
              <span className={`hidden sm:block text-[10px] ${
                isSelected ? 'text-bnb-yellow/70' : 'text-gray-500'
              }`}>
                {info.description}
              </span>

              {/* Native Badge for BNB */}
              {token === 'BNB' && (
                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                  <span className={`text-[8px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 rounded-full font-semibold ${
                    isSelected ? 'bg-bnb-yellow text-bnb-dark' : 'bg-bnb-gray text-gray-400'
                  }`}>
                    NATIVE
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Info Text */}
      <div className="p-2 sm:p-3 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl">
        <div className="flex items-start space-x-2">
          <svg className="w-4 h-4 text-bnb-yellow mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-xs text-gray-300">
            {isMultiSelect ? (
              isBnbSelected ? (
                <>
                  <span className="text-bnb-yellow font-semibold">Native BNB only</span> - Payment will be received in BNB.
                  Stablecoins are disabled when BNB is selected.
                </>
              ) : selectedTokens.length === 0 ? (
                <>
                  <span className="text-bnb-yellow font-semibold">Select tokens</span> to accept.
                  Choose BNB for native payments, or select multiple stablecoins.
                </>
              ) : (
                <>
                  <span className="text-bnb-yellow font-semibold">{selectedTokens.length} token{selectedTokens.length > 1 ? 's' : ''}</span> accepted.
                  Payers can choose any selected token. BNB is separate from stablecoins.
                </>
              )
            ) : (
              isBnbSelected ? (
                <>
                  <span className="text-bnb-yellow font-semibold">Native BNB</span> selected.
                  Payment will be received directly in BNB.
                </>
              ) : (
                <>
                  <span className="text-bnb-yellow font-semibold">{selectedTokens[0]}</span> selected.
                  Invoice will be settled in {selectedTokens[0]}.
                </>
              )
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact Token Selector for Payment Page
 * Displays tokens in a single row with smaller cards
 */
export function TokenSelectorCompact({
  selectedToken,
  onTokenSelect,
  network,
  disabled = false,
  className = '',
}: Omit<TokenSelectorSingleProps, 'showBlurEffect' | 'multiSelect'>) {
  const availableTokens = getTokensForNetwork(network);

  return (
    <div className={`space-y-2 ${className}`}>
      <label className="text-gray-400 text-xs font-medium">Pay with</label>
      <div className="flex flex-wrap gap-2">
        {availableTokens.map((token) => {
          const isSelected = token === selectedToken;

          return (
            <button
              key={token}
              type="button"
              onClick={() => !disabled && onTokenSelect(token)}
              disabled={disabled}
              className={`
                flex items-center space-x-2 px-3 py-2 rounded-lg
                border transition-all duration-200
                ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
                ${isSelected
                  ? 'border-bnb-yellow bg-bnb-yellow/20 text-bnb-yellow'
                  : 'border-bnb-gray/50 bg-bnb-gray/30 text-gray-400 hover:border-bnb-yellow/50 hover:text-white'
                }
              `}
            >
              <img
                src={getTokenImagePath(token)}
                alt={token}
                className="w-5 h-5 rounded-full"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = '/2.png';
                }}
              />
              <span className="text-sm font-semibold">{token}</span>
              {isSelected && (
                <svg className="w-4 h-4 text-bnb-yellow" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default TokenSelector;
