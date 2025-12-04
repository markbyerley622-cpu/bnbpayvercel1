import { useState, useEffect } from 'react';
import type { SubscriptionData } from '../lib/types';
import { SubscriptionModal } from './SubscriptionModal';
import { createSubscriptionPlan, isMetaMaskInstalled, type NetworkType } from '../lib/web3';
import { convertToUSD, getPaymentOptions, getTokensForNetwork, getTokenImagePath, type Token } from '../lib/price-utils';

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
    token: availableTokens[0], // Default to first token
  });

  // Update token when network changes
  useEffect(() => {
    const tokens = getTokensForNetwork(network);
    setFormData(prev => ({ ...prev, token: tokens[0] }));
  }, [network]);

  const [loading, setLoading] = useState(false);
  const [generatedSubscription, setGeneratedSubscription] = useState<SubscriptionData | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if MetaMask is installed
    if (!isMetaMaskInstalled()) {
      alert('MetaMask is not installed. Please install MetaMask to create subscriptions on-chain.');
      return;
    }

    setLoading(true);

    try {
      // Get connected wallet address
      const { ethers } = await import('ethers');
      if (!window.ethereum) {
        throw new Error('MetaMask not available');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const merchantAddress = await signer.getAddress();

      // Convert token price to USD1 equivalent
      const tokenPrice = parseFloat(formData.price);
      const usdValue = convertToUSD(formData.token as Token, tokenPrice);

      // Get all payment options for this USD amount
      const acceptedTokens = getPaymentOptions(usdValue, network);

      // Create subscription plan on-chain via MetaMask
      const { planId, txHash } = await createSubscriptionPlan({
        planName: formData.planName,
        price: usdValue.toFixed(2),
        interval: formData.interval,
        paymentToken: formData.token,
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
        t: formData.token, // token
        i: formData.interval, // interval
        pid: planId, // plan id
        c: createdAt, // created at
      };
      const encodedData = btoa(JSON.stringify(subscriptionDataForUrl));
      const baseUrl = window.location.origin;
      const paymentLink = `${baseUrl}/subscription/${subscriptionId}?data=${encodeURIComponent(encodedData)}`;

      const finalSubscription: SubscriptionData = {
        type: 'subscription',
        currency: formData.token, // Settlement in selected token
        planName: formData.planName,
        price: formData.price, // Settlement price in selected token
        price_usd1: usdValue.toFixed(2), // USD equivalent for reference
        interval: formData.interval,
        customerEmail: undefined,
        supports_multi_token: false, // Single token settlement
        settlement: formData.token, // Settles to selected token
        paymentToken: formData.token as Token,
        paymentAmount: formData.price,
        acceptedTokens,
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
    } catch (error: any) {
      console.error('Failed to create subscription:', error);
      alert(error.message || 'Failed to create subscription. Please try again.');
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
        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Plan Name</label>
          <input
            type="text"
            name="planName"
            value={formData.planName}
            onChange={handleChange}
            placeholder="Pro Plan"
            required
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors"
          />
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
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors pr-40"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2 border-l-2 border-bnb-yellow/20 pl-3">
              <img
                src={getTokenImagePath(formData.token as Token)}
                alt={formData.token}
                className="h-6 w-6 rounded-full"
              />
              <select
                name="token"
                value={formData.token}
                onChange={handleChange}
                className="bg-bnb-gray text-white pr-6 py-2 rounded-lg focus:outline-none cursor-pointer appearance-none font-semibold"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23F0B90B'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.25rem center', backgroundSize: '1rem' }}
              >
                {availableTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Billing Interval</label>
          <select
            name="interval"
            value={formData.interval}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors cursor-pointer"
          >
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold text-lg rounded-xl transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
        >
          <span>{loading ? 'Creating Subscription...' : 'Create Subscription'}</span>
          {!loading && <img src="/2.png" alt="Coin" className="h-6 w-6" />}
        </button>

        <div className="mt-4 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
          <p className="text-gray-300">
            <strong className="text-bnb-yellow">x402 Flex Subscription:</strong> This subscription will be charged in <strong className="text-bnb-yellow">{formData.token}</strong> and settled directly to your wallet.
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
