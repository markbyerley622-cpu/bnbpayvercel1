/**
 * Gift Card Create Form Component
 * Allows users to create new BNB Pay Gift Cards
 */

import { useState, useCallback } from 'react';
import type { Token, NetworkKey, BNBPayCard } from '../types';
import { giftCardApi, validateAmount, validateAddress, parseAmountInput } from '../services';
import { getTokensForNetwork, getTokenImagePath } from '../services/tokens';
import { useToast } from '../../contexts/ToastContext';
import { GiftCardPreview } from './GiftCardPreview';
import { QRCodeDisplay } from './QRCodeDisplay';
import { ConfirmModal } from './ConfirmModal';

interface GiftCardCreateFormProps {
  network: NetworkKey;
  walletAddress: string | null;
  onCardCreated?: (card: BNBPayCard, redeemUrl: string) => void;
}

export function GiftCardCreateForm({
  network,
  walletAddress,
  onCardCreated,
}: GiftCardCreateFormProps) {
  const { showToast } = useToast();

  // Form state
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<Token>('USD1');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [message, setMessage] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [createdCard, setCreatedCard] = useState<BNBPayCard | null>(null);
  const [redeemUrl, setRedeemUrl] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get available tokens for current network
  const networkType = network === 'bnb' ? 'mainnet' : 'testnet';
  const availableTokens = getTokensForNetwork(networkType);

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Amount validation
    const amountValidation = validateAmount(amount, 0.01, 10000);
    if (!amountValidation.valid) {
      newErrors.amount = amountValidation.error || 'Invalid amount';
    }

    // Recipient address validation (optional)
    if (recipientAddress) {
      const addressValidation = validateAddress(recipientAddress);
      if (!addressValidation.valid) {
        newErrors.recipientAddress = addressValidation.error || 'Invalid address';
      }
    }

    // Token validation
    if (!token) {
      newErrors.token = 'Please select a token';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [amount, recipientAddress, token]);

  const handleSubmit = useCallback(async () => {
    if (!walletAddress) {
      showToast('Please connect your wallet first', 'error');
      return;
    }

    if (!validateForm()) {
      showToast('Please fix the form errors', 'error');
      return;
    }

    setShowConfirmModal(true);
  }, [walletAddress, validateForm, showToast]);

  const handleConfirmCreate = useCallback(async () => {
    if (!walletAddress) return;

    setShowConfirmModal(false);
    setIsLoading(true);

    try {
      const result = await giftCardApi.createGiftCard({
        amount: parseAmountInput(amount),
        token,
        recipientAddress: recipientAddress || walletAddress,
        message: message || undefined,
        expiresInDays,
        network,
        merchantAddress: walletAddress,
      });

      if (result.success && result.card && result.redeemUrl) {
        setCreatedCard(result.card);
        setRedeemUrl(result.redeemUrl);
        showToast('Gift card created successfully!', 'success');
        onCardCreated?.(result.card, result.redeemUrl);
      } else {
        showToast(result.error || 'Failed to create gift card', 'error');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create gift card';
      showToast(message, 'error');
    } finally {
      setIsLoading(false);
    }
  }, [walletAddress, amount, token, recipientAddress, message, expiresInDays, network, showToast, onCardCreated]);

  const handleReset = useCallback(() => {
    setAmount('');
    setRecipientAddress('');
    setMessage('');
    setExpiresInDays(30);
    setCreatedCard(null);
    setRedeemUrl(null);
    setErrors({});
  }, []);

  const handleCopyLink = useCallback(() => {
    if (redeemUrl) {
      navigator.clipboard.writeText(redeemUrl);
      showToast('Redemption link copied to clipboard!', 'success');
    }
  }, [redeemUrl, showToast]);

  // If card was created, show success state
  if (createdCard && redeemUrl) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
            </svg>
          </div>
          <h3 className="text-xl font-bold text-white mb-2">Gift Card Created!</h3>
          <p className="text-gray-400 text-sm">Share the link or QR code with the recipient</p>
        </div>

        {/* Card Preview */}
        <GiftCardPreview card={createdCard} />

        {/* QR Code */}
        <div className="bg-white rounded-xl p-6 text-center">
          <QRCodeDisplay value={redeemUrl} size={200} />
          <p className="text-sm text-gray-500 mt-4">Scan to redeem</p>
        </div>

        {/* Redemption Link */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-300">Redemption Link</label>
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={redeemUrl}
              readOnly
              className="flex-1 px-4 py-3 bg-bnb-gray border border-gray-600 rounded-lg text-white text-sm"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-3 bg-bnb-yellow text-bnb-dark font-semibold rounded-lg hover:bg-yellow-500 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Access Code Display */}
        <div className="bg-bnb-gray/50 rounded-xl p-4 border border-bnb-yellow/20">
          <div className="text-center">
            <p className="text-sm text-gray-400 mb-2">Access Code</p>
            <p className="text-2xl font-mono font-bold text-bnb-yellow tracking-wider">
              {createdCard.accessCode}
            </p>
          </div>
        </div>

        {/* Create Another Button */}
        <button
          onClick={handleReset}
          className="w-full py-3 px-4 border border-bnb-yellow text-bnb-yellow font-semibold rounded-lg hover:bg-bnb-yellow/10 transition-colors"
        >
          Create Another Gift Card
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Amount Input */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Amount</label>
        <div className="flex items-center space-x-3">
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(parseAmountInput(e.target.value))}
            placeholder="0.00"
            className={`flex-1 px-4 py-3 bg-bnb-gray border rounded-lg text-white text-lg font-medium placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bnb-yellow ${
              errors.amount ? 'border-red-500' : 'border-gray-600'
            }`}
          />
          {/* Token Selector */}
          <div className="relative">
            <select
              value={token}
              onChange={(e) => setToken(e.target.value as Token)}
              className="appearance-none px-4 py-3 pr-10 bg-bnb-gray border border-gray-600 rounded-lg text-white font-medium focus:outline-none focus:ring-2 focus:ring-bnb-yellow"
            >
              {availableTokens.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
              <img
                src={getTokenImagePath(token)}
                alt={token}
                className="w-5 h-5 rounded-full"
              />
            </div>
          </div>
        </div>
        {errors.amount && (
          <p className="text-red-500 text-sm">{errors.amount}</p>
        )}
      </div>

      {/* Recipient Address (Optional) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          Recipient Address <span className="text-gray-500">(optional)</span>
        </label>
        <input
          type="text"
          value={recipientAddress}
          onChange={(e) => setRecipientAddress(e.target.value)}
          placeholder="0x... (leave empty for open gift card)"
          className={`w-full px-4 py-3 bg-bnb-gray border rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bnb-yellow ${
            errors.recipientAddress ? 'border-red-500' : 'border-gray-600'
          }`}
        />
        {errors.recipientAddress && (
          <p className="text-red-500 text-sm">{errors.recipientAddress}</p>
        )}
        <p className="text-gray-500 text-xs">
          Leave empty to allow anyone with the link to redeem
        </p>
      </div>

      {/* Message (Optional) */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">
          Message <span className="text-gray-500">(optional)</span>
        </label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add a personal message..."
          rows={3}
          maxLength={200}
          className="w-full px-4 py-3 bg-bnb-gray border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-bnb-yellow resize-none"
        />
        <p className="text-gray-500 text-xs text-right">{message.length}/200</p>
      </div>

      {/* Expiry */}
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-300">Expires In</label>
        <select
          value={expiresInDays}
          onChange={(e) => setExpiresInDays(Number(e.target.value))}
          className="w-full px-4 py-3 bg-bnb-gray border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-bnb-yellow"
        >
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
          <option value={365}>1 year</option>
        </select>
      </div>

      {/* Preview Section */}
      <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700">
        <h4 className="text-sm font-medium text-gray-400 mb-3">Preview</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img
              src={getTokenImagePath(token)}
              alt={token}
              className="w-10 h-10 rounded-full"
            />
            <div>
              <p className="text-lg font-bold text-white">
                {amount || '0'} {token}
              </p>
              <p className="text-sm text-gray-400">
                Expires in {expiresInDays} days
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Network</p>
            <p className="text-sm text-white font-medium">
              {network === 'bnb' ? 'BNB Chain' : 'BNB Testnet'}
            </p>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <button
        onClick={handleSubmit}
        disabled={isLoading || !walletAddress}
        className="w-full py-4 px-6 bg-bnb-yellow text-bnb-dark font-bold rounded-xl hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
      >
        {isLoading ? (
          <>
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span>Creating Gift Card...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
            </svg>
            <span>Create Gift Card</span>
          </>
        )}
      </button>

      {!walletAddress && (
        <p className="text-center text-amber-500 text-sm">
          Please connect your wallet to create a gift card
        </p>
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmCreate}
        title="Create Gift Card"
        message={`You are about to create a gift card for ${amount} ${token}. This will be redeemable ${
          recipientAddress ? `by ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)}` : 'by anyone with the link'
        }.`}
        confirmLabel="Create Gift Card"
        confirmColor="bg-bnb-yellow text-bnb-dark"
      />
    </div>
  );
}

export default GiftCardCreateForm;
