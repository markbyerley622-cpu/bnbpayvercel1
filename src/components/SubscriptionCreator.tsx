import { useState, useEffect } from 'react';
import type { SubscriptionData } from '../lib/types';
import { SubscriptionModal } from './SubscriptionModal';
import { createSubscriptionPlan, isWalletInstalled, type NetworkType } from '../lib/web3';
import { convertToUSD, getPaymentOptions, getTokensForNetwork, getTokenImagePath, type Token } from '../lib/price-utils';
import { ErrorCode, getSafeMessage, mapToErrorCode, logInternalError, generateReferenceId } from '../lib/error-codes';
import { AlertBanner } from './ErrorUI';
import { TokenSelector } from './TokenSelector';

interface SubscriptionCreatorProps {
  network: NetworkType;
  onSubscriptionCreated?: (subscription: SubscriptionData) => void;
}

export function SubscriptionCreator({ network, onSubscriptionCreated }: SubscriptionCreatorProps) {
  const availableTokens = getTokensForNetwork(network);
  const [formData, setFormData] = useState({
    planName: '',
    price: '',
    interval: 'monthly' as 'monthly' | 'yearly',
    acceptedTokens: [availableTokens[0]] as Token[], // Default to first token (BNB)
  });

  // Update tokens when network changes
  useEffect(() => {
    const tokens = getTokensForNetwork(network);
    setFormData(prev => ({ ...prev, acceptedTokens: [tokens[0]] }));
  }, [network]);

  // Get the primary settlement token (first selected or BNB)
  const primaryToken = formData.acceptedTokens.length > 0 ? formData.acceptedTokens[0] : 'BNB';

  const [loading, setLoading] = useState(false);
  const [generatedSubscription, setGeneratedSubscription] = useState<SubscriptionData | null>(null);

  // Error state - structured for safe display
  const [error, setError] = useState<{
    code: ErrorCode;
    message: string;
    referenceId: string;
    showRetry: boolean;
  } | null>(null);

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Validate form fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.planName.trim()) {
      errors.planName = 'Plan name is required';
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      errors.price = 'Please enter a valid price';
    }

    if (!['monthly', 'yearly'].includes(formData.interval)) {
      errors.interval = 'Please select a billing interval';
    }

    if (formData.acceptedTokens.length === 0) {
      errors.tokens = 'Please select at least one token to accept';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle safe error display - NEVER expose internal details
  const handleError = (err: unknown, context?: Record<string, unknown>) => {
    const errorCode = mapToErrorCode(err);
    const referenceId = logInternalError(errorCode, err, context);

    const nonRetryableCodes = [
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.SUBSCRIPTION_VALIDATION_FAILED,
      ErrorCode.INVALID_SUBSCRIPTION_PRICE,
      ErrorCode.INVALID_MERCHANT_ADDRESS,
      ErrorCode.SIGNATURE_REJECTED,
    ];

    setError({
      code: errorCode,
      message: getSafeMessage(errorCode),
      referenceId,
      showRetry: !nonRetryableCodes.includes(errorCode),
    });
  };

  // Clear error state
  const clearError = () => {
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Validate form first
    if (!validateForm()) {
      return;
    }

    // Check if Web3 wallet is installed
    if (!isWalletInstalled()) {
      setError({
        code: ErrorCode.WALLET_NOT_CONNECTED,
        message: 'Please install a Web3 wallet (OKX, Trust Wallet, etc.) to create subscriptions.',
        referenceId: generateReferenceId(),
        showRetry: false,
      });
      return;
    }

    setLoading(true);

    try {
      // Get connected wallet address
      const { ethers } = await import('ethers');
      if (!window.ethereum) {
        throw new Error('No Web3 wallet available');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const merchantAddress = await signer.getAddress();

      // Convert token price to USD1 equivalent
      const tokenPrice = parseFloat(formData.price);
      const usdValue = convertToUSD(primaryToken as Token, tokenPrice);

      // Get all payment options for this USD amount
      const acceptedTokenOptions = getPaymentOptions(usdValue, network);

      // Create subscription plan on-chain via Web3 wallet
      const { planId, txHash } = await createSubscriptionPlan({
        planName: formData.planName,
        price: usdValue.toFixed(2),
        interval: formData.interval,
        paymentToken: primaryToken,
      });

      console.log('Subscription plan created:', { planId, txHash });

      const subscriptionId = `sub_${planId}_${Date.now()}`;
      const createdAt = Date.now();

      // Encode subscription data in URL so it can be shared without backend
      const subscriptionDataForUrl = {
        id: subscriptionId,
        m: merchantAddress, // merchant
        pn: formData.planName, // plan name
        p: formData.price, // price
        t: primaryToken, // primary settlement token
        i: formData.interval, // interval
        pid: planId, // plan id
        c: createdAt, // created at
        al: formData.acceptedTokens, // allowed tokens for payment
      };
      const encodedData = btoa(JSON.stringify(subscriptionDataForUrl));
      const baseUrl = window.location.origin;
      const paymentLink = `${baseUrl}/subscription/${subscriptionId}?data=${encodeURIComponent(encodedData)}`;

      const finalSubscription: SubscriptionData = {
        type: 'subscription',
        currency: primaryToken, // Settlement in primary selected token
        planName: formData.planName,
        price: formData.price, // Settlement price in selected token
        price_usd1: usdValue.toFixed(2), // USD equivalent for reference
        interval: formData.interval,
        customerEmail: undefined,
        supports_multi_token: formData.acceptedTokens.length > 1, // Multi-token if more than one selected
        settlement: primaryToken, // Settles to primary selected token
        paymentToken: primaryToken as Token,
        paymentAmount: formData.price,
        acceptedTokens: acceptedTokenOptions,
        allowedTokens: formData.acceptedTokens, // Tokens selected by creator
        subscriptionId,
        paymentLink,
        txHash,
        planId,
        merchantAddress,
        createdAt,
      };

      // Save to localStorage - both for merchant list and individual access
      const existingSubscriptions = JSON.parse(localStorage.getItem(`subscriptions_${merchantAddress}`) || '[]');
      existingSubscriptions.push(finalSubscription);
      localStorage.setItem(`subscriptions_${merchantAddress}`, JSON.stringify(existingSubscriptions));

      // Also save individually so anyone with the link can access
      localStorage.setItem(`subscription_${subscriptionId}`, JSON.stringify(finalSubscription));

      setGeneratedSubscription(finalSubscription);

      // Notify parent component (App)
      if (onSubscriptionCreated) {
        onSubscriptionCreated(finalSubscription);
      }
    } catch (err: unknown) {
      // Safe error handling - NEVER expose internal details to UI
      handleError(err, {
        action: 'createSubscription',
        network,
        tokensSelected: formData.acceptedTokens,
        interval: formData.interval,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error Banner - bounded display */}
        {error && (
          <AlertBanner
            message={error.message}
            type="error"
            referenceId={error.referenceId}
            showRetry={error.showRetry}
            onRetry={() => {
              clearError();
              handleSubmit(new Event('submit') as unknown as React.FormEvent);
            }}
            onDismiss={clearError}
          />
        )}

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Plan Name</label>
          <input
            type="text"
            name="planName"
            value={formData.planName}
            onChange={handleChange}
            placeholder="Pro Plan"
            required
            className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors ${
              fieldErrors.planName ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
            }`}
          />
          {fieldErrors.planName && (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.planName}</p>
          )}
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Price</label>
          <div className="relative">
            <input
              type="number"
              name="price"
              value={formData.price}
              onChange={handleChange}
              placeholder="29.99"
              step="0.01"
              min="0.01"
              required
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors pr-24 ${
                fieldErrors.price ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2 border-l-2 border-bnb-yellow/20 pl-3">
              <img
                src={getTokenImagePath(primaryToken as Token)}
                alt={primaryToken}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-bnb-yellow font-semibold">{primaryToken}</span>
            </div>
          </div>
          {fieldErrors.price && (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.price}</p>
          )}
        </div>

        {/* Token Selection Cards - Multi-select */}
        <TokenSelector
          selectedTokens={formData.acceptedTokens}
          onTokensChange={(tokens) => setFormData(prev => ({ ...prev, acceptedTokens: tokens }))}
          network={network}
          showBlurEffect={true}
          multiSelect={true}
        />

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Billing Interval</label>
          <select
            name="interval"
            value={formData.interval}
            onChange={handleChange}
            className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white rounded-xl focus:outline-none transition-colors cursor-pointer ${
              fieldErrors.interval ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
            }`}
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
          {fieldErrors.interval && (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.interval}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold text-base sm:text-lg rounded-xl transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 sm:space-x-3"
        >
          <span>{loading ? 'Creating Subscription...' : 'Create Subscription'}</span>
          {!loading && <img src="/2.png" alt="Coin" className="h-8 w-8 sm:h-10 sm:w-10" />}
        </button>

        <div className="mt-4 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
          <p className="text-gray-300">
            <strong className="text-bnb-yellow">x402 Flex Subscription:</strong>{' '}
            {formData.acceptedTokens.length === 0 ? (
              'Please select at least one token to accept.'
            ) : formData.acceptedTokens.length === 1 ? (
              <>This subscription accepts <strong className="text-bnb-yellow">{formData.acceptedTokens[0]}</strong> only.</>
            ) : (
              <>This subscription accepts <strong className="text-bnb-yellow">{formData.acceptedTokens.join(', ')}</strong>. Subscriber can choose any.</>
            )}
          </p>
        </div>
      </form>

      {generatedSubscription && (
        <SubscriptionModal
          subscription={generatedSubscription}
          onClose={() => setGeneratedSubscription(null)}
        />
      )}
    </>
  );
}
