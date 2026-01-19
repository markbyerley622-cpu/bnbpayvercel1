/**
 * Gift Card Create Form Component
 * Allows users to create new BNB Pay Gift Cards
 * Design matches BNBCARDS reference with two-column layout
 */

import { useState, useCallback } from 'react';
import type { Token, NetworkKey, BNBPayCard, GiftCardType } from '../types';
import { giftCardApi, validateAmount, validateAddress, parseAmountInput } from '../services';
import { getTokensForNetwork, getTokenImagePath } from '../services/tokens';
import { useToast } from '../../contexts/ToastContext';
import { GiftCardPreview } from './GiftCardPreview';
import { QRCodeDisplay } from './QRCodeDisplay';
import { ConfirmModal } from './ConfirmModal';

// Token metadata for display
const TOKEN_INFO: Record<string, { name: string; description: string }> = {
  BNB: { name: 'BNB', description: 'Native' },
  USDT: { name: 'USDT', description: 'Tether' },
  USDC: { name: 'USDC', description: 'Circle' },
  USD1: { name: 'USD1', description: 'Stable' },
  WUSD: { name: 'WUSD', description: 'Wrapped' },
  XUSD: { name: 'XUSD', description: 'X-USD' },
};

interface GiftCardCreateFormProps {
  network: NetworkKey;
  walletAddress: string | null;
  onConnectWallet?: () => void;
  onCardCreated?: (card: BNBPayCard, redeemUrl: string) => void;
}

