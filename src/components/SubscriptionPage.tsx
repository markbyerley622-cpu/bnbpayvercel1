import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import { AgentFlowPanel } from './AgentFlowPanel';
import { Header } from './Header';
import { FloatingParticles } from './FloatingParticles';
import { SubscriptionReceipt } from './SubscriptionReceipt';
import type { SubscriptionData } from '../lib/types';
import type { NetworkType } from '../lib/web3';
import { getCurrentNetwork, formatAddress, connectWallet, payInvoiceThroughRouter } from '../lib/web3';
import { getTokenImagePath, getTokenDisplayName, getTokensForNetwork, type Token, convertFromUSD, convertToUSD, formatAmount } from '../lib/price-utils';

interface SubscriptionPageProps {
  subscriptionId: string;
}

export function SubscriptionPage({ subscriptionId }: SubscriptionPageProps) {
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'pending' | 'processing' | 'paid' | 'failed'>('pending');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [selectedPayToken, setSelectedPayToken] = useState<Token>('BNB');
  const [showReceipt, setShowReceipt] = useState(false);
  const [paidAt, setPaidAt] = useState<number | null>(null);
  const [paidToken, setPaidToken] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const qrCanvasDesktopRef = useRef<HTMLCanvasElement>(null);
  const qrCanvasMobileRef = useRef<HTMLCanvasElement>(null);

  // Generate QR code for current page URL - Desktop
  useEffect(() => {
    if (qrCanvasDesktopRef.current && subscription) {
      const currentUrl = window.location.href;
      QRCode.toCanvas(
        qrCanvasDesktopRef.current,
        currentUrl,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#0B0E11',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error (desktop):', error);
        }
      );
    }
  }, [subscription]);

  // Generate QR code for current page URL - Mobile
  useEffect(() => {
    if (qrCanvasMobileRef.current && subscription) {
      const currentUrl = window.location.href;
      QRCode.toCanvas(
        qrCanvasMobileRef.current,
        currentUrl,
        {
          width: 160,
          margin: 2,
          color: {
            dark: '#0B0E11',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error (mobile):', error);
        }
      );
    }
  }, [subscription]);

  useEffect(() => {
    setMounted(true);
    getCurrentNetwork().then(detectedNetwork => {
      setNetwork(detectedNetwork);
    });
  }, []);

  useEffect(() => {
    loadSubscription();
  }, [subscriptionId]);

  const loadSubscription = () => {
    setLoading(true);
    setError(null);

    let foundSubscription: SubscriptionData | null = null;

    // First, try to decode subscription data from URL query parameter
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const encodedData = urlParams.get('data');
      if (encodedData) {
        const decodedJson = atob(decodeURIComponent(encodedData));
        const urlData = JSON.parse(decodedJson);

        // Reconstruct subscription from URL data
        foundSubscription = {
          type: 'subscription',
          subscriptionId: urlData.id,
          merchantAddress: urlData.m,
          planName: urlData.pn,
          price: urlData.p,
          paymentAmount: urlData.p,
          paymentToken: urlData.t,
          currency: urlData.t,
          settlement: urlData.t,
          interval: urlData.i,
          planId: urlData.pid,
          createdAt: urlData.c,
          supports_multi_token: false,
          paymentLink: window.location.href,
        };

        // Save to localStorage for future access
        localStorage.setItem(`subscription_${subscriptionId}`, JSON.stringify(foundSubscription));
      }
    } catch (e) {
      console.error('Failed to decode subscription from URL:', e);
    }

    // If not found in URL, check individual subscription storage
    if (!foundSubscription) {
      try {
        const individualSubscription = localStorage.getItem(`subscription_${subscriptionId}`);
        if (individualSubscription) {
          foundSubscription = JSON.parse(individualSubscription);
        }
      } catch (e) {
        console.error('Failed to parse individual subscription:', e);
      }
    }

    // If still not found, search through merchant subscription lists
    if (!foundSubscription) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('subscriptions_')) {
          try {
            const subscriptions: SubscriptionData[] = JSON.parse(localStorage.getItem(key) || '[]');
            const found = subscriptions.find(sub => sub.subscriptionId === subscriptionId);
            if (found) {
              foundSubscription = found;
              break;
            }
          } catch (e) {
            console.error('Failed to parse subscriptions from', key, e);
          }
        }
      }
    }

    if (foundSubscription) {
      setSubscription(foundSubscription);
    } else {
      setError('Subscription not found. The subscription may have been deleted or the link is invalid.');
    }

    setLoading(false);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Calculate the amount to pay in the selected token
  const getPaymentAmountInToken = (token: Token): string => {
    if (!subscription) return '0';
    const settlementToken = (subscription.paymentToken || subscription.settlement || 'BNB') as Token;
    const settlementAmount = parseFloat(subscription.price || subscription.paymentAmount || '0');

    // If paying with the same token as settlement, return the original amount
    if (token === settlementToken) {
      return subscription.price || subscription.paymentAmount || '0';
    }

    // Convert: settlement amount -> USD -> target token amount
    const usdValue = convertToUSD(settlementToken, settlementAmount);
    const tokenAmount = convertFromUSD(token, usdValue);

    // Format based on token type
    if (token === 'BNB') {
      return formatAmount(tokenAmount, 6);
    }
    return formatAmount(tokenAmount, 2);
  };

  // Get allowed tokens for this subscription
  const getAllowedTokens = (): Token[] => {
    if (subscription?.acceptedTokens && subscription.acceptedTokens.length > 0) {
      return subscription.acceptedTokens.map(t => t.token);
    }
    // Default to all network tokens
    return getTokensForNetwork(network);
  };

  const handlePayNow = async () => {
    if (!subscription) return;

    // Check if wallet is connected
    let currentWallet = walletAddress;
    if (!currentWallet) {
      try {
        const address = await connectWallet(network);
        setWalletAddress(address);
        currentWallet = address;
      } catch (err) {
        console.error('Failed to connect wallet:', err);
        return;
      }
    }

    setPaymentStatus('processing');
    setPaymentError(null);

    try {
      // Get merchant address and payment details
      const merchant = subscription.merchantAddress;
      if (!merchant) {
        throw new Error('No merchant address specified');
      }

      // Use selected token for payment
      const tokenSymbol = selectedPayToken;
      const amount = getPaymentAmountInToken(selectedPayToken);

      // Get settlement token (what the merchant wants to receive)
      const settlementToken = subscription.paymentToken || subscription.settlement || 'BNB';

      console.log('Processing subscription payment through BNBPayRouter:', {
        merchant,
        amount,
        paymentToken: tokenSymbol,
        settlementToken,
        subscriptionId: subscription.subscriptionId,
        network,
      });

      // Generate a unique subscription payment ID
      const subscriptionPaymentId = `sub_${subscription.subscriptionId}_${Date.now()}`;

      // Pay through BNBPayRouter contract for proper settlement
      const result = await payInvoiceThroughRouter({
        merchantAddress: merchant,
        amount: amount,
        paymentToken: tokenSymbol,
        settlementToken: settlementToken,
        invoiceId: subscriptionPaymentId,
        resourceId: subscription.subscriptionId ? ethers.id(`bnbpay:subscription:${subscription.subscriptionId}`) : undefined,
        network,
      });

      console.log('Subscription payment successful:', result);

      const now = Date.now();
      setTxHash(result.txHash);
      setPaymentStatus('paid');
      setPaidAt(now);
      setPaidToken(tokenSymbol);
      setPaidAmount(amount);

      // Update subscription in localStorage to mark as paid
      try {
        const subscriptionKey = `subscription_${subscription.subscriptionId}`;
        const subscriptionsKey = 'bnbpay_subscriptions';

        // Update individual subscription
        const updatedSubscription = {
          ...subscription,
          status: 'paid',
          lastPaidAt: now,
          paidBy: currentWallet,
          lastTxHash: result.txHash,
          paymentId: result.paymentId,
          paidToken: tokenSymbol,
          paidAmount: amount,
        };
        localStorage.setItem(subscriptionKey, JSON.stringify(updatedSubscription));

        // Update in subscriptions list
        const existingSubscriptions = localStorage.getItem(subscriptionsKey);
        if (existingSubscriptions) {
          const subscriptions = JSON.parse(existingSubscriptions);
          const updatedList = subscriptions.map((sub: any) =>
            sub.subscriptionId === subscription.subscriptionId
              ? { ...sub, status: 'paid', lastPaidAt: now, paidBy: currentWallet, lastTxHash: result.txHash, paymentId: result.paymentId, paidToken: tokenSymbol, paidAmount: amount }
              : sub
          );
          localStorage.setItem(subscriptionsKey, JSON.stringify(updatedList));
        }

        // Store payment record
        const paymentKey = `subscription_payment_${subscription.subscriptionId}_${now}`;
        const paymentRecord = {
          subscriptionId: subscription.subscriptionId,
          txHash: result.txHash,
          paymentId: result.paymentId,
          paidBy: currentWallet,
          paidAt: now,
          amount: amount,
          token: tokenSymbol,
          settlementAmount: subscription.price || subscription.paymentAmount,
          settlementToken: settlementToken,
          merchant: merchant,
          network: network,
          routedThroughContract: true,
        };
        localStorage.setItem(paymentKey, JSON.stringify(paymentRecord));

        // Update subscription state
        setSubscription(updatedSubscription);

        // Show receipt
        setShowReceipt(true);
      } catch (e) {
        console.error('Failed to update subscription in localStorage:', e);
      }
    } catch (err: any) {
      console.error('Payment failed:', err);
      setPaymentStatus('failed');

      // User rejected transaction
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setPaymentError('Transaction rejected by user');
      } else if (err.message?.includes('insufficient funds')) {
        setPaymentError('Insufficient funds for this transaction');
      } else if (err.message?.includes('allowance')) {
        setPaymentError('Token approval failed. Please try again.');
      } else {
        setPaymentError(err.message || 'Payment failed. Please try again.');
      }
    }
  };

  if (loading) {
    return (
      <>
        <FloatingParticles />
        <div className="min-h-screen bg-bnb-dark flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-bnb-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading subscription...</p>
          </div>
        </div>
      </>
    );
  }

  if (error || !subscription) {
    return (
      <>
        <FloatingParticles />
        <div className="min-h-screen bg-bnb-dark flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <svg className="w-20 h-20 mx-auto text-red-400/50 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            <h2 className="text-2xl font-bold text-white mb-4">Subscription Not Found</h2>
            <p className="text-gray-400 mb-6">{error}</p>
            <a
              href="/"
              className="inline-flex items-center space-x-2 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold px-6 py-3 rounded-xl transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              <span>Go Home</span>
            </a>
          </div>
        </div>
      </>
    );
  }

  const settlementToken = subscription.settlement || subscription.paymentToken || 'BNB';
  const paymentAmount = subscription.paymentAmount || subscription.price || '0';
  const displayPaidToken = paidToken || settlementToken;
  const displayPaidAmount = paidAmount || paymentAmount;
  const merchantAddress = subscription.merchantAddress || '';

  // Payment Success Screen (similar to InvoicePage)
  if (paymentStatus === 'paid' && txHash) {
    return (
      <>
        <FloatingParticles />
        {/* Receipt Modal */}
        {showReceipt && (
          <SubscriptionReceipt
            subscriptionId={subscription.subscriptionId || ''}
            planName={subscription.planName}
            interval={subscription.interval}
            amount={paymentAmount}
            token={settlementToken}
            paidToken={displayPaidToken}
            paidAmount={displayPaidAmount}
            merchantAddress={merchantAddress}
            payerAddress={walletAddress || ''}
            txHash={txHash}
            network={network}
            paidAt={paidAt || Date.now()}
            onClose={() => setShowReceipt(false)}
          />
        )}
        <div className="min-h-screen bg-bnb-dark content-wrapper flex items-center justify-center relative">
          {/* Background glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-bnb-yellow/5 rounded-full blur-3xl"></div>
          </div>

          <div className={`max-w-md mx-auto px-6 text-center relative z-10 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Success Icon */}
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-white mb-2">Subscription Activated!</h1>
            <p className="text-gray-400 mb-2">{subscription.planName}</p>
            <p className="text-purple-400 text-sm mb-8">{subscription.interval === 'monthly' ? 'Monthly' : 'Yearly'} billing</p>

            {/* Payment Details */}
            <div className="card-shadow rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <span className="text-4xl font-bold text-green-500">{displayPaidAmount}</span>
                <img
                  src={getTokenImagePath(displayPaidToken)}
                  alt={displayPaidToken}
                  className="h-10 w-10 rounded-full"
                />
              </div>
              {displayPaidToken !== settlementToken && (
                <p className="text-gray-500 text-xs mb-2">
                  Subscription price: {paymentAmount} {getTokenDisplayName(settlementToken)}
                </p>
              )}
              <p className="text-gray-400 text-sm mb-4">Paid to {formatAddress(merchantAddress)}</p>

              <a
                href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 text-purple-400 hover:text-purple-300 text-sm"
              >
                <span>View Transaction</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
              </a>

              {/* Subscription Link */}
              <div className="mt-4 pt-4 border-t border-bnb-gray/30">
                <p className="text-gray-500 text-xs mb-2">Subscription Link</p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-bnb-gray/30 text-gray-400 text-xs font-mono px-3 py-2 rounded-lg overflow-hidden text-ellipsis whitespace-nowrap">
                    {window.location.href}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500 text-purple-400 hover:text-white rounded-lg transition-all text-xs font-semibold flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* View Receipt Button */}
            <button
              onClick={() => setShowReceipt(true)}
              className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-500 to-bnb-yellow hover:opacity-90 text-white font-bold py-4 px-6 rounded-xl transition-all mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>View Receipt</span>
            </button>

            <a
              href="/"
              className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              <span>Back to Home</span>
            </a>

            {/* Powered by Footer */}
            <div className="mt-12">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <span>Powered by</span>
                <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                  <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Floating Particles Background */}
      <FloatingParticles />

      <div className="min-h-screen bg-bnb-dark content-wrapper relative">
        {/* Background glow effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-500/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-bnb-yellow/5 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-bnb-yellow/3 to-transparent rounded-full"></div>
        </div>

        {/* Header */}
        <Header
          network={network}
          onNetworkChange={setNetwork}
          onWalletChanged={setWalletAddress}
          title="Subscription"
          showNav={true}
        />

        {/* Main Content */}
        <main className="relative z-10 max-w-6xl mx-auto px-4 py-8 md:py-12">
          {/* Desktop Layout (lg and up) */}
          <div className={`hidden lg:grid lg:grid-cols-2 gap-8 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Left Column - Subscription Details */}
            <div className="space-y-6">
              {/* Header Card */}
              <div className="card-shadow rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500/20 to-bnb-yellow/10 p-6 border-b border-bnb-gray">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                      </div>
                      <div>
                        <span className="text-purple-400 font-semibold text-sm">Recurring Subscription</span>
                        <p className="text-gray-500 text-xs">{network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}</p>
                      </div>
                    </div>
                    <span className="px-4 py-1.5 bg-purple-500/20 text-purple-400 text-sm font-semibold rounded-full capitalize">
                      {subscription.interval}
                    </span>
                  </div>
                  <h1 className="text-2xl font-bold text-white">{subscription.planName}</h1>
                  <p className="text-gray-400 text-sm mt-2">Created {formatDate(subscription.createdAt)}</p>
                </div>

                {/* Amount Display */}
                <div className="p-8 text-center bg-gradient-to-b from-bnb-gray/20 to-transparent">
                  <p className="text-gray-400 text-sm mb-3">Subscription Price</p>
                  <div className="flex items-center justify-center space-x-4">
                    <span className="text-6xl font-bold text-bnb-yellow">{subscription.price || subscription.price_usd1}</span>
                    <div className="flex flex-col items-center">
                      <img
                        src={getTokenImagePath(settlementToken)}
                        alt={settlementToken}
                        className="h-14 w-14 rounded-full mb-1"
                      />
                      <span className="text-lg font-semibold text-gray-300">{getTokenDisplayName(settlementToken)}</span>
                    </div>
                  </div>
                  <p className="text-gray-500 text-sm mt-3">
                    per {subscription.interval === 'monthly' ? 'month' : 'year'}
                  </p>
                </div>
              </div>

              {/* Subscription Details Card */}
              <div className="card-shadow rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Subscription Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-bnb-gray/20 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Payment Token</p>
                    <div className="flex items-center space-x-2">
                      <img
                        src={getTokenImagePath(subscription.paymentToken || 'BNB')}
                        alt={subscription.paymentToken}
                        className="h-5 w-5 rounded-full"
                      />
                      <span className="text-white font-semibold">{getTokenDisplayName(subscription.paymentToken || 'BNB')}</span>
                    </div>
                  </div>
                  <div className="p-3 bg-bnb-gray/20 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Payment Amount</p>
                    <p className="text-white font-semibold">{subscription.paymentAmount}</p>
                  </div>
                  {subscription.planId !== undefined && (
                    <div className="p-3 bg-bnb-gray/20 rounded-xl">
                      <p className="text-gray-500 text-xs mb-1">Plan ID</p>
                      <p className="text-white font-semibold">#{subscription.planId}</p>
                    </div>
                  )}
                  <div className="p-3 bg-bnb-gray/20 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Subscription ID</p>
                    <p className="text-white font-mono text-sm truncate">{subscription.subscriptionId}</p>
                  </div>
                  {subscription.merchantAddress && (
                    <div className="p-3 bg-bnb-gray/20 rounded-xl col-span-2">
                      <p className="text-gray-500 text-xs mb-1">Merchant Address</p>
                      <div className="flex items-center justify-between">
                        <p className="text-white font-mono text-sm">{subscription.merchantAddress}</p>
                        <a
                          href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/address/${subscription.merchantAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-bnb-yellow hover:text-yellow-500 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                          </svg>
                        </a>
                      </div>
                    </div>
                  )}
                  {subscription.txHash && (
                    <div className="p-3 bg-bnb-gray/20 rounded-xl col-span-2">
                      <p className="text-gray-500 text-xs mb-1">Transaction Hash</p>
                      <a
                        href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${subscription.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bnb-yellow font-mono text-sm hover:underline block truncate"
                      >
                        {subscription.txHash}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Accepted Tokens Card */}
              {subscription.acceptedTokens && subscription.acceptedTokens.length > 0 && (
                <div className="card-shadow rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                    <svg className="w-5 h-5 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                    Accepted Payment Tokens
                  </h3>
                  <div className="flex flex-wrap gap-3">
                    {subscription.acceptedTokens.map((tokenInfo, index) => (
                      <div key={index} className="flex items-center space-x-2 bg-bnb-gray/30 px-4 py-2.5 rounded-xl">
                        <img
                          src={getTokenImagePath(tokenInfo.token)}
                          alt={tokenInfo.token}
                          className="h-6 w-6 rounded-full"
                        />
                        <span className="text-white font-medium">{getTokenDisplayName(tokenInfo.token)}</span>
                        <span className="text-gray-400 text-sm">({tokenInfo.tokenAmount})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - QR Code & Actions */}
            <div className="space-y-6">
              {/* QR Code Card */}
              <div className="card-shadow rounded-2xl p-6">
                <div className="flex flex-col items-center text-center mb-6">
                  <p className="text-white font-semibold mb-1">Scan to Subscribe</p>
                  <p className="text-gray-500 text-xs mb-4">Share this QR code with customers</p>
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <canvas
                      ref={qrCanvasDesktopRef}
                      style={{ width: '200px', height: '200px', display: 'block' }}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={window.location.href}
                    className="flex-1 bg-bnb-gray/30 text-gray-300 text-sm font-mono px-4 py-3 rounded-xl border border-bnb-gray focus:outline-none truncate"
                  />
                  <button
                    onClick={copyLink}
                    className={`px-4 py-3 rounded-xl transition-all font-semibold whitespace-nowrap ${
                      linkCopied
                        ? 'bg-green-500 text-white'
                        : 'bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark'
                    }`}
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              {/* Token Selection Card */}
              <div className="card-shadow rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 text-purple-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Pay With
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {getAllowedTokens().map((token) => {
                    const amount = getPaymentAmountInToken(token);
                    const isSelected = selectedPayToken === token;
                    return (
                      <button
                        key={token}
                        onClick={() => setSelectedPayToken(token)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-bnb-gray bg-bnb-gray/20 hover:border-purple-500/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={getTokenImagePath(token)}
                            alt={token}
                            className="h-8 w-8 rounded-full"
                          />
                          <div className="text-left">
                            <p className={`font-bold ${isSelected ? 'text-purple-400' : 'text-white'}`}>
                              {amount}
                            </p>
                            <p className="text-gray-400 text-xs">{getTokenDisplayName(token)}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 flex items-center justify-center">
                            <svg className="w-4 h-4 text-purple-400" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedPayToken !== settlementToken && (
                  <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                    <div className="flex items-start space-x-2">
                      <svg className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <div className="text-xs">
                        <p className="text-purple-300 font-semibold mb-1">Different Token Selected</p>
                        <p className="text-purple-300/80">
                          Subscription price: <strong>{subscription.price} {getTokenDisplayName(settlementToken)}</strong>. You will pay <strong>{getPaymentAmountInToken(selectedPayToken)} {getTokenDisplayName(selectedPayToken)}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-gray-500 text-xs mt-3 text-center">
                  Subscription requested: {subscription.price} {getTokenDisplayName(settlementToken)}
                </p>
              </div>

              {/* Pay Now Button Card */}
              <div className="card-shadow rounded-2xl p-6">
                {paymentStatus === 'failed' && paymentError && (
                  <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm text-center">{paymentError}</p>
                  </div>
                )}

                {paymentStatus === 'paid' && txHash && (
                  <div className="mb-4 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
                    <p className="text-green-400 font-semibold mb-2">Subscription Payment Successful!</p>
                    <a
                      href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm inline-flex items-center space-x-1"
                    >
                      <span>View Transaction</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                      </svg>
                    </a>
                    <button
                      onClick={() => setShowReceipt(true)}
                      className="mt-3 w-full flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      <span>View Receipt</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={handlePayNow}
                  disabled={paymentStatus === 'processing' || paymentStatus === 'paid'}
                  className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-purple-500 to-bnb-yellow hover:opacity-90 disabled:opacity-50 text-white font-bold text-lg py-5 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg"
                >
                  {paymentStatus === 'processing' ? (
                    <>
                      <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing...</span>
                    </>
                  ) : paymentStatus === 'paid' ? (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span>Subscribed</span>
                    </>
                  ) : (
                    <>
                      <span>Pay {getPaymentAmountInToken(selectedPayToken)} {getTokenDisplayName(selectedPayToken)}</span>
                      <img src="/2.png" alt="" className="h-8 w-8" />
                    </>
                  )}
                </button>
                {!walletAddress && paymentStatus === 'pending' && (
                  <p className="text-gray-500 text-sm text-center mt-4">
                    Click to connect your wallet and pay
                  </p>
                )}
              </div>

              {/* Agent/MCP Panel */}
              <AgentFlowPanel data={subscription} walletAddress={walletAddress} network={network} />

              {/* Navigation Links */}
              <div className="flex items-center justify-center space-x-6">
                <a
                  href="/"
                  className="inline-flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow font-semibold transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                  </svg>
                  <span>Back to Home</span>
                </a>
                <a
                  href="/history.html"
                  className="inline-flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow font-semibold transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>View History</span>
                </a>
              </div>

              {/* Powered by Footer */}
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                  <span>Powered by</span>
                  <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                    <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center space-x-1 text-xs text-gray-600">
                  <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                  </svg>
                  <span>Secured by BNB Chain</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Layout (below lg) */}
          <div className={`lg:hidden ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Subscription Card */}
            <div className="card-shadow rounded-2xl p-6 md:p-8 mb-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h2 className="text-xl md:text-2xl font-bold text-white">{subscription.planName}</h2>
                    <span className="px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded-full capitalize">
                      {subscription.interval}
                    </span>
                  </div>
                  <p className="text-gray-400 text-sm">Created {formatDate(subscription.createdAt)}</p>
                </div>
                <div className="text-right">
                  <div className="flex items-center justify-end space-x-3">
                    <p className="text-3xl md:text-4xl font-bold text-bnb-yellow">{subscription.price || subscription.price_usd1}</p>
                    <img
                      src={getTokenImagePath(settlementToken)}
                      alt={settlementToken}
                      className="h-8 w-8 md:h-10 md:w-10 rounded-full"
                    />
                  </div>
                  <p className="text-gray-500 text-sm mt-1">
                    {getTokenDisplayName(settlementToken)} per {subscription.interval === 'monthly' ? 'month' : 'year'}
                  </p>
                </div>
              </div>

              {/* Subscription Pricing Box */}
              <div className="p-4 md:p-6 bg-bnb-gray/30 rounded-xl mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Subscription Price</p>
                    <p className="text-xl md:text-2xl font-bold text-bnb-yellow">
                      {subscription.price || subscription.price_usd1} {getTokenDisplayName(settlementToken)}
                    </p>
                    <p className="text-gray-500 text-sm">per {subscription.interval === 'monthly' ? 'month' : 'year'}</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <img
                      src={getTokenImagePath(settlementToken)}
                      alt={settlementToken}
                      className="h-10 w-10 md:h-12 md:w-12 rounded-full"
                    />
                    <div>
                      <p className="text-white font-semibold">{getTokenDisplayName(settlementToken)}</p>
                      <p className="text-gray-400 text-sm">Payment token</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Subscription Details Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 pt-6 border-t border-bnb-gray">
                <div>
                  <p className="text-gray-500 text-sm mb-1">Payment Token</p>
                  <div className="flex items-center space-x-2">
                    <img
                      src={getTokenImagePath(subscription.paymentToken || 'BNB')}
                      alt={subscription.paymentToken}
                      className="h-5 w-5 rounded-full"
                    />
                    <span className="text-white font-semibold">{getTokenDisplayName(subscription.paymentToken || 'BNB')}</span>
                  </div>
                </div>
                <div>
                  <p className="text-gray-500 text-sm mb-1">Payment Amount</p>
                  <p className="text-white font-semibold">{subscription.paymentAmount}</p>
                </div>
                {subscription.planId !== undefined && (
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Plan ID</p>
                    <p className="text-white font-semibold">#{subscription.planId}</p>
                  </div>
                )}
                <div>
                  <p className="text-gray-500 text-sm mb-1">Subscription ID</p>
                  <p className="text-white font-mono text-sm">{subscription.subscriptionId?.slice(0, 16)}...</p>
                </div>
                {subscription.merchantAddress && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-sm mb-1">Merchant / Payee Address</p>
                    <p className="text-white font-mono text-sm">{formatAddress(subscription.merchantAddress)}</p>
                  </div>
                )}
                {subscription.txHash && (
                  <div className="col-span-2">
                    <p className="text-gray-500 text-sm mb-1">Transaction Hash</p>
                    <a
                      href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${subscription.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-bnb-yellow font-mono text-sm hover:underline"
                    >
                      {subscription.txHash.slice(0, 24)}...
                    </a>
                  </div>
                )}
              </div>

              {/* Accepted Tokens */}
              {subscription.acceptedTokens && subscription.acceptedTokens.length > 0 && (
                <div className="mt-6 pt-6 border-t border-bnb-gray">
                  <p className="text-gray-500 text-sm mb-3">Accepted Payment Tokens</p>
                  <div className="flex flex-wrap gap-3">
                    {subscription.acceptedTokens.map((tokenInfo, index) => (
                      <div key={index} className="flex items-center space-x-2 bg-bnb-gray/30 px-3 py-2 rounded-lg">
                        <img
                          src={getTokenImagePath(tokenInfo.token)}
                          alt={tokenInfo.token}
                          className="h-5 w-5 rounded-full"
                        />
                        <span className="text-white font-medium">{getTokenDisplayName(tokenInfo.token)}</span>
                        <span className="text-gray-400 text-sm">({tokenInfo.tokenAmount})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* QR Code & Copy Link Section */}
              <div className="mt-6 pt-6 border-t border-bnb-gray">
                <div className="flex flex-col items-center text-center mb-6">
                  <p className="text-gray-400 text-sm mb-1">Scan to Subscribe</p>
                  <p className="text-gray-500 text-xs mb-4">Share this QR code with customers</p>
                  <div className="bg-white p-3 rounded-xl shadow-lg inline-block">
                    <canvas
                      ref={qrCanvasMobileRef}
                      style={{ width: '160px', height: '160px', display: 'block' }}
                    />
                  </div>
                </div>
                <p className="text-gray-500 text-sm mb-2">Subscription Link</p>
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    readOnly
                    value={window.location.href}
                    className="flex-1 bg-bnb-gray/30 text-gray-300 text-sm font-mono px-4 py-3 rounded-xl border border-bnb-gray focus:outline-none truncate"
                  />
                  <button
                    onClick={copyLink}
                    className={`px-4 py-3 rounded-xl transition-all font-semibold whitespace-nowrap ${
                      linkCopied
                        ? 'bg-green-500 text-white'
                        : 'bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark'
                    }`}
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              {/* Token Selection (Mobile) */}
              <div className="mt-6 pt-6 border-t border-bnb-gray">
                <p className="text-gray-400 text-sm mb-3">Pay With</p>
                <div className="grid grid-cols-2 gap-2">
                  {getAllowedTokens().map((token) => {
                    const amount = getPaymentAmountInToken(token);
                    const isSelected = selectedPayToken === token;
                    return (
                      <button
                        key={token}
                        onClick={() => setSelectedPayToken(token)}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-purple-500 bg-purple-500/10'
                            : 'border-bnb-gray bg-bnb-gray/20 hover:border-purple-500/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <img
                            src={getTokenImagePath(token)}
                            alt={token}
                            className="h-6 w-6 rounded-full"
                          />
                          <div className="text-left">
                            <p className={`text-sm font-bold ${isSelected ? 'text-purple-400' : 'text-white'}`}>
                              {amount}
                            </p>
                            <p className="text-gray-400 text-xs">{getTokenDisplayName(token)}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-gray-500 text-xs mt-3 text-center">
                  Subscription requested: {subscription.price} {getTokenDisplayName(settlementToken)}
                </p>
              </div>

              {/* Pay Now Button */}
              <div className="mt-6 pt-6 border-t border-bnb-gray">
                {paymentStatus === 'failed' && paymentError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm text-center">{paymentError}</p>
                  </div>
                )}

                {paymentStatus === 'paid' && txHash && (
                  <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-xl text-center">
                    <p className="text-green-400 font-semibold mb-2">Subscription Payment Successful!</p>
                    <a
                      href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm inline-flex items-center space-x-1"
                    >
                      <span>View Transaction</span>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                      </svg>
                    </a>
                    <button
                      onClick={() => setShowReceipt(true)}
                      className="mt-2 w-full flex items-center justify-center space-x-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      <span>View Receipt</span>
                    </button>
                  </div>
                )}

                <button
                  onClick={handlePayNow}
                  disabled={paymentStatus === 'processing' || paymentStatus === 'paid'}
                  className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-purple-500 to-bnb-yellow hover:opacity-90 disabled:opacity-50 text-white font-bold text-lg py-4 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  {paymentStatus === 'processing' ? (
                    <>
                      <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing...</span>
                    </>
                  ) : paymentStatus === 'paid' ? (
                    <>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
                      </svg>
                      <span>Subscribed</span>
                    </>
                  ) : (
                    <>
                      <span>Pay {getPaymentAmountInToken(selectedPayToken)} {getTokenDisplayName(selectedPayToken)}</span>
                      <img src="/2.png" alt="" className="h-8 w-8" />
                    </>
                  )}
                </button>
                {!walletAddress && paymentStatus === 'pending' && (
                  <p className="text-gray-500 text-sm text-center mt-3">
                    Connect your wallet to subscribe
                  </p>
                )}
              </div>
            </div>

            {/* Agent/MCP Panel */}
            <div className="mb-8">
              <AgentFlowPanel data={subscription} walletAddress={walletAddress} network={network} />
            </div>

            {/* Back Links */}
            <div className="flex items-center justify-center space-x-6 mb-12">
              <a
                href="/"
                className="inline-flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow font-semibold transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                <span>Back to Home</span>
              </a>
              <a
                href="/history.html"
                className="inline-flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow font-semibold transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <span>View History</span>
              </a>
            </div>

            {/* Powered by Footer */}
            <div className="text-center">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <span>Powered by</span>
                <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                  <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center space-x-1 text-xs text-gray-600">
                <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <span>Secured by BNB Chain</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
