/**
 * Gift Card History Component
 * Displays a list of created and redeemed gift cards
 */

import { useState, useEffect, useCallback } from 'react';
import type { BNBPayCard, NetworkKey } from '../types';
import { giftCardApi, formatCardAmount, formatCardStatus, isCardValid } from '../services/giftcard-api';
import { getAllCards, getCardsByMerchant, generateRedemptionLink } from '../services/card-storage';
import { getTokenImagePath } from '../services/tokens';
import { useToast } from '../../contexts/ToastContext';
import { GiftCardPreview } from './GiftCardPreview';
import { QRCodeDisplay } from './QRCodeDisplay';
import { ConfirmModal } from './ConfirmModal';

interface GiftCardHistoryProps {
  network: NetworkKey;
  walletAddress: string | null;
}

type FilterType = 'all' | 'active' | 'redeemed' | 'expired';

export function GiftCardHistory({
  network,
  walletAddress,
}: GiftCardHistoryProps) {
  const { showToast } = useToast();

  // State
  const [cards, setCards] = useState<BNBPayCard[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [selectedCard, setSelectedCard] = useState<BNBPayCard | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load cards
  const loadCards = useCallback(async () => {
    setIsLoading(true);
    try {
      let loadedCards: BNBPayCard[];

      if (walletAddress) {
        // Load cards created by this wallet
        loadedCards = getCardsByMerchant(walletAddress);
      } else {
        // Load all cards (for demo)
        loadedCards = getAllCards();
      }

      // Filter by network
      loadedCards = loadedCards.filter(card => card.network === network);

      // Sort by created date (newest first)
      loadedCards.sort((a, b) => b.createdAt - a.createdAt);

      setCards(loadedCards);
    } catch (error) {
      showToast('Failed to load gift cards', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, network, showToast]);

  useEffect(() => {
    loadCards();
  }, [loadCards]);

  // Filter cards
  const filteredCards = cards.filter(card => {
    if (filter === 'all') return true;
    if (filter === 'active') return card.status === 'active' && isCardValid(card);
    if (filter === 'redeemed') return card.status === 'redeemed';
    if (filter === 'expired') {
      return card.status === 'expired' ||
        (card.expiresAt && card.expiresAt < Date.now() && card.status === 'active');
    }
    return true;
  });

  // Stats
  const stats = {
    total: cards.length,
    active: cards.filter(c => c.status === 'active' && isCardValid(c)).length,
    redeemed: cards.filter(c => c.status === 'redeemed').length,
    expired: cards.filter(c =>
      c.status === 'expired' ||
      (c.expiresAt && c.expiresAt < Date.now() && c.status === 'active')
    ).length,
  };

  // Handle card cancel
  const handleCancelCard = useCallback(async () => {
    if (!selectedCard) return;

    try {
      await giftCardApi.cancelGiftCard(selectedCard.cardId);
      showToast('Gift card cancelled successfully', 'success');
      loadCards();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel card';
      showToast(message, 'error');
    } finally {
      setShowCancelModal(false);
      setSelectedCard(null);
    }
  }, [selectedCard, showToast, loadCards]);

  // Handle copy link
  const handleCopyLink = useCallback((card: BNBPayCard) => {
    const url = generateRedemptionLink(card);
    navigator.clipboard.writeText(url);
    showToast('Redemption link copied!', 'success');
  }, [showToast]);

  // Empty state
  if (!isLoading && cards.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 bg-bnb-gray rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
        <h3 className="text-xl font-bold text-white mb-2">No Gift Cards Yet</h3>
        <p className="text-gray-400 mb-6">
          {walletAddress
            ? "You haven't created any gift cards yet."
            : "Connect your wallet to see your gift cards."
          }
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-white">{stats.total}</p>
          <p className="text-sm text-gray-400">Total</p>
        </div>
        <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-green-400">{stats.active}</p>
          <p className="text-sm text-gray-400">Active</p>
        </div>
        <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-blue-400">{stats.redeemed}</p>
          <p className="text-sm text-gray-400">Redeemed</p>
        </div>
        <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
          <p className="text-2xl font-bold text-gray-400">{stats.expired}</p>
          <p className="text-sm text-gray-400">Expired</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center space-x-2 overflow-x-auto pb-2">
        {(['all', 'active', 'redeemed', 'expired'] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
              filter === f
                ? 'bg-bnb-yellow text-bnb-dark'
                : 'bg-bnb-gray text-gray-400 hover:text-white'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f !== 'all' && (
              <span className="ml-1.5 text-xs opacity-70">
                ({f === 'active' ? stats.active : f === 'redeemed' ? stats.redeemed : stats.expired})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <svg className="animate-spin w-8 h-8 text-bnb-yellow" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      )}

      {/* Cards List */}
      {!isLoading && filteredCards.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-gray-400">No {filter !== 'all' ? filter : ''} gift cards found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCards.map((card) => (
            <div
              key={card.cardId}
              className="bg-bnb-gray/30 rounded-xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
            >
              {/* Card Header */}
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-3">
                    <img
                      src={getTokenImagePath(card.token)}
                      alt={card.token}
                      className="w-10 h-10 rounded-full"
                    />
                    <div>
                      <p className="text-lg font-bold text-white">
                        {formatCardAmount(card.amount, card.token)}
                      </p>
                      <p className="text-sm text-gray-400">
                        Created {new Date(card.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    card.status === 'active' && isCardValid(card)
                      ? 'bg-green-500/20 text-green-400'
                      : card.status === 'redeemed'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-gray-500/20 text-gray-400'
                  }`}>
                    {formatCardStatus(card.status).label}
                  </span>
                </div>

                {/* Card Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Access Code</p>
                    <p className="text-white font-mono text-xs">{card.accessCode}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Expires</p>
                    <p className="text-white">
                      {card.expiresAt
                        ? new Date(card.expiresAt).toLocaleDateString()
                        : 'Never'
                      }
                    </p>
                  </div>
                  {card.message && (
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-gray-500">Message</p>
                      <p className="text-white text-xs truncate">{card.message}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card Actions */}
              {card.status === 'active' && isCardValid(card) && (
                <div className="border-t border-gray-700 p-3 flex items-center justify-end space-x-2">
                  <button
                    onClick={() => handleCopyLink(card)}
                    className="px-3 py-1.5 text-sm font-medium text-bnb-yellow hover:bg-bnb-yellow/10 rounded-lg transition-colors"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => setSelectedCard(card)}
                    className="px-3 py-1.5 text-sm font-medium text-gray-400 hover:bg-gray-700 rounded-lg transition-colors"
                  >
                    View Details
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCard(card);
                      setShowCancelModal(true);
                    }}
                    className="px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Redeemed Info */}
              {card.status === 'redeemed' && card.txHash && (
                <div className="border-t border-gray-700 p-3">
                  <a
                    href={`https://${network === 'bnb' ? '' : 'testnet.'}bscscan.com/tx/${card.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-bnb-yellow hover:underline"
                  >
                    View Transaction
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card Detail Modal */}
      {selectedCard && !showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSelectedCard(null)}
          />
          <div className="relative bg-bnb-gray border border-gray-700 rounded-2xl shadow-2xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedCard(null)}
              className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-xl font-bold text-white mb-4">Gift Card Details</h3>

            <GiftCardPreview card={selectedCard} />

            {selectedCard.status === 'active' && isCardValid(selectedCard) && (
              <div className="mt-6 space-y-4">
                <div className="bg-white rounded-xl p-4 text-center">
                  <QRCodeDisplay
                    value={generateRedemptionLink(selectedCard)}
                    size={180}
                  />
                  <p className="text-sm text-gray-500 mt-2">Scan to redeem</p>
                </div>

                <button
                  onClick={() => handleCopyLink(selectedCard)}
                  className="w-full py-3 px-4 bg-bnb-yellow text-bnb-dark font-semibold rounded-xl hover:bg-yellow-500 transition-colors"
                >
                  Copy Redemption Link
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => {
          setShowCancelModal(false);
          setSelectedCard(null);
        }}
        onConfirm={handleCancelCard}
        title="Cancel Gift Card"
        message="Are you sure you want to cancel this gift card? This action cannot be undone and the card will no longer be redeemable."
        confirmLabel="Yes, Cancel Card"
        confirmColor="bg-red-500 text-white hover:bg-red-600"
      />
    </div>
  );
}

export default GiftCardHistory;
