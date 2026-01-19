/**
 * Gift Card Preview Component
 * Displays a visual preview of a BNB Pay gift card with shimmer effect
 */

import type { BNBPayCard, NetworkKey, Token } from '../types';
import { getTokenImagePath } from '../services/tokens';
import { formatCardStatus } from '../services/giftcard-api';

interface GiftCardPreviewProps {
  card?: BNBPayCard;
  // For preview mode (before card is created)
  previewAmount?: string;
  previewToken?: Token;
  previewNetwork?: NetworkKey;
  showStatus?: boolean;
  compact?: boolean;
}

export function GiftCardPreview({
  card,
  previewAmount,
  previewToken,
  previewNetwork,
  showStatus = true,
  compact = false
}: GiftCardPreviewProps) {
  // Use card data or preview data
  const amount = card?.amount || previewAmount || '0';
  const token = card?.token || previewToken || 'BNB';
  const network = card?.network || previewNetwork || 'testnet';
  const isTestnet = network === 'bnbTestnet';

  const statusInfo = card ? formatCardStatus(card.status) : null;
  const expiresDate = card?.expiresAt ? new Date(card.expiresAt) : null;
  const isExpired = expiresDate && expiresDate < new Date();

  // Format amount for display
  const displayAmount = parseFloat(amount).toLocaleString('en-US', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0
  });

  return (
    <div
      className={`gift-card relative overflow-hidden rounded-2xl w-full ${compact ? 'max-w-sm p-4' : 'max-w-md p-6'}`}
      style={{
        background: 'linear-gradient(135deg, rgb(30, 35, 41) 0%, rgb(11, 14, 17) 100%)',
        border: '2px solid rgba(240, 185, 11, 0.3)',
      }}
    >
      {/* Shimmer Effect Overlay */}
      <div className="absolute inset-0 gift-card-shimmer pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <img src="/6.png" alt="BNB Pay" className={compact ? 'h-8 w-8' : 'h-10 w-10'} />
          <div>
            <p className={`font-bold text-white ${compact ? 'text-base' : 'text-lg'}`}>BNB Pay</p>
            <p className="text-bnb-yellow text-xs">Gift Card</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Network Badge */}
          {isTestnet && (
            <div className="px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400 text-xs font-semibold">
              Testnet
            </div>
          )}
          {/* Status Badge */}
          {showStatus && card && statusInfo && (
            <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${
              card.status === 'active' ? 'bg-green-500/20 text-green-400' :
              card.status === 'redeemed' ? 'bg-blue-500/20 text-blue-400' :
              card.status === 'expired' || isExpired ? 'bg-gray-500/20 text-gray-400' :
              'bg-red-500/20 text-red-400'
            }`}>
              {isExpired && card.status === 'active' ? 'Expired' : statusInfo.label}
            </span>
          )}
        </div>
      </div>

      {/* Amount Display */}
      <div className="relative bg-bnb-yellow/10 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-center space-x-3">
          <img
            src={getTokenImagePath(token)}
            alt={token}
            className={`rounded-full bg-white p-1 ${compact ? 'w-12 h-12' : 'w-14 h-14'}`}
          />
          <div className="text-center">
            <p className={`font-bold text-gradient-yellow ${compact ? 'text-3xl' : 'text-4xl'}`}>
              {displayAmount}
            </p>
            <p className={`text-bnb-yellow font-semibold ${compact ? 'text-base' : 'text-lg'}`}>
              {token}
            </p>
          </div>
        </div>
      </div>

      {/* Message (if card has one) */}
      {(card?.message || card?.senderName) && !compact && (
        <div className="relative bg-black/20 rounded-lg p-4 mb-4 space-y-2">
          {card?.senderName && (
            <p className="text-gray-300 text-sm">
              From <span className="text-bnb-yellow font-semibold">{card.senderName}</span>
            </p>
          )}
          {card?.message && (
            <p className="text-gray-300 text-sm italic">\"{card.message}\"</p>
          )}
        </div>
      )}

      {/* Card Details (only shown for created cards) */}
      {card && !compact && (
        <div className="relative grid grid-cols-3 gap-4 text-sm mt-4 pt-4 border-t border-gray-700/50">
          <div>
            <p className="text-gray-500 mb-1">Created</p>
            <p className="text-white font-medium">
              {new Date(card.createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Expires</p>
            <p className={`font-medium ${isExpired ? 'text-red-400' : 'text-white'}`}>
              {expiresDate
                ? expiresDate.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  })
                : 'Never'
              }
            </p>
          </div>
          <div>
            <p className="text-gray-500 mb-1">Card ID</p>
            <p className="text-white font-mono text-xs truncate">
              {card.cardId.slice(0, 8)}...
            </p>
          </div>
        </div>
      )}

      {/* Redeemed Info */}
      {card?.status === 'redeemed' && card.redeemedAt && !compact && (
        <div className="relative mt-4 pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-gray-500">Redeemed by</p>
              <p className="text-white font-mono">
                {card.redeemedBy
                  ? `${card.redeemedBy.slice(0, 6)}...${card.redeemedBy.slice(-4)}`
                  : 'Unknown'
                }
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500">On</p>
              <p className="text-white">
                {new Date(card.redeemedAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          </div>
          {card.txHash && (
            <a
              href={`https://${network === 'bnb' ? '' : 'testnet.'}bscscan.com/tx/${card.txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center text-bnb-yellow text-sm hover:underline"
            >
              View Transaction
              <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          )}
        </div>
      )}

      {/* Decorative Elements */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-bnb-yellow/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-bnb-yellow/5 rounded-full translate-y-1/2 -translate-x-1/2 pointer-events-none" />
      <div className="absolute bottom-4 right-4 opacity-10 pointer-events-none">
        <img src="/bnblogo.png" alt="" className="w-16 h-16" />
      </div>
    </div>
  );
}

export default GiftCardPreview;
