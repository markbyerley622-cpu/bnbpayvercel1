/**
 * Gift Card Redeem Page Component
 * Allows users to redeem BNB Pay Gift Cards
 */

import { useState, useEffect, useCallback } from 'react';
import type { BNBPayCard, NetworkKey } from '../types';
import { giftCardApi, subscribeToPaymentUpdates, formatCardAmount } from '../services/giftcard-api';
import { cardStorage, parseRedemptionLink } from '../services/card-storage';
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

  // Form state
  const [accessCode, setAccessCode] = useState('');
  const [signature, setSignature] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [isRedeeming, setIsRedeeming] = useState(false);
  const [card, setCard] = useState<BNBPayCard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Parse URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encodedData = params.get('data');

    if (encodedData) {
      const data = parseRedemptionLink(encodedData);
      if (data) {
        setAccessCode(data.code);
        setSignature(data.sig);
        // Auto-verify
        handleVerify(data.code, data.sig);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = useCallback(async (code?: string, sig?: string) => {
    const codeToVerify = code || accessCode;
    const sigToVerify = sig || signature;

    if (!codeToVerify || !sigToVerify) {
      setError('Please enter both access code and signature');
      return;
    }

    setIsLoading(true);
    setError(null);
    setCard(null);

    try {
      const validation = cardStorage.validateCardCredentials(codeToVerify, sigToVerify);

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
  }, [accessCode, signature, network, showToast]);

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
    setSignature('');
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
        <div className="text-center">
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
          <div className="bg-bnb-gray/50 rounded-xl p-4 border border-gray-700">
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

        {/* Card Preview */}
        <GiftCardPreview card={{ ...card, status: 'redeemed' }} />

        {/* Reset Button */}
        <button
          onClick={handleReset}
          className="w-full py-3 px-4 border border-bnb-yellow text-bnb-yellow font-semibold rounded-xl hover:bg-bnb-yellow/10 transition-colors"
        >
          Redeem Another Card
        </button>
      </div>
    );
  }

  // Card verified state
  if (card) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-bnb-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Gift Card Found!</h2>
          <p className="text-gray-400">
            You're about to receive {formatCardAmount(card.amount, card.token)}
          </p>
        </div>

        {/* Card Preview */}
        <GiftCardPreview card={card} />

        {/* Error Display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
            <p className="text-red-400 text-sm">{error}</p>
          </div>
        )}

        {/* Actions */}
        {walletAddress ? (
          <button
            onClick={() => setShowConfirmModal(true)}
            disabled={isRedeeming || card.status !== 'active'}
            className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
          >
            {isRedeeming ? (
              <>
                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Redeeming...</span>
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
        ) : (
          <button
            onClick={onConnectWallet}
            className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-colors flex items-center justify-center space-x-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <span>Connect Wallet to Redeem</span>
          </button>
        )}

        {/* Back Button */}
        <button
          onClick={handleReset}
          className="w-full py-3 px-4 border border-gray-600 text-gray-300 font-semibold rounded-xl hover:bg-gray-700 transition-colors"
        >
          Check Different Card
        </button>

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
    );
  }

  // Initial form state
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 bg-bnb-yellow/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Redeem Gift Card</h2>
        <p className="text-gray-400">
          Enter your gift card details or scan the QR code
        </p>
      </div>

      {/* Access Code Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Access Code</label>
        <input
          type="text"
          value={accessCode}
          onChange={(e) => setAccessCode(formatAccessCode(e.target.value))}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          maxLength={19}
          className="w-full px-4 py-3 bg-bnb-gray border border-gray-600 rounded-lg text-white text-center font-mono text-lg tracking-wider placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bnb-yellow uppercase"
        />
      </div>

      {/* Signature Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Card Signature</label>
        <input
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="0x..."
          className="w-full px-4 py-3 bg-bnb-gray border border-gray-600 rounded-lg text-white font-mono text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bnb-yellow"
        />
        <p className="text-gray-500 text-xs">
          The signature was provided when the gift card was created
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
        onClick={() => handleVerify()}
        disabled={isLoading || !accessCode || !signature}
        className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
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

      {/* Info Section */}
      <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-300 mb-3">How to Redeem</h4>
        <ol className="text-sm text-gray-400 space-y-2">
          <li className="flex items-start">
            <span className="text-bnb-yellow mr-2">1.</span>
            Enter the access code from your gift card
          </li>
          <li className="flex items-start">
            <span className="text-bnb-yellow mr-2">2.</span>
            Enter the card signature (provided by sender)
          </li>
          <li className="flex items-start">
            <span className="text-bnb-yellow mr-2">3.</span>
            Connect your wallet to receive the funds
          </li>
          <li className="flex items-start">
            <span className="text-bnb-yellow mr-2">4.</span>
            Click redeem to claim your gift card
          </li>
        </ol>
      </div>
    </div>
  );
}

export default GiftCardRedeemPage;
