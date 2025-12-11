/**
 * Gift Card Redeem Page Component
 * Allows users to redeem BNB Pay Gift Cards
 * Updated design with BNB Pay card preview
 */

import { useState, useEffect, useCallback } from 'react';
import type { BNBPayCard, NetworkKey } from '../types';
import { giftCardApi, subscribeToPaymentUpdates, formatCardAmount } from '../services/giftcard-api';
import { cardStorage, parseRedemptionLink, validateCardByAccessCode } from '../services/card-storage';
import { useToast } from '../../contexts/ToastContext';
import { GiftCardPreview } from './GiftCardPreview';
import { ConfirmModal } from './ConfirmModal';

interface GiftCardRedeemPageProps {
  network: NetworkKey;
  walletAddress: string | null;
  onConnectWallet: () => void;
}

export function GiftCardRedeemPage({
  network,
  walletAddress,
  onConnectWallet,
}: GiftCardRedeemPageProps) {
  const { showToast } = useToast();

  // Form state - only access code needed (signature auto-looked up)
  const [accessCode, setAccessCode] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [card, setCard] = useState<BNBPayCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Parse URL params on mount (for links shared via Telegram, etc.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedData = params.get('data');

    if (encodedData) {
      const data = parseRedemptionLink(encodedData);
      if (data) {
        setAccessCode(data.code);
        // Auto-verify using full credentials from URL
        handleVerifyWithSignature(data.code, data.sig);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verify with full signature (from URL data)
  const handleVerifyWithSignature = useCallback(async (code: string, sig: string) => {
    setIsLoading(true);
    setError(null);
    setCard(null);

    try {
      const validation = cardStorage.validateCardCredentials(code, sig);

      if (!validation.valid || !validation.card) {
        setError(validation.error || 'Invalid card credentials');
        return;
      }

      setCard(validation.card);

      // Check if card matches current network
      if (validation.card.network !== network) {
        showToast(
          `This card is for ${validation.card.network === 'bnb' ? 'BNB Chain' : 'BNB Testnet'}. Please switch networks.`,
          'warning'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify card';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [network, showToast]);

  // Verify by access code only (looks up signature from storage)
  const handleVerify = useCallback(async () => {
    if (!accessCode) {
      setError('Please enter the access code');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCard(null);

    try {
      const validation = validateCardByAccessCode(accessCode);

      if (!validation.valid || !validation.card) {
        setError(validation.error || 'Invalid access code');
        return;
      }

      setCard(validation.card);

      // Check if card matches current network
      if (validation.card.network !== network) {
        showToast(
          `This card is for ${validation.card.network === 'bnb' ? 'BNB Chain' : 'BNB Testnet'}. Please switch networks.`,
          'warning'
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to verify card';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [accessCode, network, showToast]);

  const handleRedeem = useCallback(async () => {
    if (!card || !walletAddress) return;

    setShowConfirmModal(false);
    setIsRedeeming(true);
    setError(null);

    try {
      const result = await giftCardApi.redeemGiftCard({
        accessCode: card.accessCode,
        signature: card.signature,
        redeemerAddress: walletAddress,
      });

      if (result.success && result.paymentId) {
        showToast('Redemption initiated! Waiting for confirmation...', 'info');

        // Subscribe to payment updates
        const cleanup = subscribeToPaymentUpdates(result.paymentId, (status, hash) => {
          if (status === 'confirmed' && hash) {
            setTxHash(hash);
            setRedeemSuccess(true);
            showToast('Gift card redeemed successfully!', 'success');
            cleanup();
          } else if (status === 'failed') {
            setError('Redemption failed. Please try again.');
            showToast('Redemption failed', 'error');
            cleanup();
          }
        });

        // Set success after short delay (even if SSE doesn't confirm)
        setTimeout(() => {
          if (!redeemSuccess) {
            setRedeemSuccess(true);
          }
        }, 5000);
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
  }, [card, walletAddress, showToast, redeemSuccess]);

  const handleReset = useCallback(() => {
    setAccessCode('');
    setCard(null);
    setError(null);
    setRedeemSuccess(false);
    setTxHash(null);
    // Clear URL params
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  const formatAccessCode = (value: string): string => {
    // Remove non-alphanumeric characters
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    // Add dashes every 4 characters
    const parts = cleaned.match(/.{1,4}/g) || [];
    return parts.join('-');
  };

  // Success state
  if (redeemSuccess && card) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Success Message */}
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

            {/* Transaction Link */}
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

            {/* Reset Button */}
            <button
              onClick={handleReset}
              className="w-full py-3 px-4 border border-bnb-yellow text-bnb-yellow font-semibold rounded-xl hover:bg-bnb-yellow/10 transition-colors"
            >
              Redeem Another Card
            </button>
          </div>

          {/* Right Column - Redeemed Card Preview */}
          <div className="card-shadow rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Redeemed Card
            </h2>
            <div className="flex justify-center">
              <GiftCardPreview card={{ ...card, status: 'redeemed' }} />
            </div>
          </div>
        </div>

        {/* Powered by Pepay Labs Footer */}
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mt-8">
          <span>Powered by</span>
          <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
            <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Card verified state
  if (card) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column - Redeem Actions */}
          <div className="card-shadow rounded-2xl p-8 relative">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
              Redeem Gift Card
            </h2>

            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-bnb-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-white mb-2">Gift Card Found!</h3>
              <p className="text-gray-400">
                You're about to receive {formatCardAmount(card.amount, card.token)}
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Actions - Single button with connect wallet or redeem */}
            <div className="relative group">
              <button
                onClick={walletAddress ? () => setShowConfirmModal(true) : onConnectWallet}
                disabled={isRedeeming || (!!walletAddress && card.status !== 'active')}
                className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {isRedeeming ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Redeeming...</span>
                  </>
                ) : !walletAddress ? (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Connect Wallet</span>
                  </>
                ) : card.status !== 'active' ? (
                  <span>Card Not Available</span>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span>Redeem to My Wallet</span>
                  </>
                )}
              </button>
              {/* Hover tooltip when wallet not connected */}
              {!walletAddress && (
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-bnb-gray border border-bnb-yellow/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                  <p className="text-sm text-gray-300">Connect your wallet to redeem this gift card</p>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-bnb-gray"></div>
                </div>
              )}
            </div>

            {/* Back Button */}
            <button
              onClick={handleReset}
              className="w-full mt-4 py-3 px-4 border border-gray-600 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 transition-colors"
            >
              Check Different Card
            </button>
          </div>

          {/* Right Column - Card Preview */}
          <div className="card-shadow rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
              Card Preview
            </h2>
            <div className="flex justify-center">
              <GiftCardPreview card={card} />
            </div>

            {/* Card Message if exists */}
            {card.message && (
              <div className="mt-6 p-4 bg-bnb-gray/50 rounded-xl border border-gray-700">
                <p className="text-sm text-gray-400 mb-1">Message from sender:</p>
                <p className="text-white italic">"{card.message}"</p>
              </div>
            )}
          </div>

          {/* Confirm Modal */}
          <ConfirmModal
            isOpen={showConfirmModal}
            onClose={() => setShowConfirmModal(false)}
            onConfirm={handleRedeem}
            title="Redeem Gift Card"
            message={`You are about to redeem ${formatCardAmount(card.amount, card.token)} to your wallet (${walletAddress?.slice(0, 6)}...${walletAddress?.slice(-4)}). This action cannot be undone.`}
            confirmLabel="Redeem Now"
            confirmColor="bg-green-500 text-white hover:bg-green-600"
            isLoading={isRedeeming}
          />
        </div>

        {/* Powered by Pepay Labs Footer */}
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mt-8">
          <span>Powered by</span>
          <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
            <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  // Initial form state
  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 ${!walletAddress ? 'group' : ''}`}>
        {/* Left Column - Redeem Form */}
        <div className="card-shadow rounded-2xl p-8 relative">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            Redeem Gift Card
          </h2>

          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-bnb-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
            <p className="text-gray-400">
              Enter your gift card access code
            </p>
          </div>

          <div className="space-y-5">
            {/* Access Code Input */}
            <div className="form-group">
              <label className="block mb-2 text-gray-300 font-semibold text-sm">Access Code</label>
              <input
                type="text"
                value={accessCode}
                onChange={(e) => setAccessCode(formatAccessCode(e.target.value))}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                maxLength={19}
                className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white text-center font-mono text-lg tracking-wider placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow uppercase transition-colors"
              />
              <p className="mt-2 text-xs text-gray-400">
                Enter the access code shared via Telegram or from the gift card link
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Verify Button */}
            <button
              onClick={handleVerify}
              disabled={isLoading || !accessCode}
              className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Verify Card</span>
                </>
              )}
            </button>
          </div>

          {/* Connect Wallet Overlay - appears on hover when wallet not connected */}
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

        {/* Right Column - How to Redeem */}
        <div className="card-shadow rounded-2xl p-8">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to Redeem
          </h2>

          {/* Placeholder Card Preview */}
          <div className="flex justify-center mb-8">
            <GiftCardPreview
              previewAmount="0"
              previewToken="BNB"
              previewNetwork={network}
              showStatus={false}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">1</span>
              </div>
              <p className="text-gray-400 text-sm">Enter the access code from your gift card</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">2</span>
              </div>
              <p className="text-gray-400 text-sm">Connect your wallet to receive the funds</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">3</span>
              </div>
              <p className="text-gray-400 text-sm">Click redeem to claim your gift card</p>
            </div>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
            <p className="text-gray-300">
              <strong className="text-bnb-yellow">Tip:</strong> If you received a link via Telegram, just click it and the access code will auto-fill.
            </p>
          </div>
        </div>
      </div>

      {/* Powered by Pepay Labs Footer */}
      <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mt-8">
        <span>Powered by</span>
        <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
          <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export default GiftCardRedeemPage;
