/**
 * Gift Card Redeem Page Component
 * Supports direct and claimable gift cards.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { BNBPayCard, NetworkKey } from '../types';
import { giftCardApi, subscribeToPaymentUpdates, formatCardAmount } from '../services/giftcard-api';
import { switchToNetwork } from '../../lib/web3';
import { useToast } from '../../contexts/ToastContext';
import { GiftCardPreview } from './GiftCardPreview';
import { ConfirmModal } from './ConfirmModal';

interface GiftCardRedeemPageProps {
  network: NetworkKey;
  walletAddress: string | null;
  onConnectWallet: () => void;
}

function parseFragmentParam(key: string): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  return params.get(key);
}

export function GiftCardRedeemPage({
  network,
  walletAddress,
  onConnectWallet,
}: GiftCardRedeemPageProps) {
  const { showToast } = useToast();

  const [cardId, setCardId] = useState<string | null>(null);
  const [card, setCard] = useState<BNBPayCard | null>(null);
  const [accessCode, setAccessCode] = useState('');
  const [redeemKey, setRedeemKey] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [pendingPaymentId, setPendingPaymentId] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('cardId');
    if (id) {
      setCardId(id);
    }
    const fragmentAccessCode = parseFragmentParam('accessCode');
    if (fragmentAccessCode) {
      setAccessCode(fragmentAccessCode);
    }
    const fragmentRedeemKey = parseFragmentParam('redeemKey');
    if (fragmentRedeemKey) {
      setRedeemKey(fragmentRedeemKey);
    }
  }, []);

  const loadCard = useCallback(async (id: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await giftCardApi.getGiftCard(id);
      if (!data) {
        setError('Gift card not found');
        setCard(null);
        return;
      }
      setCard(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load gift card';
      setError(message);
      setCard(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (cardId) {
      void loadCard(cardId);
    }
  }, [cardId, loadCard]);

  const networkMismatch = useMemo(() => {
    if (!card) return false;
    return card.network !== network;
  }, [card, network]);

  const recipientMismatch = useMemo(() => {
    if (!card || card.cardType !== 'direct' || !card.recipientAddress || !walletAddress) return false;
    return card.recipientAddress.toLowerCase() !== walletAddress.toLowerCase();
  }, [card, walletAddress]);

  const claimRequired = useMemo(() => {
    if (!card) return false;
    return card.cardType === 'open' && card.status === 'active';
  }, [card]);

  const claimDisabled = !walletAddress || networkMismatch || !redeemKey;

  const handleClaim = useCallback(async () => {
    if (!card || !walletAddress || !redeemKey) return;
    setIsClaiming(true);
    setError(null);

    try {
      const result = await giftCardApi.claimGiftCard({
        card,
        redeemerAddress: walletAddress,
        redeemKey,
      });

      if (!result.success || !result.card) {
        throw new Error(result.error || 'Failed to claim gift card');
      }

      setCard(result.card);
      showToast('Gift card claimed! You can now redeem.', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Claim failed';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsClaiming(false);
    }
  }, [card, walletAddress, redeemKey, showToast]);

  const handleRedeem = useCallback(async () => {
    if (!card || !walletAddress) return;

    setShowConfirmModal(false);
    setIsRedeeming(true);
    setError(null);

    try {
      const result = await giftCardApi.redeemGiftCard({
        card,
        accessCode: card.cardType === 'direct' ? accessCode : undefined,
        redeemerAddress: walletAddress,
      });

      if (result.success && result.paymentId) {
        setPendingPaymentId(result.paymentId);
        showToast('Redemption submitted. Waiting for confirmation...', 'info');

        const cleanup = subscribeToPaymentUpdates(result.paymentId, (status, hash) => {
          if (status === 'confirmed' && hash) {
            setTxHash(hash);
            setRedeemSuccess(true);
            setPendingPaymentId(null);
            showToast('Gift card redeemed successfully!', 'success');
            cleanup();
          } else if (status === 'failed') {
            setError('Redemption failed. Please try again.');
            setPendingPaymentId(null);
            showToast('Redemption failed', 'error');
            cleanup();
          }
        });
      } else {
        setError(result.error || 'Failed to redeem gift card');
        showToast(result.error || 'Failed to redeem', 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to redeem gift card';
      setError(message);
      showToast(message, 'error');
    } finally {
      setIsRedeeming(false);
    }
  }, [card, walletAddress, accessCode, showToast]);

  const handleReset = useCallback(() => {
    setAccessCode('');
    setCard(null);
    setError(null);
    setRedeemSuccess(false);
    setTxHash(null);
    setPendingPaymentId(null);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const canRedeem = useMemo(() => {
    if (!card || !walletAddress) return false;
    if (networkMismatch) return false;
    if (card.cardType === 'direct') {
      if (card.status !== 'active') return false;
      if (recipientMismatch) return false;
      return Boolean(accessCode);
    }
    if (card.cardType === 'open') {
      if (card.status !== 'claimed') return false;
      if (card.claimedAgent && card.claimedAgent.toLowerCase() !== walletAddress.toLowerCase()) return false;
      return true;
    }
    return false;
  }, [card, walletAddress, networkMismatch, recipientMismatch, accessCode]);

  if (redeemSuccess && card) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="card-shadow rounded-2xl p-8">
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Gift Card Redeemed!</h2>
              <p className="text-gray-400">
                {formatCardAmount(card.amount, card.token)} has been sent to your wallet
              </p>
            </div>

            {txHash && (
              <div className="bg-bnb-gray/50 rounded-xl p-4 border border-gray-700 mb-6">
                <p className="text-sm text-gray-400 mb-2">Transaction Hash</p>
                <a
                  href={`https://${network === 'bnb' ? '' : 'testnet.'}bscscan.com/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-bnb-yellow font-mono text-sm hover:underline break-all"
                >
                  {txHash}
                </a>
              </div>
            )}

            <button
              onClick={handleReset}
              className="w-full py-3 px-4 border border-bnb-yellow text-bnb-yellow font-semibold rounded-xl hover:bg-bnb-yellow/10 transition-colors"
            >
              Redeem Another Gift Card
            </button>
          </div>

          <div className="card-shadow rounded-2xl p-8 flex items-center justify-center">
            <GiftCardPreview card={card} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="card-shadow rounded-2xl p-8 relative group">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
            </svg>
            Redeem Gift Card
          </h2>

          {isLoading && (
            <div className="text-gray-400">Loading gift card...</div>
          )}

          {!isLoading && error && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-4 mb-4">
              {error}
            </div>
          )}

          {!isLoading && card && (
            <div className="space-y-6">
              {networkMismatch && (
                <div className="bg-orange-500/10 border border-orange-500/30 text-orange-400 rounded-xl p-4">
                  This gift card is on {card.network === 'bnb' ? 'BNB Chain' : 'BNB Testnet'}. Switch networks to redeem.
                  <button
                    onClick={() => switchToNetwork(card.network === 'bnb' ? 'mainnet' : 'testnet')}
                    className="mt-3 w-full py-2 px-4 rounded-lg bg-orange-500/20 text-orange-200 font-semibold hover:bg-orange-500/30"
                  >
                    Switch Network
                  </button>
                </div>
              )}

              {card.cardType === 'direct' && (
                <div className="space-y-4">
                  <label className="block text-sm font-semibold text-gray-300">Access Code</label>
                  <input
                    type="text"
                    value={accessCode}
                    onChange={(e) => setAccessCode(e.target.value)}
                    placeholder="Enter access code"
                    className="w-full px-4 py-3 bg-bnb-gray border border-gray-700 rounded-xl text-white font-mono"
                  />
                  {recipientMismatch && (
                    <p className="text-sm text-red-400">
                      This card is locked to {card.recipientAddress?.slice(0, 6)}...{card.recipientAddress?.slice(-4)}.
                    </p>
                  )}
                </div>
              )}

              {card.cardType === 'open' && claimRequired && (
                <div className="space-y-4">
                  <div className="bg-bnb-gray/50 border border-bnb-yellow/20 rounded-xl p-4">
                    <p className="text-gray-300 text-sm">
                      This is a claimable gift card. Claiming binds it to your wallet before redeeming.
                    </p>
                    {!redeemKey && (
                      <p className="text-red-400 text-xs mt-2">Missing redeem key in the link.</p>
                    )}
                  </div>
                  <button
                    onClick={walletAddress ? handleClaim : onConnectWallet}
                    disabled={isClaiming || claimDisabled}
                    className="w-full py-3 px-4 rounded-xl bg-bnb-yellow text-bnb-dark font-semibold hover:bg-yellow-500 disabled:opacity-50"
                  >
                    {isClaiming ? 'Claiming...' : walletAddress ? 'Claim Gift Card' : 'Connect Wallet'}
                  </button>
                </div>
              )}

              {pendingPaymentId && !redeemSuccess && (
                <div className="bg-bnb-gray/50 border border-gray-700 rounded-xl p-4">
                  <p className="text-sm text-gray-300">Waiting for confirmation on-chain...</p>
                </div>
              )}

              <button
                onClick={walletAddress ? () => setShowConfirmModal(true) : onConnectWallet}
                disabled={isRedeeming || !canRedeem}
                className="w-full py-3 px-4 rounded-xl bg-bnb-yellow text-bnb-dark font-semibold hover:bg-yellow-500 disabled:opacity-50"
              >
                {isRedeeming ? 'Redeeming...' : walletAddress ? 'Redeem Gift Card' : 'Connect Wallet'}
              </button>
            </div>
          )}

          {!walletAddress && (
            <div className="absolute inset-0 bg-bnb-dark/95 backdrop-blur-sm rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto z-10">
              <div className="text-center px-8">
                <img src="/bnbpay-logo.png" alt="BNBPay" className="h-20 w-auto mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h3>
                <p className="text-gray-400 mb-6">Connect your wallet to redeem gift cards</p>
                <button
                  onClick={onConnectWallet}
                  className="inline-flex items-center space-x-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold px-8 py-4 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Connect Wallet</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="card-shadow rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6">Gift Card Details</h2>
          {card ? (
            <GiftCardPreview card={card} />
          ) : (
            <div className="text-gray-400 text-sm">Provide a valid gift card link to view details.</div>
          )}
        </div>
      </div>

      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleRedeem}
        title="Redeem Gift Card"
        message={
          card
            ? `You are about to redeem ${formatCardAmount(card.amount, card.token)} to your wallet (${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)}).`
            : 'Confirm redemption'
        }
        confirmLabel="Redeem"
        isLoading={isRedeeming}
      />
    </div>
  );
}

export default GiftCardRedeemPage;
