/**
 * Gift Card Preview Component
 * Displays a visual preview of a gift card
 */

import type { BNBPayCard } from '../types';
import { getTokenImagePath } from '../services/tokens';
import { formatCardStatus } from '../services/giftcard-api';

interface GiftCardPreviewProps {
  card: BNBPayCard;
  showStatus?: boolean;
  compact?: boolean;
}

export function GiftCardPreview({ card, showStatus = true, compact = false }: GiftCardPreviewProps) {
  const statusInfo = formatCardStatus(card.status);
  const expiresDate = card.expiresAt ? new Date(card.expiresAt) : null;
  const isExpired = expiresDate && expiresDate < new Date();

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-bnb-gray via-gray-800 to-gray-900 border border-gray-700 ${
      compact ? 'p-4' : 'p-6'
    }`}>
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-5">
        <div className="absolute inset-0" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23F0B90B\' fill-opacity=\'0.4\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
        }} />
      </div>

      {/* Status Badge */}
      {showStatus && (
        <div className="absolute top-4 right-4">
          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
            card.status === 'active' ? 'bg-green-500/20 text-green-400' :
            card.status === 'redeemed' ? 'bg-blue-500/20 text-blue-400' :
            card.status === 'expired' || isExpired ? 'bg-gray-500/20 text-gray-400' :
            'bg-red-500/20 text-red-400'
          }`}>
            {isExpired && card.status === 'active' ? 'Expired' : statusInfo.label}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="relative flex items-center space-x-3 mb-4">
        <div className="w-12 h-12 bg-bnb-yellow/20 rounded-xl flex items-center justify-center">
          <svg className="w-6 h-6 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">BNB Pay Gift Card</h3>
          <p className="text-sm text-gray-400">
            {card.network === 'bnb' ? 'BNB Chain' : 'BNB Testnet'}
          </p>
        </div>
      </div>

      {/* Amount Display */}
      <div className={`relative flex items-center justify-between ${compact ? 'mb-3' : 'mb-6'}`}>
        <div className="flex items-center space-x-3">
          <img
            src={getTokenImagePath(card.token)}
            alt={card.token}
            className={compact ? 'w-10 h-10 rounded-full' : 'w-14 h-14 rounded-full'}
          />
          <div>
            <p className={`font-bold text-white ${compact ? 'text-2xl' : 'text-3xl'}`}>
              {parseFloat(card.amount).toLocaleString('en-US', { maximumFractionDigits: 6 })}
            </p>
            <p className="text-gray-400 font-medium">{card.token}</p>
          </div>
        </div>
      </div>

      {/* Message */}
      {card.message && !compact && (
        <div className="relative bg-black/20 rounded-lg p-4 mb-4">
          <p className="text-gray-300 text-sm italic">"{card.message}"</p>
        </div>
      )}

      {/* Details */}
      <div className={`relative grid ${compact ? 'grid-cols-2' : 'grid-cols-3'} gap-4 text-sm`}>
        <div>
          <p className="text-gray-500 mb-1">Created</p>
          <p className="text-white font-medium">
            {new Date(card.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
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
                  year: 'numeric'
                })
              : 'Never'
            }
          </p>
        </div>
        {!compact && (
          <div>
            <p className="text-gray-500 mb-1">Card ID</p>
            <p className="text-white font-mono text-xs truncate">
              {card.cardId.slice(0, 16)}...
            </p>
          </div>
        )}
      </div>

      {/* Redeemed Info */}
      {card.status === 'redeemed' && card.redeemedAt && (
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
              href={`https://${card.network === 'bnb' ? '' : 'testnet.'}bscscan.com/tx/${card.txHash}`}
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
    </div>
  );
}

export default GiftCardPreview;