export function GiftCardCreateForm({
  network,
  walletAddress,
  onConnectWallet,
  onCardCreated,
}: GiftCardCreateFormProps) {
  const { showToast } = useToast();

  // Form state
  const [amount, setAmount] = useState('');
  const [token, setToken] = useState<Token>('USDT');
  const [cardType, setCardType] = useState<GiftCardType>('direct');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [senderName, setSenderName] = useState('');
  const [message, setMessage] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [createdCard, setCreatedCard] = useState<BNBPayCard | null>(null);
  const [redeemUrl, setRedeemUrl] = useState<string | null>(null);
  const [createdAccessCode, setCreatedAccessCode] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hoveredToken, setHoveredToken] = useState<Token | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Get available tokens for current network
  const networkType = network === 'bnb' ? 'mainnet' : 'testnet';
  const availableTokens = getTokensForNetwork(networkType).filter((symbol) => symbol !== 'BNB');

  const validateForm = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    // Amount validation
    const amountValidation = validateAmount(amount, 0.01, 10000);
    if (!amountValidation.valid) {
      newErrors.amount = amountValidation.error || 'Invalid amount';
    }

    // Recipient address validation (required for direct cards)
    if (cardType === 'direct') {
      if (!recipientAddress) {
        newErrors.recipientAddress = 'Recipient address is required for direct cards';
      } else {
        const addressValidation = validateAddress(recipientAddress);
        if (!addressValidation.valid) {
          newErrors.recipientAddress = addressValidation.error || 'Invalid address';
        }
      }
    } else if (recipientAddress) {
      const addressValidation = validateAddress(recipientAddress);
      if (!addressValidation.valid) {
        newErrors.recipientAddress = addressValidation.error || 'Invalid address';
      }
    }

    // Token validation
    if (!token) {
      newErrors.token = 'Please select a token';
    }
    if (token === 'BNB') {
      newErrors.token = 'BNB gift cards require escrow and are not supported yet';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [amount, recipientAddress, token, cardType]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

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
        recipientAddress: recipientAddress || undefined,
        message: message || undefined,
        senderName: senderName || undefined,
        expiresInDays,
        network,
        merchantAddress: walletAddress,
        cardType,
      });

      if (result.success && result.card && result.redeemUrl) {
        setCreatedCard(result.card);
        setRedeemUrl(result.redeemUrl);
        setCreatedAccessCode(result.accessCode ?? null);
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
  }, [walletAddress, amount, token, recipientAddress, message, senderName, expiresInDays, network, showToast, onCardCreated, cardType]);

  const handleReset = useCallback(() => {
    setAmount('');
    setRecipientAddress('');
    setCardType('direct');
    setSenderName('');
    setMessage('');
    setExpiresInDays(30);
    setToken('USDT');
    setCreatedCard(null);
    setRedeemUrl(null);
    setCreatedAccessCode(null);
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
        <div className="flex justify-center">
          <GiftCardPreview card={createdCard} />
        </div>

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
              className="flex-1 px-4 py-3 bg-bnb-gray border border-gray-600 rounded-xl text-white text-sm font-mono"
            />
            <button
              onClick={handleCopyLink}
              className="px-4 py-3 bg-bnb-yellow text-bnb-dark font-semibold rounded-xl hover:bg-yellow-500 transition-colors"
            >
              Copy
            </button>
          </div>
          {cardType === 'open' && (
            <p className="text-xs text-gray-400">
              This link includes the claim key. Share it securely.
            </p>
          )}
        </div>

        {/* Access Code Display (direct cards only) */}
        {createdAccessCode && (
          <div className="bg-bnb-gray/50 rounded-xl p-4 border border-bnb-yellow/20">
            <div className="text-center">
              <p className="text-sm text-gray-400 mb-2">Access Code</p>
              <p className="text-2xl font-mono font-bold text-bnb-yellow tracking-wider">
                {createdAccessCode}
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Share this code with the recipient if you do not include it in the link.
              </p>
            </div>
          </div>
        )}

        {/* Create Another Button */}
        <button
          onClick={handleReset}
          className="w-full py-3 px-4 border border-bnb-yellow text-bnb-yellow font-semibold rounded-xl hover:bg-bnb-yellow/10 transition-colors"
        >
          Create Another Gift Card
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className={`grid grid-cols-1 lg:grid-cols-2 gap-8 ${!walletAddress ? 'group' : ''}`}>
        {/* Left Column - Create Form */}
        <div className="card-shadow rounded-2xl p-8 relative">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
            <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
            </svg>
            Create Gift Card
          </h2>

          <form onSubmit={handleSubmit} className="space-y-5">
          {/* Card Type */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Gift Card Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setCardType('direct')}
                className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  cardType === 'direct'
                    ? 'border-bnb-yellow text-bnb-yellow bg-bnb-yellow/10'
                    : 'border-gray-700 text-gray-300 hover:border-bnb-yellow/60'
                }`}
              >
                Direct (Recipient Locked)
              </button>
              <button
                type="button"
                onClick={() => {
                  setCardType('open');
                  setRecipientAddress('');
                }}
                className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                  cardType === 'open'
                    ? 'border-bnb-yellow text-bnb-yellow bg-bnb-yellow/10'
                    : 'border-gray-700 text-gray-300 hover:border-bnb-yellow/60'
                }`}
              >
                Open (Claimable Link)
              </button>
            </div>
            <p className="mt-2 text-xs text-gray-400">
              {cardType === 'direct'
                ? 'Only the specified wallet can redeem this card.'
                : 'Anyone with the link can claim once, then redeem to their wallet.'}
            </p>
          </div>

          {/* Recipient Address */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">
              Recipient Wallet Address {cardType === 'direct' ? <span className="text-red-400">*</span> : <span className="text-gray-500">(optional)</span>}
            </label>
            <input
              type="text"
              name="receiverAddress"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder={cardType === 'direct' ? '0x... recipient wallet' : '0x... (leave empty for open gift card)'}
              disabled={cardType === 'open'}
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors font-mono text-sm ${
                errors.recipientAddress ? 'border-red-500' : 'border-bnb-gray'
              }`}
            />
            {errors.recipientAddress ? (
              <p className="mt-2 text-xs text-red-400">{errors.recipientAddress}</p>
            ) : (
              <p className="mt-2 text-xs text-gray-400">
                {cardType === 'direct'
                  ? 'Recipient wallet is required for direct cards.'
                  : 'Leave empty to allow anyone with the link to claim.'}
              </p>
            )}
          </div>

          {/* Gift Amount with Token Selector Grid */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Gift Amount *</label>
            <input
              type="text"
              name="amount"
              value={amount}
              onChange={(e) => setAmount(parseAmountInput(e.target.value))}
              placeholder="100.00"
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors text-lg font-medium ${
                errors.amount ? 'border-red-500' : 'border-bnb-gray'
              }`}
            />
            {errors.amount && <p className="mt-2 text-xs text-red-400">{errors.amount}</p>}
          </div>

          {/* Token Selector Grid - Like Invoice/Subscription */}
          <div className="form-group">
            <div className="flex items-center justify-between mb-2">
              <label className="text-gray-300 font-semibold text-sm">Select Token</label>
              <span className="text-xs text-bnb-yellow">{token}</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {availableTokens.map((t) => {
                const isSelected = t === token;
                const isHovered = t === hoveredToken;

                // Blur non-selected tokens slightly
                const shouldBlur = !isSelected && token !== null;

                const info = TOKEN_INFO[t] || { name: t, description: '' };

                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setToken(t)}
                    onMouseEnter={() => setHoveredToken(t)}
                    onMouseLeave={() => setHoveredToken(null)}
                    className={`
                      relative flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl
                      border-2 transition-all duration-300 transform
                      cursor-pointer
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
                        src={getTokenImagePath(t)}
                        alt={t}
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

                    {/* Token Description */}
                    <span className={`hidden sm:block text-[10px] ${
                      isSelected ? 'text-bnb-yellow/70' : 'text-gray-500'
                    }`}>
                      {info.description}
                    </span>

                  </button>
                );
              })}
            </div>
          </div>

          {/* Sender Name */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Your Name (Optional)</label>
            <input
              type="text"
              name="senderName"
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="e.g., John"
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors"
            />
          </div>

          {/* Gift Message */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Gift Message (Optional)</label>
            <textarea
              name="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Happy Birthday! Here's some crypto for you..."
              rows={3}
              maxLength={200}
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors resize-none"
            />
            <p className="mt-1 text-xs text-gray-500 text-right">{message.length}/200</p>
          </div>

          {/* Expires In */}
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Expires In</label>
            <select
              name="expiresInDays"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(Number(e.target.value))}
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors"
            >
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={365}>1 year</option>
            </select>
          </div>

          {/* Submit Button with Connect Wallet Hover */}
          <div className="relative group">
            <button
              type={walletAddress ? 'submit' : 'button'}
              onClick={!walletAddress ? onConnectWallet : undefined}
              disabled={isLoading}
              className="w-full py-4 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold text-lg rounded-xl transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-6 h-6" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Creating Gift Card...</span>
                </>
              ) : !walletAddress ? (
                <>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span>Connect Wallet</span>
                </>
              ) : (
                <>
                  <span>Create Gift Card</span>
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
                  </svg>
                </>
              )}
            </button>
            {/* Hover tooltip when wallet not connected */}
            {!walletAddress && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 bg-bnb-gray border border-bnb-yellow/30 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap">
                <p className="text-sm text-gray-300">Connect your wallet to create a gift card</p>
                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-bnb-gray"></div>
              </div>
            )}
          </div>

          {/* Info Box */}
          <div className="mt-4 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
            <p className="text-gray-300">
              <strong className="text-bnb-yellow">
                {cardType === 'open' ? 'Open Gift Card' : 'Direct Gift Card'}:
              </strong>{' '}
              Sends <strong className="text-bnb-yellow">{amount || '0'} {token}</strong>{' '}
              {cardType === 'open' ? 'to the first claimant' : 'to the specified wallet'}.
            </p>
          </div>
        </form>

          {/* Connect Wallet Overlay - appears on hover when wallet not connected */}
          {!walletAddress && (
            <div className="absolute inset-0 bg-bnb-dark/95 backdrop-blur-sm rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto z-10">
              <div className="text-center px-8">
                <img src="/bnbpay-logo.png" alt="BNBPay" className="h-20 w-auto mx-auto mb-6" />
                <h3 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h3>
                <p className="text-gray-400 mb-6">Connect your wallet to create gift cards</p>
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

      {/* Right Column - Card Preview */}
      <div className="card-shadow rounded-2xl p-8">
        <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
          <svg className="w-7 h-7 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
          </svg>
          Card Preview
        </h2>

        <div className="flex flex-col items-center space-y-6">
          {/* Gift Card Preview */}
          <GiftCardPreview
            previewAmount={amount}
            previewToken={token}
            previewNetwork={network}
            showStatus={false}
          />

          <div className="text-center">
            <p className="text-gray-400 text-sm">
              Preview of your gift card. Once created, share the link via Telegram or any messaging app.
            </p>
          </div>
        </div>

        {/* How Gift Cards Work */}
        <div className="mt-8 space-y-4">
          <h3 className="text-lg font-semibold text-white">How Gift Cards Work</h3>
          <div className="space-y-3">
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">1</span>
              </div>
              <p className="text-gray-400 text-sm">You create a gift card and get a shareable link</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">2</span>
              </div>
              <p className="text-gray-400 text-sm">Send the link to the recipient via Telegram</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">3</span>
              </div>
              <p className="text-gray-400 text-sm">They click the link and connect their wallet</p>
            </div>
            <div className="flex items-start space-x-3">
              <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <span className="text-bnb-yellow font-bold text-sm">4</span>
              </div>
              <p className="text-gray-400 text-sm">Funds are transferred directly to their wallet</p>
            </div>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={handleConfirmCreate}
        title="Create Gift Card"
        message={`You are about to create a ${cardType === 'open' ? 'claimable' : 'direct'} gift card for ${amount} ${token}. ${
          cardType === 'direct'
            ? `Only ${recipientAddress.slice(0, 6)}...${recipientAddress.slice(-4)} can redeem it.`
            : 'Anyone with the link can claim once and redeem.'
        }`}
        confirmLabel="Create Gift Card"
        confirmColor="bg-bnb-yellow text-bnb-dark"
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

export default GiftCardCreateForm;
