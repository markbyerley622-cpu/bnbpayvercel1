import { useState, useEffect, useCallback } from 'react';
import { Header } from './Header';
import { AgentFlowPanel } from './AgentFlowPanel';
import { FloatingParticles } from './FloatingParticles';
import { ConfirmModal, useConfirmModal } from './ConfirmModal';
import { useToast } from '../contexts/ToastContext';
import type { InvoiceData, SubscriptionData } from '../lib/types';
import type { NetworkType } from '../lib/web3';
import { getCurrentNetwork, formatAddress } from '../lib/web3';
// Gift Card imports
import type { BNBPayCard, NetworkKey } from '../giftcards/types';
import { formatCardAmount, formatCardStatus, isCardValid, giftCardApi } from '../giftcards/services/giftcard-api';
import { getTokenImagePath as getGiftCardTokenImage } from '../giftcards/services/tokens';

// Type guards
function isInvoice(item: InvoiceData | SubscriptionData | null): item is InvoiceData {
  return item !== null && item.type === 'invoice';
}

function isSubscription(item: InvoiceData | SubscriptionData | null): item is SubscriptionData {
  return item !== null && item.type === 'subscription';
}

// Generate a shareable invoice link with encoded data
function generateInvoiceLink(invoice: InvoiceData): string {
  const chainTag = invoice.x402FlexHeaders?.['X-402-Chain'] || '';
  const networkKey = chainTag.includes('bnb-chain:56')
    ? 'bnb'
    : chainTag.includes('bnb-chain:97')
      ? 'bnbTestnet'
      : undefined;
  const invoiceDataForUrl = {
    id: invoice.invoiceId,
    m: invoice.merchantAddress || '', // merchant
    a: invoice.amount, // amount
    t: invoice.paymentToken || invoice.settlement || 'BNB', // token
    d: invoice.description, // description
    dd: invoice.dueDate || '', // due date
    pw: invoice.payeeWalletAddress || '', // payee wallet
    c: invoice.createdAt || Date.now(), // created at
    al: invoice.allowedTokens || ['BNB', 'USDT', 'USDC', 'USD1', 'WUSD'], // allowed tokens
    n: networkKey, // network key (bnb | bnbTestnet)
  };
  const encodedData = btoa(safeStringify(invoiceDataForUrl));
  return `${window.location.origin}/invoice/${invoice.invoiceId}?data=${encodeURIComponent(encodedData)}`;
}

import { getTokenImagePath, getTokenDisplayName } from '../lib/price-utils';
import { useWalletPayments } from '../lib/useBNBPayApi';
import type { Payment } from '../lib/bnbpay-api';
import { formatPaymentAmount, getInvoiceStatus, safeStringify, cancelInvoice as cancelInvoiceApi } from '../lib/bnbpay-api';

// Constants for pagination
const ITEMS_PER_PAGE = 5;
const TX_PER_PAGE = 5;

export function HistoryPage() {
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<InvoiceData[]>([]);
  const [subscriptions, setSubscriptions] = useState<SubscriptionData[]>([]);
  const [activeTab, setActiveTab] = useState<'invoices' | 'subscriptions' | 'giftcards' | 'analytics'>('invoices');
  const [mounted, setMounted] = useState(false);
  const [selectedItemForMCP, setSelectedItemForMCP] = useState<InvoiceData | SubscriptionData | null>(null);
  const [txPage, setTxPage] = useState(1);

  // Pagination states for invoices and subscriptions
  const [invoicePage, setInvoicePage] = useState(1);
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [giftCardPage, setGiftCardPage] = useState(1);

  // Search states
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState('');
  const [subscriptionSearchQuery, setSubscriptionSearchQuery] = useState('');
  const [txSearchQuery, setTxSearchQuery] = useState('');
  const [giftCardSearchQuery, setGiftCardSearchQuery] = useState('');

  // Gift card states
  const [giftCards, setGiftCards] = useState<BNBPayCard[]>([]);
  const [giftCardFilter, setGiftCardFilter] = useState<'all' | 'active' | 'redeemed' | 'expired'>('all');
  const [cancellingCardId, setCancellingCardId] = useState<string | null>(null);
  const [selectedCardForDetails, setSelectedCardForDetails] = useState<BNBPayCard | null>(null);

  // Cancel invoice states
  const [cancellingInvoiceId, setCancellingInvoiceId] = useState<string | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Toast notifications
  const toast = useToast();

  // Confirm modal for delete/cancel actions
  const confirmModal = useConfirmModal();

  // Fetch on-chain payments from BNBPay API
  // Use 'all' role to get payments where wallet is either payer or merchant
  const networkKey = network === 'mainnet' ? 'bnb' : 'bnbTestnet';
  const {
    data: apiPaymentsData,
    loading: apiLoading,
    error: apiError,
    refetch: refetchApiPayments
  } = useWalletPayments(walletAddress, { pageSize: 50, role: 'all', network: networkKey }, { refetchInterval: 30000 });

  useEffect(() => {
    setMounted(true);
    getCurrentNetwork().then(detectedNetwork => {
      setNetwork(detectedNetwork);
    });
  }, []);

  useEffect(() => {
    if (walletAddress) {
      loadHistory();
      loadGiftCards();
    } else {
      setInvoices([]);
      setSubscriptions([]);
      setGiftCards([]);
    }
  }, [walletAddress]);

  // Load gift cards for this wallet
  const loadGiftCards = useCallback(async () => {
    if (!walletAddress) {
      setGiftCards([]);
      return;
    }

    const networkKey: NetworkKey = network === 'mainnet' ? 'bnb' : 'bnbTestnet';
    try {
      let cards = await giftCardApi.getGiftCardsByMerchant(walletAddress, networkKey);
      cards = cards.filter(card => card.network === networkKey);
      cards.sort((a, b) => b.createdAt - a.createdAt);
      setGiftCards(cards);
    } catch (error) {
      console.error('Failed to load gift cards:', error);
      setGiftCards([]);
    }
  }, [walletAddress, network]);

  // Also reload when window gains focus (in case invoice was created in another tab)
  useEffect(() => {
    const handleFocus = () => {
      if (walletAddress) {
        console.log('Window focused, reloading history...');
        loadHistory();
        loadGiftCards();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [walletAddress, loadGiftCards]);

  const loadHistory = async () => {
    if (!walletAddress) return;

    // Normalize wallet address to lowercase for consistent lookup
    const normalizedAddress = walletAddress.toLowerCase();

    // Helper to find storage key
    const findKey = (prefix: string): string | null => {
      const directKey = `${prefix}_${walletAddress}`;
      if (localStorage.getItem(directKey)) return directKey;
      const normalKey = `${prefix}_${normalizedAddress}`;
      if (localStorage.getItem(normalKey)) return normalKey;
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${prefix}_`) && key.toLowerCase() === `${prefix}_${normalizedAddress}`) {
          return key;
        }
      }
      return null;
    };

    // Load invoices from localStorage
    const invoicesKey = findKey('invoices');
    const storedInvoices = invoicesKey ? localStorage.getItem(invoicesKey) : null;

    if (storedInvoices) {
      try {
        const parsedInvoices: InvoiceData[] = JSON.parse(storedInvoices);

        // First pass: quick check localStorage for paid status (synchronous, fast)
        const quickUpdatedInvoices = parsedInvoices.map((invoice) => {
          if (invoice.status === 'paid') return invoice;
          if (!invoice.invoiceId) return invoice;

          // Check localStorage payment record
          const paymentRecord = localStorage.getItem(`payment_${invoice.invoiceId}`);
          if (paymentRecord) {
            try {
              const payment = JSON.parse(paymentRecord);
              if (payment.txHash) {
                return {
                  ...invoice,
                  status: 'paid' as const,
                  txHash: payment.txHash,
                  paymentId: payment.paymentId || invoice.paymentId,
                  paidAt: payment.paidAt || Date.now(),
                  paidBy: payment.paidBy,
                  paidToken: payment.token,
                  paidAmount: payment.amount,
                };
              }
            } catch { /* ignore */ }
          }

          // Check individual invoice record
          const individualInvoice = localStorage.getItem(`invoice_${invoice.invoiceId}`);
          if (individualInvoice) {
            try {
              const invData = JSON.parse(individualInvoice);
              if (invData.status === 'paid' && invData.txHash) {
                return { ...invoice, ...invData, status: 'paid' as const };
              }
            } catch { /* ignore */ }
          }

          return invoice;
        });

        // Set invoices immediately with localStorage data (fast initial render)
        setInvoices(quickUpdatedInvoices);

        // Second pass: batch API calls for pending invoices only (async, background)
        const pendingInvoices = quickUpdatedInvoices.filter(
          inv => inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'canceled' && inv.invoiceId
        );

        if (pendingInvoices.length > 0) {
          // Batch API calls with concurrency limit
          const BATCH_SIZE = 5;
          const apiResults: Record<string, { status: string; txHash?: string; paymentId?: string }> = {};

          for (let i = 0; i < pendingInvoices.length; i += BATCH_SIZE) {
            const batch = pendingInvoices.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.allSettled(
              batch.map(async (inv) => {
                try {
                  const status = await getInvoiceStatus(inv.invoiceId!);
                  return { invoiceId: inv.invoiceId!, status };
                } catch {
                  return { invoiceId: inv.invoiceId!, status: null };
                }
              })
            );

            batchResults.forEach((result) => {
              if (result.status === 'fulfilled' && result.value.status) {
                apiResults[result.value.invoiceId] = result.value.status;
              }
            });
          }

          // Update invoices with API results
          const apiUpdatedInvoices = quickUpdatedInvoices.map((invoice) => {
            if (!invoice.invoiceId || invoice.status === 'paid') return invoice;
            const apiStatus = apiResults[invoice.invoiceId];
            if (apiStatus?.status === 'paid') {
              return {
                ...invoice,
                status: 'paid' as const,
                txHash: apiStatus.txHash || invoice.txHash,
                paymentId: apiStatus.paymentId || invoice.paymentId,
                paidAt: invoice.paidAt || Date.now(),
              };
            }
            return invoice;
          });

          // Only update if there were changes
          const hasUpdates = apiUpdatedInvoices.some((inv, idx) => inv.status !== quickUpdatedInvoices[idx].status);
          if (hasUpdates) {
            setInvoices(apiUpdatedInvoices);
            const storageKey = `invoices_${walletAddress}`;
            localStorage.setItem(storageKey, safeStringify(apiUpdatedInvoices));
          }
        }
      } catch (error) {
        console.error('Failed to parse invoices:', error);
        setInvoices([]);
      }
    } else {
      setInvoices([]);
    }

    // Load subscriptions from localStorage
    const subscriptionsKey = findKey('subscriptions');
    const storedSubscriptions = subscriptionsKey ? localStorage.getItem(subscriptionsKey) : null;

    if (storedSubscriptions) {
      try {
        setSubscriptions(JSON.parse(storedSubscriptions));
      } catch (error) {
        console.error('Failed to parse subscriptions:', error);
        setSubscriptions([]);
      }
    } else {
      setSubscriptions([]);
    }
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

  // Find the correct localStorage key for this wallet
  const findStorageKey = (prefix: string): string | null => {
    if (!walletAddress) return null;
    const normalizedAddress = walletAddress.toLowerCase();

    // Try direct match first
    if (localStorage.getItem(`${prefix}_${walletAddress}`)) {
      return `${prefix}_${walletAddress}`;
    }
    if (localStorage.getItem(`${prefix}_${normalizedAddress}`)) {
      return `${prefix}_${normalizedAddress}`;
    }
    // Search for any matching key
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(`${prefix}_`) && key.toLowerCase() === `${prefix}_${normalizedAddress}`) {
        return key;
      }
    }
    return `${prefix}_${walletAddress}`;
  };

  // Perform delete invoice action (called after confirmation)
  const performDeleteInvoice = useCallback((invoiceId: string) => {
    if (!walletAddress) return;

    const newInvoices = invoices.filter(inv => inv.invoiceId !== invoiceId);
    setInvoices(newInvoices);

    const storageKey = findStorageKey('invoices');
    if (storageKey) {
      localStorage.setItem(storageKey, safeStringify(newInvoices));
    }
    toast.success('Invoice deleted successfully');
  }, [walletAddress, invoices, findStorageKey, toast]);

  // Show confirm modal for delete invoice
  const deleteInvoice = (invoiceId: string) => {
    if (!walletAddress) return;

    confirmModal.showConfirm({
      title: 'Delete Invoice?',
      description: 'Are you sure you want to delete this invoice? This will remove it from your local history.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
      onConfirm: () => performDeleteInvoice(invoiceId),
    });
  };

  // Perform cancel invoice action (called after confirmation)
  const performCancelInvoice = useCallback(async (invoiceId: string) => {
    setCancellingInvoiceId(invoiceId);
    setCancelError(null);

    try {
      const cancelledInvoice = await cancelInvoiceApi(invoiceId);
      console.log('Invoice cancelled:', cancelledInvoice);

      // Update local state to reflect cancelled status
      setInvoices(prev => prev.map(inv =>
        inv.invoiceId === invoiceId
          ? { ...inv, status: 'cancelled' as const }
          : inv
      ));

      // Also update localStorage
      const storageKey = findStorageKey('invoices');
      if (storageKey) {
        const updatedInvoices = invoices.map(inv =>
          inv.invoiceId === invoiceId
            ? { ...inv, status: 'cancelled' as const }
            : inv
        );
        localStorage.setItem(storageKey, safeStringify(updatedInvoices));
      }
      toast.success('Invoice cancelled successfully');
    } catch (error) {
      console.error('Failed to cancel invoice:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel invoice';
      toast.error(errorMessage);
      setCancelError(errorMessage);
    } finally {
      setCancellingInvoiceId(null);
    }
  }, [invoices, findStorageKey, toast]);

  // Cancel invoice via BNBPay API (must not be paid)
  const handleCancelInvoice = (invoiceId: string, currentStatus?: string) => {
    if (!walletAddress) return;

    // Don't allow cancelling already paid or cancelled invoices
    if (currentStatus === 'paid') {
      toast.error('Cannot cancel a paid invoice');
      return;
    }
    if (currentStatus === 'canceled' || currentStatus === 'cancelled') {
      toast.warning('Invoice is already cancelled');
      return;
    }

    confirmModal.showConfirm({
      title: 'Cancel Invoice?',
      description: 'Are you sure you want to cancel this invoice? This action cannot be undone.',
      confirmText: 'Cancel Invoice',
      cancelText: 'Keep Invoice',
      confirmVariant: 'danger',
      onConfirm: () => performCancelInvoice(invoiceId),
    });
  };

  // Perform delete subscription action (called after confirmation)
  const performDeleteSubscription = useCallback((subscriptionId: string) => {
    if (!walletAddress) return;

    const newSubscriptions = subscriptions.filter(sub => sub.subscriptionId !== subscriptionId);
    setSubscriptions(newSubscriptions);

    const storageKey = findStorageKey('subscriptions');
    if (storageKey) {
      localStorage.setItem(storageKey, safeStringify(newSubscriptions));
    }
    toast.success('Subscription deleted successfully');
  }, [walletAddress, subscriptions, findStorageKey, toast]);

  // Show confirm modal for delete subscription
  const deleteSubscription = (subscriptionId: string) => {
    if (!walletAddress) return;

    confirmModal.showConfirm({
      title: 'Delete Subscription?',
      description: 'Are you sure you want to delete this subscription? This will remove it from your local history.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmVariant: 'danger',
      onConfirm: () => performDeleteSubscription(subscriptionId),
    });
  };

  // Handle gift card cancellation
  const handleCancelGiftCard = useCallback(async (cardId: string) => {
    setCancellingCardId(cardId);
    try {
      await giftCardApi.cancelGiftCard(cardId);
      toast.success('Gift card cancelled successfully');
      loadGiftCards();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to cancel gift card';
      toast.error(message);
    } finally {
      setCancellingCardId(null);
    }
  }, [toast, loadGiftCards]);

  // Copy gift card link
  const handleCopyGiftCardLink = useCallback((card: BNBPayCard) => {
    const url = `${window.location.origin}/giftcard/redeem?cardId=${encodeURIComponent(card.cardId)}`;
    navigator.clipboard.writeText(url);
    if (card.cardType === 'open') {
      toast.warning('Base link copied. Open cards also require the redeem key shown at creation.');
    } else {
      toast.success('Redemption link copied!');
    }
  }, [toast]);

  // Gift card stats
  const giftCardStats = {
    total: giftCards.length,
    active: giftCards.filter(c => isCardValid(c)).length,
    redeemed: giftCards.filter(c => c.status === 'redeemed').length,
    expired: giftCards.filter(c =>
      c.status === 'expired' ||
      (c.expiresAt && c.expiresAt < Date.now() && (c.status === 'active' || c.status === 'claimed'))
    ).length,
  };

  return (
    <>
      {/* Confirm Modal */}
      <ConfirmModal {...confirmModal.modalProps} />

      {/* Gift Card Details Modal */}
      {selectedCardForDetails && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedCardForDetails(null)}
        >
          <div
            className="bg-bnb-dark border border-gray-700 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">Gift Card Details</h3>
                <button
                  onClick={() => setSelectedCardForDetails(null)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                  </svg>
                </button>
              </div>

              <div className="text-center mb-6">
                <img
                  src={getGiftCardTokenImage(selectedCardForDetails.token)}
                  alt={selectedCardForDetails.token}
                  className="w-20 h-20 mx-auto rounded-full mb-4"
                />
                <p className="text-3xl font-bold text-bnb-yellow">
                  {formatCardAmount(selectedCardForDetails.amount, selectedCardForDetails.token)}
                </p>
                <span className={`inline-block mt-2 px-3 py-1 rounded-full text-sm font-semibold ${
                  formatCardStatus(selectedCardForDetails.status).label === 'Active'
                    ? 'bg-green-500/20 text-green-400'
                    : formatCardStatus(selectedCardForDetails.status).label === 'Claimed'
                    ? 'bg-yellow-500/20 text-yellow-400'
                    : formatCardStatus(selectedCardForDetails.status).label === 'Redeemed'
                    ? 'bg-blue-500/20 text-blue-400'
                    : 'bg-gray-500/20 text-gray-400'
                }`}>
                  {formatCardStatus(selectedCardForDetails.status).label}
                </span>
              </div>

              <div className="space-y-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Card ID:</span>
                  <span className="text-white font-mono text-xs">{selectedCardForDetails.cardId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Type:</span>
                  <span className="text-white">{selectedCardForDetails.cardType === 'open' ? 'Open' : 'Direct'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Created:</span>
                  <span className="text-white">{new Date(selectedCardForDetails.createdAt).toLocaleString()}</span>
                </div>
                {selectedCardForDetails.expiresAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Expires:</span>
                    <span className="text-white">{new Date(selectedCardForDetails.expiresAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedCardForDetails.message && (
                  <div>
                    <span className="text-gray-400 block mb-1">Message:</span>
                    <span className="text-white italic">"{selectedCardForDetails.message}"</span>
                  </div>
                )}
              </div>

              {selectedCardForDetails.status === 'active' && isCardValid(selectedCardForDetails) && (
                <div className="mt-6 flex gap-3">
                  <button
                    onClick={() => {
                      handleCopyGiftCardLink(selectedCardForDetails);
                      setSelectedCardForDetails(null);
                    }}
                    className="flex-1 px-4 py-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold rounded-xl transition-all"
                  >
                    Copy Redemption Link
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Particles Background */}
      <FloatingParticles />

      <div className="min-h-screen bg-bnb-dark content-wrapper">
        {/* Header */}
        <Header
          network={network}
          onNetworkChange={setNetwork}
          onWalletChanged={setWalletAddress}
          title="Payment History"
          showNav={true}
        />

        {/* Main Content */}
        <main className="max-w-7xl mx-auto px-6 py-12">
          {!walletAddress ? (
            <div className={`text-center py-20 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
              <div className="mb-8">
                <svg className="w-24 h-24 mx-auto text-bnb-yellow/50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
                </svg>
              </div>
              <h2 className="text-3xl font-bold text-white mb-4">Connect Your Wallet</h2>
              <p className="text-gray-400 text-lg">
                Connect your wallet to view your payment history
              </p>
            </div>
          ) : (
            <>
              {/* Refresh Button */}
              <div className={`flex justify-end mb-4 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
                <button
                  onClick={loadHistory}
                  className="px-4 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow/30 text-bnb-yellow rounded-xl font-semibold transition-all flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                  <span>Refresh</span>
                </button>
              </div>

              {/* Tab Navigation */}
              <div className={`flex flex-wrap items-center justify-center gap-2 sm:gap-4 mb-12 ${mounted ? 'animate-fade-in' : 'opacity-0'}`}>
                <button
                  onClick={() => setActiveTab('invoices')}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'invoices'
                      ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                      : 'bg-bnb-gray/50 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span className="text-sm sm:text-base">Invoices ({invoices.length})</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('subscriptions')}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'subscriptions'
                      ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                      : 'bg-bnb-gray/50 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                    </svg>
                    <span className="text-sm sm:text-base">Subscriptions ({subscriptions.length})</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('giftcards')}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'giftcards'
                      ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                      : 'bg-bnb-gray/50 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
                    </svg>
                    <span className="text-sm sm:text-base">Gift Cards ({giftCards.length})</span>
                  </div>
                </button>
                <button
                  onClick={() => setActiveTab('analytics')}
                  className={`px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl font-semibold transition-all ${
                    activeTab === 'analytics'
                      ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                      : 'bg-bnb-gray/50 text-gray-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <svg className="w-4 sm:w-5 h-4 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
                    </svg>
                    <span className="text-sm sm:text-base">Analytics ({(apiPaymentsData?.data?.length || 0) + giftCardStats.redeemed})</span>
                    {apiLoading && (
                      <span className="w-2 h-2 bg-bnb-yellow rounded-full animate-pulse"></span>
                    )}
                  </div>
                </button>
              </div>

              {/* Invoices Tab */}
              {activeTab === 'invoices' && (
                <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
                  {/* Cancel Error Toast */}
                  {cancelError && (
                    <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-between animate-fade-in">
                      <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="text-red-400 text-sm">{cancelError}</p>
                      </div>
                      <button
                        onClick={() => setCancelError(null)}
                        className="text-red-400 hover:text-red-300 transition-colors p-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                        </svg>
                      </button>
                    </div>
                  )}

                  {/* Search Bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by transaction hash, invoice ID, or description..."
                        value={invoiceSearchQuery}
                        onChange={(e) => {
                          setInvoiceSearchQuery(e.target.value);
                          setInvoicePage(1); // Reset to first page on search
                        }}
                        className="w-full bg-bnb-gray/30 text-white placeholder-gray-500 px-4 py-3 pl-12 rounded-xl border border-bnb-gray focus:border-bnb-yellow focus:outline-none transition-colors"
                      />
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                      {invoiceSearchQuery && (
                        <button
                          onClick={() => {
                            setInvoiceSearchQuery('');
                            setInvoicePage(1);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    // Sort invoices by createdAt (most recent first), then filter based on search
                    const sortedInvoices = [...invoices].sort((a, b) => {
                      const aTime = a.createdAt || 0;
                      const bTime = b.createdAt || 0;
                      return bTime - aTime; // Descending order (newest first)
                    });

                    const filteredInvoices = sortedInvoices.filter((invoice) => {
                      if (!invoiceSearchQuery) return true;
                      const query = invoiceSearchQuery.toLowerCase();
                      return (
                        (invoice.txHash?.toLowerCase().includes(query)) ||
                        (invoice.invoiceId?.toLowerCase().includes(query)) ||
                        (invoice.description?.toLowerCase().includes(query)) ||
                        (invoice.paymentId?.toLowerCase().includes(query)) ||
                        (invoice.customer?.name?.toLowerCase().includes(query)) ||
                        (invoice.customer?.email?.toLowerCase().includes(query))
                      );
                    });

                    // Pagination
                    const totalInvoicePages = Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE);
                    const startIdx = (invoicePage - 1) * ITEMS_PER_PAGE;
                    const paginatedInvoices = filteredInvoices.slice(startIdx, startIdx + ITEMS_PER_PAGE);

                    if (filteredInvoices.length === 0 && invoiceSearchQuery) {
                      return (
                        <div className="text-center py-12">
                          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-400">No results found</h3>
                          <p className="text-gray-500 mt-2">No invoices match "{invoiceSearchQuery}"</p>
                          <button
                            onClick={() => setInvoiceSearchQuery('')}
                            className="mt-4 px-4 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all font-semibold"
                          >
                            Clear Search
                          </button>
                        </div>
                      );
                    }

                    if (invoices.length === 0) {
                      return (
                        <div className="text-center py-20">
                          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-400">No invoices yet</h3>
                          <p className="text-gray-500 mt-2">Create your first invoice to get started</p>
                          <a href="/" className="inline-block mt-6 px-6 py-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold rounded-xl transition-all">
                            Create Invoice
                          </a>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Results count */}
                        <div className="mb-4 text-gray-400 text-sm">
                          Showing {startIdx + 1}-{Math.min(startIdx + ITEMS_PER_PAGE, filteredInvoices.length)} of {filteredInvoices.length} invoice{filteredInvoices.length !== 1 ? 's' : ''}
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {paginatedInvoices.map((invoice, index) => (
                        <div key={index} className="card-shadow rounded-2xl p-4 sm:p-6 hover-lift transition-all relative group">
                          {/* Header row with title, amount, and action buttons */}
                          <div className="flex items-start justify-between gap-4 mb-4">
                            {/* Left side: Title and status */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-lg sm:text-xl font-bold text-white truncate max-w-[200px] sm:max-w-none">{invoice.description}</h3>
                                <span className="px-2 sm:px-3 py-1 bg-bnb-yellow/20 text-bnb-yellow text-xs font-semibold rounded-full whitespace-nowrap">
                                  Invoice
                                </span>
                                {invoice.status === 'paid' ? (
                                  <span className="px-2 sm:px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full flex items-center space-x-1 whitespace-nowrap">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                    </svg>
                                    <span>Paid</span>
                                  </span>
                                ) : invoice.status === 'canceled' || invoice.status === 'cancelled' ? (
                                  <span className="px-2 sm:px-3 py-1 bg-gray-500/20 text-gray-400 text-xs font-semibold rounded-full flex items-center space-x-1 whitespace-nowrap">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path>
                                    </svg>
                                    <span>Cancelled</span>
                                  </span>
                                ) : invoice.status === 'expired' ? (
                                  <span className="px-2 sm:px-3 py-1 bg-red-500/20 text-red-400 text-xs font-semibold rounded-full flex items-center space-x-1 whitespace-nowrap">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <span>Expired</span>
                                  </span>
                                ) : (
                                  <span className="px-2 sm:px-3 py-1 bg-amber-500/20 text-amber-400 text-xs font-semibold rounded-full flex items-center space-x-1 whitespace-nowrap">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                    </svg>
                                    <span>Pending</span>
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-400 text-xs sm:text-sm">
                                Created {formatDate(invoice.createdAt)}
                                {invoice.paidAt && (
                                  <span className="block sm:inline sm:ml-2 text-green-400">• Paid {formatDate(invoice.paidAt)}</span>
                                )}
                              </p>
                            </div>

                            {/* Right side: Amount and action buttons */}
                            <div className="flex items-start gap-3 flex-shrink-0">
                              {/* Amount display */}
                              <div className="text-right">
                                <div className="flex items-center justify-end space-x-2">
                                  <p className="text-2xl sm:text-3xl font-bold text-bnb-yellow">{invoice.amount}</p>
                                  <img
                                    src={getTokenImagePath(invoice.settlement || invoice.paymentToken || 'BNB')}
                                    alt={invoice.settlement || invoice.paymentToken}
                                    className="h-6 w-6 sm:h-7 sm:w-7 rounded-full"
                                  />
                                </div>
                                <p className="text-gray-500 text-xs sm:text-sm">{getTokenDisplayName(invoice.settlement || invoice.paymentToken || 'BNB')}</p>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                                {/* Cancel Button - only show for pending invoices */}
                                {invoice.status !== 'paid' && invoice.status !== 'canceled' && invoice.status !== 'cancelled' && (
                                  <button
                                    onClick={() => handleCancelInvoice(invoice.invoiceId || '', invoice.status)}
                                    disabled={cancellingInvoiceId === invoice.invoiceId}
                                    className="w-8 h-8 bg-amber-500/10 hover:bg-amber-500/30 text-amber-400 hover:text-amber-300 border border-amber-500/20 hover:border-amber-500/40 rounded-full flex items-center justify-center transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Cancel Invoice"
                                  >
                                    {cancellingInvoiceId === invoice.invoiceId ? (
                                      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                      </svg>
                                    ) : (
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path>
                                      </svg>
                                    )}
                                  </button>
                                )}
                                {/* Delete Button */}
                                <button
                                  onClick={() => deleteInvoice(invoice.invoiceId || '')}
                                  className="w-8 h-8 bg-red-500/10 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/20 hover:border-red-500/40 rounded-full flex items-center justify-center transition-all duration-200"
                                  title="Delete Invoice"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path>
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                          {/* Accepted Tokens Section for Invoices */}
                          {invoice.allowedTokens && invoice.allowedTokens.length > 0 && (
                            <div className="p-3 sm:p-4 bg-bnb-yellow/5 border border-bnb-yellow/20 rounded-xl mb-4">
                              <p className="text-gray-400 text-xs sm:text-sm mb-2">Accepted Payment Tokens</p>
                              <div className="flex flex-wrap gap-2">
                                {invoice.allowedTokens.map((token: string) => (
                                  <div key={token} className="flex items-center gap-1.5 bg-bnb-gray/50 px-2 py-1 rounded-lg">
                                    <img
                                      src={getTokenImagePath(token as any)}
                                      alt={token}
                                      className="h-4 w-4 rounded-full"
                                    />
                                    <span className="text-xs font-medium text-white">{token}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 pt-4 border-t border-bnb-gray">
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Settlement Token</p>
                              <div className="flex items-center space-x-2">
                                <img
                                  src={getTokenImagePath(invoice.paymentToken || 'BNB')}
                                  alt={invoice.paymentToken}
                                  className="h-5 w-5 rounded-full"
                                />
                                <span className="text-white font-semibold">{getTokenDisplayName(invoice.paymentToken || 'BNB')}</span>
                                <span className="text-gray-400">({invoice.paymentAmount})</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Invoice ID (Reference)</p>
                              <div className="flex items-center space-x-2">
                                <p className="text-white font-mono text-sm">{invoice.invoiceId?.slice(0, 16)}...</p>
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(invoice.invoiceId || '');
                                  }}
                                  className="text-bnb-yellow hover:text-yellow-500 transition-colors"
                                  title="Copy Invoice ID"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                                  </svg>
                                </button>
                              </div>
                            </div>
                            {invoice.merchantAddress && (
                              <div>
                                <p className="text-gray-500 text-sm mb-1">Merchant / Payee Address</p>
                                <p className="text-white font-mono text-sm">{formatAddress(invoice.merchantAddress)}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Payment Link</p>
                              <a
                                href={invoice.paymentLink || generateInvoiceLink(invoice)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-bnb-yellow hover:text-yellow-500 text-sm font-medium flex items-center space-x-1"
                              >
                                <span>{invoice.status === 'paid' ? 'View Invoice Page' : 'Open Payment Page'}</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                </svg>
                              </a>
                            </div>
                          </div>

                          {/* Payment Details - shown when paid */}
                          {invoice.status === 'paid' && (
                            <div className="mt-4 pt-4 border-t border-green-500/30 bg-green-500/5 rounded-xl p-4">
                              <div className="flex items-center space-x-2 mb-3">
                                <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                </svg>
                                <span className="text-green-400 font-semibold">Payment Received</span>
                              </div>
                              <div className="grid grid-cols-2 gap-4">
                                {invoice.paidBy && (
                                  <div>
                                    <p className="text-gray-500 text-sm mb-1">Paid By</p>
                                    <p className="text-white font-mono text-sm">{formatAddress(invoice.paidBy)}</p>
                                  </div>
                                )}
                                {invoice.paidToken && invoice.paidAmount && (
                                  <div>
                                    <p className="text-gray-500 text-sm mb-1">Paid With</p>
                                    <div className="flex items-center space-x-2">
                                      <img
                                        src={getTokenImagePath(invoice.paidToken)}
                                        alt={invoice.paidToken}
                                        className="h-4 w-4 rounded-full"
                                      />
                                      <span className="text-white font-semibold">{invoice.paidAmount} {invoice.paidToken}</span>
                                    </div>
                                  </div>
                                )}
                                {invoice.txHash && (
                                  <div className="col-span-2">
                                    <p className="text-gray-500 text-sm mb-1">Transaction</p>
                                    <a
                                      href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${invoice.txHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center space-x-2 text-bnb-yellow hover:text-yellow-500 font-mono text-sm"
                                    >
                                      <span>{invoice.txHash.slice(0, 20)}...{invoice.txHash.slice(-8)}</span>
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                      </svg>
                                    </a>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Copy Invoice Link Button */}
                          <div className="mt-4 pt-4 border-t border-bnb-gray">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                readOnly
                                value={invoice.paymentLink || generateInvoiceLink(invoice)}
                                className="flex-1 bg-bnb-gray/30 text-gray-300 text-xs font-mono px-3 py-2 rounded-lg border border-bnb-gray focus:outline-none"
                              />
                              <button
                                onClick={() => {
                                  const link = invoice.paymentLink || generateInvoiceLink(invoice);
                                  navigator.clipboard.writeText(link);
                                }}
                                className="px-3 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all text-sm font-semibold"
                              >
                                Copy
                              </button>
                            </div>
                          </div>

                          {/* Agent/MCP Panel Toggle Button - Always visible */}
                          <div className="mt-4 pt-4 border-t border-bnb-gray">
                            <button
                              onClick={() => setSelectedItemForMCP(isInvoice(selectedItemForMCP) && selectedItemForMCP.invoiceId === invoice.invoiceId ? null : invoice)}
                              className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                                isInvoice(selectedItemForMCP) && selectedItemForMCP.invoiceId === invoice.invoiceId
                                  ? 'bg-bnb-yellow text-bnb-dark'
                                  : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                              }`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                              </svg>
                              <span>{isInvoice(selectedItemForMCP) && selectedItemForMCP.invoiceId === invoice.invoiceId ? 'Hide' : 'Show'} Agent / MCP Panel</span>
                              <svg className={`w-4 h-4 transition-transform ${isInvoice(selectedItemForMCP) && selectedItemForMCP.invoiceId === invoice.invoiceId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                              </svg>
                            </button>
                          </div>

                          {/* Agent/MCP Panel - shown when selected */}
                          {isInvoice(selectedItemForMCP) && selectedItemForMCP.invoiceId === invoice.invoiceId && (
                            <div className="mt-4">
                              <AgentFlowPanel data={invoice} walletAddress={walletAddress} network={network} />
                            </div>
                          )}
                        </div>
                      ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalInvoicePages > 1 && (
                          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-bnb-gray/20 rounded-xl">
                            <p className="text-gray-400 text-sm">
                              Page {invoicePage} of {totalInvoicePages}
                            </p>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setInvoicePage(Math.max(1, invoicePage - 1))}
                                disabled={invoicePage === 1}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                                </svg>
                                <span className="text-sm">Prev</span>
                              </button>

                              {/* Page numbers */}
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: Math.min(5, totalInvoicePages) }, (_, i) => {
                                  let pageNum;
                                  if (totalInvoicePages <= 5) {
                                    pageNum = i + 1;
                                  } else if (invoicePage <= 3) {
                                    pageNum = i + 1;
                                  } else if (invoicePage >= totalInvoicePages - 2) {
                                    pageNum = totalInvoicePages - 4 + i;
                                  } else {
                                    pageNum = invoicePage - 2 + i;
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setInvoicePage(pageNum)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                        invoicePage === pageNum
                                          ? 'bg-bnb-yellow text-bnb-dark'
                                          : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                onClick={() => setInvoicePage(Math.min(totalInvoicePages, invoicePage + 1))}
                                disabled={invoicePage === totalInvoicePages}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                              >
                                <span className="text-sm">Next</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Subscriptions Tab */}
              {activeTab === 'subscriptions' && (
                <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
                  {/* Search Bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by transaction hash, plan name, or subscription ID..."
                        value={subscriptionSearchQuery}
                        onChange={(e) => {
                          setSubscriptionSearchQuery(e.target.value);
                          setSubscriptionPage(1); // Reset to first page on search
                        }}
                        className="w-full bg-bnb-gray/30 text-white placeholder-gray-500 px-4 py-3 pl-12 rounded-xl border border-bnb-gray focus:border-bnb-yellow focus:outline-none transition-colors"
                      />
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                      {subscriptionSearchQuery && (
                        <button
                          onClick={() => {
                            setSubscriptionSearchQuery('');
                            setSubscriptionPage(1);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    // Sort subscriptions by createdAt (most recent first), then filter based on search
                    const sortedSubscriptions = [...subscriptions].sort((a, b) => {
                      const aTime = a.createdAt || 0;
                      const bTime = b.createdAt || 0;
                      return bTime - aTime; // Descending order (newest first)
                    });

                    const filteredSubscriptions = sortedSubscriptions.filter((subscription) => {
                      if (!subscriptionSearchQuery) return true;
                      const query = subscriptionSearchQuery.toLowerCase();
                      return (
                        (subscription.txHash?.toLowerCase().includes(query)) ||
                        (subscription.subscriptionId?.toLowerCase().includes(query)) ||
                        (subscription.planName?.toLowerCase().includes(query)) ||
                        (subscription.customerEmail?.toLowerCase().includes(query))
                      );
                    });

                    // Pagination
                    const totalSubPages = Math.ceil(filteredSubscriptions.length / ITEMS_PER_PAGE);
                    const startIdx = (subscriptionPage - 1) * ITEMS_PER_PAGE;
                    const paginatedSubscriptions = filteredSubscriptions.slice(startIdx, startIdx + ITEMS_PER_PAGE);

                    if (filteredSubscriptions.length === 0 && subscriptionSearchQuery) {
                      return (
                        <div className="text-center py-12">
                          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-400">No results found</h3>
                          <p className="text-gray-500 mt-2">No subscriptions match "{subscriptionSearchQuery}"</p>
                          <button
                            onClick={() => setSubscriptionSearchQuery('')}
                            className="mt-4 px-4 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all font-semibold"
                          >
                            Clear Search
                          </button>
                        </div>
                      );
                    }

                    if (subscriptions.length === 0) {
                      return (
                        <div className="text-center py-20">
                          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-400">No subscriptions yet</h3>
                          <p className="text-gray-500 mt-2">Create your first subscription plan to get started</p>
                          <a href="/" className="inline-block mt-6 px-6 py-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold rounded-xl transition-all">
                            Create Subscription
                          </a>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Results count */}
                        <div className="mb-4 text-gray-400 text-sm">
                          Showing {startIdx + 1}-{Math.min(startIdx + ITEMS_PER_PAGE, filteredSubscriptions.length)} of {filteredSubscriptions.length} subscription{filteredSubscriptions.length !== 1 ? 's' : ''}
                        </div>

                        <div className="grid grid-cols-1 gap-6">
                          {paginatedSubscriptions.map((subscription, index) => (
                        <div key={index} className="card-shadow rounded-2xl p-4 sm:p-6 hover-lift transition-all relative group">
                          {/* Delete Button - appears on hover */}
                          <button
                            onClick={() => deleteSubscription(subscription.subscriptionId || '')}
                            className="absolute top-2 right-2 sm:top-4 sm:right-4 w-8 h-8 bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                            title="Delete Subscription"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                          </button>

                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
                            <div className="flex-1 min-w-0 pr-8 sm:pr-0">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <h3 className="text-lg sm:text-xl font-bold text-white truncate max-w-[200px] sm:max-w-none">{subscription.planName}</h3>
                                <span className="px-2 sm:px-3 py-1 bg-purple-500/20 text-purple-400 text-xs font-semibold rounded-full capitalize whitespace-nowrap">
                                  {subscription.interval}
                                </span>
                                <span className="px-2 sm:px-3 py-1 bg-green-500/20 text-green-400 text-xs font-semibold rounded-full flex items-center space-x-1 whitespace-nowrap">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                                  </svg>
                                  <span>Active</span>
                                </span>
                              </div>
                              <p className="text-gray-400 text-xs sm:text-sm">Created {formatDate(subscription.createdAt)}</p>
                            </div>
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 p-3 sm:p-4 bg-bnb-gray/30 rounded-xl mb-4">
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Subscription Price</p>
                              <p className="text-xl sm:text-2xl font-bold text-bnb-yellow">{subscription.price || subscription.price_usd1} {getTokenDisplayName(subscription.settlement || subscription.paymentToken || 'BNB')}</p>
                              <p className="text-gray-500 text-xs sm:text-sm">per {subscription.interval === 'monthly' ? 'month' : 'year'}</p>
                            </div>
                            <div className="flex items-center space-x-2">
                              <img
                                src={getTokenImagePath(subscription.settlement || subscription.paymentToken || 'BNB')}
                                alt={subscription.settlement || subscription.paymentToken}
                                className="h-7 w-7 sm:h-8 sm:w-8 rounded-full"
                              />
                              <div>
                                <p className="text-white font-semibold text-sm sm:text-base">{getTokenDisplayName(subscription.settlement || subscription.paymentToken || 'BNB')}</p>
                                <p className="text-gray-400 text-xs sm:text-sm">Settlement token</p>
                              </div>
                            </div>
                          </div>
                          {/* Accepted Tokens Section */}
                          {subscription.allowedTokens && subscription.allowedTokens.length > 0 && (
                            <div className="p-3 sm:p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl mb-4">
                              <p className="text-gray-400 text-xs sm:text-sm mb-2">Accepted Payment Tokens</p>
                              <div className="flex flex-wrap gap-2">
                                {subscription.allowedTokens.map((token: string) => (
                                  <div key={token} className="flex items-center gap-1.5 bg-bnb-gray/50 px-2 py-1 rounded-lg">
                                    <img
                                      src={getTokenImagePath(token as any)}
                                      alt={token}
                                      className="h-4 w-4 rounded-full"
                                    />
                                    <span className="text-xs font-medium text-white">{token}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            {subscription.txHash && (
                              <div>
                                <p className="text-gray-500 text-sm mb-1">Transaction Hash</p>
                                <a
                                  href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${subscription.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-bnb-yellow font-mono text-sm hover:underline"
                                >
                                  {subscription.txHash.slice(0, 16)}...
                                </a>
                              </div>
                            )}
                            {subscription.planId !== undefined && (
                              <div>
                                <p className="text-gray-500 text-sm mb-1">Plan ID</p>
                                <p className="text-white font-semibold">#{subscription.planId}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Subscription ID (Reference)</p>
                              <p className="text-white font-mono text-sm">{subscription.subscriptionId?.slice(0, 16)}...</p>
                            </div>
                            <div>
                              <p className="text-gray-500 text-sm mb-1">Subscription Link</p>
                              <a
                                href={`${window.location.origin}/subscription/${subscription.subscriptionId}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-bnb-yellow hover:text-yellow-500 text-sm font-medium flex items-center space-x-1"
                              >
                                <span>Open Subscribe Page</span>
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                </svg>
                              </a>
                            </div>
                          </div>

                          {/* Copy Subscription Link Button */}
                          <div className="mt-4 pt-4 border-t border-bnb-gray">
                            <div className="flex items-center space-x-2">
                              <input
                                type="text"
                                readOnly
                                value={`${window.location.origin}/subscription/${subscription.subscriptionId}`}
                                className="flex-1 bg-bnb-gray/30 text-gray-300 text-xs font-mono px-3 py-2 rounded-lg border border-bnb-gray focus:outline-none"
                              />
                              <button
                                onClick={() => {
                                  const link = `${window.location.origin}/subscription/${subscription.subscriptionId}`;
                                  navigator.clipboard.writeText(link);
                                }}
                                className="px-3 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all text-sm font-semibold"
                              >
                                Copy
                              </button>
                            </div>
                          </div>

                          {/* Agent/MCP Panel Toggle Button - Always visible */}
                          <div className="mt-4 pt-4 border-t border-bnb-gray">
                            <button
                              onClick={() => setSelectedItemForMCP(isSubscription(selectedItemForMCP) && selectedItemForMCP.subscriptionId === subscription.subscriptionId ? null : subscription)}
                              className={`w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-xl font-semibold transition-all ${
                                isSubscription(selectedItemForMCP) && selectedItemForMCP.subscriptionId === subscription.subscriptionId
                                  ? 'bg-bnb-yellow text-bnb-dark'
                                  : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                              }`}
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
                              </svg>
                              <span>{isSubscription(selectedItemForMCP) && selectedItemForMCP.subscriptionId === subscription.subscriptionId ? 'Hide' : 'Show'} Agent / MCP Panel</span>
                              <svg className={`w-4 h-4 transition-transform ${isSubscription(selectedItemForMCP) && selectedItemForMCP.subscriptionId === subscription.subscriptionId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                              </svg>
                            </button>
                          </div>

                          {/* Agent/MCP Panel - shown when selected */}
                          {isSubscription(selectedItemForMCP) && selectedItemForMCP.subscriptionId === subscription.subscriptionId && (
                            <div className="mt-4">
                              <AgentFlowPanel data={subscription} walletAddress={walletAddress} network={network} />
                            </div>
                          )}
                        </div>
                      ))}
                        </div>

                        {/* Pagination Controls */}
                        {totalSubPages > 1 && (
                          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-bnb-gray/20 rounded-xl">
                            <p className="text-gray-400 text-sm">
                              Page {subscriptionPage} of {totalSubPages}
                            </p>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setSubscriptionPage(Math.max(1, subscriptionPage - 1))}
                                disabled={subscriptionPage === 1}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                                </svg>
                                <span className="text-sm">Prev</span>
                              </button>

                              {/* Page numbers */}
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: Math.min(5, totalSubPages) }, (_, i) => {
                                  let pageNum;
                                  if (totalSubPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (subscriptionPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (subscriptionPage >= totalSubPages - 2) {
                                    pageNum = totalSubPages - 4 + i;
                                  } else {
                                    pageNum = subscriptionPage - 2 + i;
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setSubscriptionPage(pageNum)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                        subscriptionPage === pageNum
                                          ? 'bg-bnb-yellow text-bnb-dark'
                                          : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                onClick={() => setSubscriptionPage(Math.min(totalSubPages, subscriptionPage + 1))}
                                disabled={subscriptionPage === totalSubPages}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                              >
                                <span className="text-sm">Next</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Gift Cards Tab */}
              {activeTab === 'giftcards' && (
                <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
                  {/* Gift Card Stats */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                    <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
                      <p className="text-2xl font-bold text-white">{giftCardStats.total}</p>
                      <p className="text-sm text-gray-400">Total</p>
                    </div>
                    <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
                      <p className="text-2xl font-bold text-green-400">{giftCardStats.active}</p>
                      <p className="text-sm text-gray-400">Active</p>
                    </div>
                    <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
                      <p className="text-2xl font-bold text-blue-400">{giftCardStats.redeemed}</p>
                      <p className="text-sm text-gray-400">Redeemed</p>
                    </div>
                    <div className="bg-bnb-gray/30 rounded-xl p-4 border border-gray-700 text-center">
                      <p className="text-2xl font-bold text-gray-400">{giftCardStats.expired}</p>
                      <p className="text-sm text-gray-400">Expired</p>
                    </div>
                  </div>

                  {/* Gift Card Filters */}
                  <div className="flex flex-wrap items-center gap-2 mb-6">
                    {(['all', 'active', 'redeemed', 'expired'] as const).map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setGiftCardFilter(f);
                          setGiftCardPage(1);
                        }}
                        className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors ${
                          giftCardFilter === f
                            ? 'bg-bnb-yellow text-bnb-dark'
                            : 'bg-bnb-gray text-gray-400 hover:text-white'
                        }`}
                      >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                        {f !== 'all' && (
                          <span className="ml-1.5 text-xs opacity-70">
                            ({f === 'active' ? giftCardStats.active : f === 'redeemed' ? giftCardStats.redeemed : giftCardStats.expired})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Search Bar */}
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search by card ID, type, or amount..."
                        value={giftCardSearchQuery}
                        onChange={(e) => {
                          setGiftCardSearchQuery(e.target.value);
                          setGiftCardPage(1);
                        }}
                        className="w-full bg-bnb-gray/30 text-white placeholder-gray-500 px-4 py-3 pl-12 rounded-xl border border-bnb-gray focus:border-bnb-yellow focus:outline-none transition-colors"
                      />
                      <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                      </svg>
                      {giftCardSearchQuery && (
                        <button
                          onClick={() => {
                            setGiftCardSearchQuery('');
                            setGiftCardPage(1);
                          }}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>

                  {(() => {
                    // Filter gift cards
                    const filteredCards = giftCards.filter(card => {
                      // Status filter
                      if (giftCardFilter === 'active' && !(card.status === 'active' && isCardValid(card))) return false;
                      if (giftCardFilter === 'redeemed' && card.status !== 'redeemed') return false;
                      if (giftCardFilter === 'expired') {
                        const isExpired = card.status === 'expired' ||
                          (card.expiresAt && card.expiresAt < Date.now() && (card.status === 'active' || card.status === 'claimed'));
                        if (!isExpired) return false;
                      }

                      // Search filter
                      if (giftCardSearchQuery) {
                        const query = giftCardSearchQuery.toLowerCase();
                        return (
                          card.cardId.toLowerCase().includes(query) ||
                          card.amount.includes(query) ||
                          card.token.toLowerCase().includes(query) ||
                          card.message?.toLowerCase().includes(query) ||
                          card.cardType.toLowerCase().includes(query)
                        );
                      }
                      return true;
                    });

                    // Pagination
                    const totalPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
                    const startIdx = (giftCardPage - 1) * ITEMS_PER_PAGE;
                    const paginatedCards = filteredCards.slice(startIdx, startIdx + ITEMS_PER_PAGE);

                    if (giftCards.length === 0) {
                      return (
                        <div className="text-center py-20">
                          <div className="w-20 h-20 bg-bnb-gray rounded-full flex items-center justify-center mx-auto mb-4">
                            <svg className="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
                            </svg>
                          </div>
                          <h3 className="text-xl font-bold text-white mb-2">No Gift Cards Yet</h3>
                          <p className="text-gray-400 mb-6">Create your first gift card to get started</p>
                          <a
                            href="/giftcard/create"
                            className="inline-block px-6 py-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold rounded-xl transition-all"
                          >
                            Create Gift Card
                          </a>
                        </div>
                      );
                    }

                    if (filteredCards.length === 0 && giftCardSearchQuery) {
                      return (
                        <div className="text-center py-12">
                          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                          </svg>
                          <h3 className="text-xl font-semibold text-gray-400">No results found</h3>
                          <p className="text-gray-500 mt-2">No gift cards match "{giftCardSearchQuery}"</p>
                          <button
                            onClick={() => setGiftCardSearchQuery('')}
                            className="mt-4 px-4 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all font-semibold"
                          >
                            Clear Search
                          </button>
                        </div>
                      );
                    }

                    return (
                      <>
                        {/* Results count */}
                        <div className="mb-4 text-gray-400 text-sm">
                          Showing {startIdx + 1}-{Math.min(startIdx + ITEMS_PER_PAGE, filteredCards.length)} of {filteredCards.length} gift card{filteredCards.length !== 1 ? 's' : ''}
                        </div>

                        {/* Gift Cards List */}
                        <div className="space-y-4">
                          {paginatedCards.map((card) => (
                            <div
                              key={card.cardId}
                              className="card-shadow rounded-2xl border border-gray-700 overflow-hidden hover:border-gray-600 transition-colors"
                            >
                              {/* Card Header */}
                              <div className="p-4 sm:p-6">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center space-x-3">
                                    <img
                                      src={getGiftCardTokenImage(card.token)}
                                      alt={card.token}
                                      className="w-12 h-12 rounded-full"
                                    />
                                    <div>
                                      <p className="text-xl sm:text-2xl font-bold text-bnb-yellow">
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
                                      : card.status === 'claimed'
                                      ? 'bg-yellow-500/20 text-yellow-400'
                                      : card.status === 'redeemed'
                                      ? 'bg-blue-500/20 text-blue-400'
                                      : card.status === 'cancelled'
                                      ? 'bg-red-500/20 text-red-400'
                                      : 'bg-gray-500/20 text-gray-400'
                                  }`}>
                                    {formatCardStatus(card.status).label}
                                  </span>
                                </div>

                                {/* Card Details */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm mb-4">
                                  <div>
                                    <p className="text-gray-500">Type</p>
                                    <p className="text-white text-xs">{card.cardType === 'open' ? 'Open' : 'Direct'}</p>
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

                                {/* Redeemed Info */}
                                {card.status === 'redeemed' && (
                                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                      </svg>
                                      <span className="text-blue-400 font-medium text-sm">Redeemed</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {card.redeemedBy && (
                                        <div>
                                          <p className="text-gray-500">Redeemed By</p>
                                          <p className="text-white font-mono">{formatAddress(card.redeemedBy)}</p>
                                        </div>
                                      )}
                                      {card.redeemedAt && (
                                        <div>
                                          <p className="text-gray-500">Redeemed At</p>
                                          <p className="text-white">{new Date(card.redeemedAt).toLocaleString()}</p>
                                        </div>
                                      )}
                                    </div>
                                    {card.txHash && (
                                      <a
                                        href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${card.txHash}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center mt-2 text-sm text-bnb-yellow hover:underline"
                                      >
                                        View Transaction
                                        <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                        </svg>
                                      </a>
                                    )}
                                  </div>
                                )}

                                {/* Card Actions */}
                                {card.status === 'active' && isCardValid(card) && (
                                  <div className="flex flex-wrap items-center gap-2">
                                    <button
                                      onClick={() => handleCopyGiftCardLink(card)}
                                      className="px-4 py-2 text-sm font-medium text-bnb-yellow bg-bnb-yellow/10 hover:bg-bnb-yellow/20 rounded-lg transition-colors"
                                    >
                                      Copy Link
                                    </button>
                                    <button
                                      onClick={() => setSelectedCardForDetails(card)}
                                      className="px-4 py-2 text-sm font-medium text-gray-400 bg-bnb-gray hover:bg-bnb-gray/70 rounded-lg transition-colors"
                                    >
                                      View Details
                                    </button>
                                    <button
                                      onClick={() => {
                                        confirmModal.showConfirm({
                                          title: 'Cancel Gift Card?',
                                          description: 'Are you sure you want to cancel this gift card? This action cannot be undone and the card will no longer be redeemable.',
                                          confirmText: 'Yes, Cancel Card',
                                          cancelText: 'Keep Card',
                                          confirmVariant: 'danger',
                                          onConfirm: () => handleCancelGiftCard(card.cardId),
                                        });
                                      }}
                                      disabled={cancellingCardId === card.cardId}
                                      className="px-4 py-2 text-sm font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors disabled:opacity-50"
                                    >
                                      {cancellingCardId === card.cardId ? 'Cancelling...' : 'Cancel'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                          <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-bnb-gray/20 rounded-xl">
                            <p className="text-gray-400 text-sm">
                              Page {giftCardPage} of {totalPages}
                            </p>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => setGiftCardPage(Math.max(1, giftCardPage - 1))}
                                disabled={giftCardPage === 1}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                                </svg>
                                <span className="text-sm">Prev</span>
                              </button>
                              <div className="flex items-center space-x-1">
                                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                  let pageNum;
                                  if (totalPages <= 5) {
                                    pageNum = i + 1;
                                  } else if (giftCardPage <= 3) {
                                    pageNum = i + 1;
                                  } else if (giftCardPage >= totalPages - 2) {
                                    pageNum = totalPages - 4 + i;
                                  } else {
                                    pageNum = giftCardPage - 2 + i;
                                  }
                                  return (
                                    <button
                                      key={pageNum}
                                      onClick={() => setGiftCardPage(pageNum)}
                                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                        giftCardPage === pageNum
                                          ? 'bg-bnb-yellow text-bnb-dark'
                                          : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                                      }`}
                                    >
                                      {pageNum}
                                    </button>
                                  );
                                })}
                              </div>
                              <button
                                onClick={() => setGiftCardPage(Math.min(totalPages, giftCardPage + 1))}
                                disabled={giftCardPage === totalPages}
                                className="flex items-center space-x-1 px-3 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                <span className="text-sm">Next</span>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Create Gift Card CTA */}
                        <div className="mt-6 p-4 bg-gradient-to-r from-bnb-yellow/10 to-amber-500/10 rounded-xl border border-bnb-yellow/20">
                          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                              <h4 className="text-white font-medium mb-1">Create More Gift Cards</h4>
                              <p className="text-gray-400 text-sm">Send crypto gifts with gasless redemption via BNBPay Relayer</p>
                            </div>
                            <a
                              href="/giftcard/create"
                              className="px-6 py-2.5 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold rounded-xl transition-all whitespace-nowrap"
                            >
                              Create Gift Card
                            </a>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Analytics Tab (from BNBPay API) */}
              {activeTab === 'analytics' && (
                <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
                  {/* Dashboard Header */}
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                    <div>
                      <h2 className="text-2xl font-bold text-white mb-1">Dashboard Analytics</h2>
                      <p className="text-gray-400 text-sm">Real-time BNBPay network statistics and transaction data</p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-bnb-yellow/20 to-amber-500/20 text-bnb-yellow border border-bnb-yellow/30">
                        {network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}
                      </span>
                      <button
                        onClick={() => refetchApiPayments()}
                        disabled={apiLoading}
                        className="flex items-center space-x-2 px-4 py-2 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-50"
                      >
                        <svg className={`w-4 h-4 ${apiLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        <span>{apiLoading ? 'Syncing...' : 'Refresh'}</span>
                      </button>
                    </div>
                  </div>

                  {/* API Error */}
                  {apiError && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                      <div className="flex items-center space-x-3">
                        <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="text-red-400 text-sm">
                          Failed to load on-chain payments: {apiError.message}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Loading State */}
                  {apiLoading && !apiPaymentsData && (
                    <div className="text-center py-20">
                      <div className="w-12 h-12 border-4 border-bnb-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-gray-400">Loading on-chain payments...</p>
                    </div>
                  )}

                  {/* Empty State */}
                  {!apiLoading && (!apiPaymentsData?.data || apiPaymentsData.data.length === 0) && !apiError && (
                    <div className="text-center py-20">
                      <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                      </svg>
                      <h3 className="text-xl font-semibold text-gray-400">No on-chain payments yet</h3>
                      <p className="text-gray-500 mt-2">Payments made through BNBPay contracts will appear here</p>
                    </div>
                  )}

                  {/* Dashboard Content */}
                  {apiPaymentsData?.data && apiPaymentsData.data.length > 0 && (() => {
                    // Calculate analytics from payments data
                    const payments = apiPaymentsData.data;
                    const totalTransactions = apiPaymentsData.total;

                    // Calculate total volume
                    const totalVolume = payments.reduce((sum, p) => {
                      try {
                        return sum + parseFloat(formatPaymentAmount(p.amount, 18));
                      } catch {
                        return sum;
                      }
                    }, 0);

                    // Get unique addresses
                    const uniqueAddresses = new Set([
                      ...payments.map(p => p.payer.toLowerCase()),
                      ...payments.map(p => p.merchant.toLowerCase())
                    ]).size;

                    // Calculate token distribution
                    const tokenDistribution = payments.reduce((acc, p) => {
                      const tokenAddr = p.token.toLowerCase();
                      if (!acc[tokenAddr]) {
                        acc[tokenAddr] = { count: 0, volume: 0, address: p.token };
                      }
                      acc[tokenAddr].count++;
                      try {
                        acc[tokenAddr].volume += parseFloat(formatPaymentAmount(p.amount, 18));
                      } catch {
                        // Skip invalid amounts
                      }
                      return acc;
                    }, {} as Record<string, { count: number; volume: number; address: string }>);

                    // Sort tokens by volume
                    const sortedTokens = Object.entries(tokenDistribution)
                      .sort(([, a], [, b]) => b.volume - a.volume)
                      .slice(0, 4);

                    // Calculate total for percentage
                    const totalTokenVolume = sortedTokens.reduce((sum, [, data]) => sum + data.volume, 0);

                    // Get token symbol from address (basic mapping)
                    const getTokenSymbol = (addr: string) => {
                      const lowerAddr = addr.toLowerCase();
                      if (lowerAddr === '0x0000000000000000000000000000000000000000') return 'BNB';
                      if (lowerAddr === '0x55d398326f99059ff775485246999027b3197955') return 'USDT';
                      if (lowerAddr === '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d') return 'USDC';
                      if (lowerAddr === '0x337610d27c682e347c9cd60bd4b3b107c9d34ddd') return 'USDT';
                      // WUSD token address
                      if (lowerAddr === '0x5e5e1bcf6e7b4f9d5b4b9e9f0c3c4d5e6f7a8b9c' || lowerAddr.includes('5e5e')) return 'WUSD';
                      // XUSD token address
                      if (lowerAddr === '0xbca3f2d1e4c5b6a7d8e9f0a1b2c3d4e5f6a7fab2' || lowerAddr.includes('bca3')) return 'XUSD';
                      if (lowerAddr === '0x60ea31f08d3a73fc3c43d4f8e28ee6edca2b8c0f') return 'USD1';
                      if (lowerAddr.includes('60ea')) return 'USD1';
                      return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
                    };

                    // Token logo paths - match actual files in public/
                    const tokenLogos: Record<string, string> = {
                      'BNB': '/bnblogo.png',
                      'USDT': '/usdt.png',
                      'USDC': '/usdc.png',
                      'USD1': '/USD1.png',
                      'WUSD': '/wusd.png',
                      'XUSD': '/xusd-removebg-preview.png',
                    };

                    // Color mapping for tokens (yellow/purple theme, no pink)
                    const tokenColors: Record<string, string> = {
                      'BNB': 'from-bnb-yellow to-amber-500',
                      'USDT': 'from-green-400 to-emerald-500',
                      'USDC': 'from-blue-400 to-blue-500',
                      'USD1': 'from-purple-500 to-purple-600',
                      'WUSD': 'from-cyan-400 to-cyan-500',
                      'XUSD': 'from-purple-400 to-violet-500',
                    };

                    const getTokenColor = (symbol: string) => tokenColors[symbol] || 'from-gray-400 to-gray-500';

                    // Calculate gift card volume (redeemed cards)
                    const giftCardVolume = giftCards
                      .filter(c => c.status === 'redeemed')
                      .reduce((sum, c) => sum + parseFloat(c.amount), 0);

                    // Combined totals
                    const combinedTransactions = totalTransactions + giftCardStats.redeemed;
                    const combinedVolume = totalVolume + giftCardVolume;

                    return (
                      <>
                        {/* Stats Cards - Combined Invoice/Subscription + Gift Card Analytics */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-8">
                          {/* Total Transactions */}
                          <div className="card-shadow rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-bnb-yellow/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                            <div className="relative">
                              <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-bnb-yellow/20 rounded-xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                                  </svg>
                                </div>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-green-500/20 text-green-400">
                                  Live
                                </span>
                              </div>
                              <p className="text-gray-400 text-sm mb-1">Total Transactions</p>
                              <p className="text-3xl font-bold text-white">{combinedTransactions.toLocaleString()}</p>
                              <p className="text-gray-500 text-xs mt-2">Payments + Gift Cards</p>
                            </div>
                          </div>

                          {/* Total Volume */}
                          <div className="card-shadow rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-green-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                            <div className="relative">
                              <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-green-500/20 rounded-xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                                  </svg>
                                </div>
                              </div>
                              <p className="text-gray-400 text-sm mb-1">Total Volume</p>
                              <p className="text-3xl font-bold text-white">{combinedVolume.toFixed(4)}</p>
                              <p className="text-gray-500 text-xs mt-2">Combined token value</p>
                            </div>
                          </div>

                          {/* Unique Addresses */}
                          <div className="card-shadow rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-purple-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                            <div className="relative">
                              <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-purple-500/20 rounded-xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                                  </svg>
                                </div>
                              </div>
                              <p className="text-gray-400 text-sm mb-1">Unique Addresses</p>
                              <p className="text-3xl font-bold text-white">{uniqueAddresses}</p>
                              <p className="text-gray-500 text-xs mt-2">Payers & merchants</p>
                            </div>
                          </div>

                          {/* Gift Cards Stats */}
                          <div className="card-shadow rounded-2xl p-6 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-500/10 to-transparent rounded-full -mr-16 -mt-16"></div>
                            <div className="relative">
                              <div className="flex items-center justify-between mb-4">
                                <div className="w-12 h-12 bg-amber-500/20 rounded-xl flex items-center justify-center">
                                  <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7"></path>
                                  </svg>
                                </div>
                                <span className="px-2 py-1 text-xs font-medium rounded bg-amber-500/20 text-amber-400">
                                  Gasless
                                </span>
                              </div>
                              <p className="text-gray-400 text-sm mb-1">Gift Cards</p>
                              <p className="text-3xl font-bold text-white">{giftCardStats.total}</p>
                              <p className="text-gray-500 text-xs mt-2">{giftCardStats.redeemed} redeemed / {giftCardStats.active} active</p>
                            </div>
                          </div>
                        </div>

                        {/* Token Distribution & Network Info */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                          {/* Token Distribution */}
                          <div className="card-shadow rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"></path>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"></path>
                              </svg>
                              <span>Token Usage</span>
                            </h3>
                            <div className="space-y-4">
                              {sortedTokens.map(([, data], idx) => {
                                const symbol = getTokenSymbol(data.address);
                                const percentage = totalTokenVolume > 0 ? ((data.volume / totalTokenVolume) * 100).toFixed(1) : '0';
                                const logoPath = tokenLogos[symbol];
                                return (
                                  <div key={idx} className="relative">
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center space-x-3">
                                        {logoPath ? (
                                          <img
                                            src={logoPath}
                                            alt={symbol}
                                            className="w-10 h-10 rounded-full object-cover shadow-lg"
                                            onError={(e) => {
                                              // Fallback to gradient if image fails to load
                                              const target = e.target as HTMLImageElement;
                                              target.style.display = 'none';
                                              target.nextElementSibling?.classList.remove('hidden');
                                            }}
                                          />
                                        ) : null}
                                        <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getTokenColor(symbol)} flex items-center justify-center shadow-lg ${logoPath ? 'hidden' : ''}`}>
                                          <span className="text-white text-sm font-bold">{symbol.slice(0, 2)}</span>
                                        </div>
                                        <div>
                                          <p className="text-white font-medium">{symbol}</p>
                                          <p className="text-gray-500 text-xs">{data.count} txns</p>
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-white font-semibold">{data.volume.toFixed(4)}</p>
                                        <p className="text-gray-500 text-xs">{percentage}%</p>
                                      </div>
                                    </div>
                                    <div className="h-2 bg-bnb-gray/50 rounded-full overflow-hidden">
                                      <div
                                        className={`h-full bg-gradient-to-r ${getTokenColor(symbol)} rounded-full transition-all duration-500`}
                                        style={{ width: `${percentage}%` }}
                                      ></div>
                                    </div>
                                  </div>
                                );
                              })}
                              {sortedTokens.length === 0 && (
                                <p className="text-gray-500 text-center py-4">No token data available</p>
                              )}
                            </div>
                          </div>

                          {/* Network Info */}
                          <div className="card-shadow rounded-2xl p-6">
                            <h3 className="text-lg font-semibold text-white mb-4 flex items-center space-x-2">
                              <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
                              </svg>
                              <span>Network Info</span>
                            </h3>
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-4 bg-bnb-gray/30 rounded-xl">
                                <div className="flex items-center space-x-3">
                                  <div className="w-10 h-10 bg-bnb-yellow/20 rounded-lg flex items-center justify-center">
                                    <svg className="w-5 h-5 text-bnb-yellow" viewBox="0 0 126.61 126.61">
                                      <g fill="currentColor">
                                        <path d="M38.73 53.64L63.3 29.06l24.58 24.58 14.3-14.3L63.3.46l-38.87 38.88z"/>
                                        <path d="M.46 63.3l14.3-14.3L29.06 63.3l-14.3 14.3zM38.73 72.97L63.3 97.55l24.58-24.58 14.3 14.29-38.88 38.89-38.87-38.88-.01-.01z"/>
                                        <path d="M97.55 63.31l14.3-14.3 14.3 14.3-14.3 14.3zM77.84 63.3l-14.54-14.54-10.97 10.97-.4.4-3.18 3.18 14.55 14.54 14.54-14.54z"/>
                                      </g>
                                    </svg>
                                  </div>
                                  <div>
                                    <p className="text-white font-medium">BNB Chain</p>
                                    <p className="text-gray-500 text-xs">{network === 'mainnet' ? 'Chain ID: 56' : 'Chain ID: 97'}</p>
                                  </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                                  <span className="text-green-400 text-sm font-medium">Connected</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-bnb-gray/30 rounded-xl">
                                  <p className="text-gray-400 text-xs mb-1">Avg Gas Cost</p>
                                  <p className="text-white font-semibold">~$0.005</p>
                                </div>
                                <div className="p-4 bg-bnb-gray/30 rounded-xl">
                                  <p className="text-gray-400 text-xs mb-1">Block Time</p>
                                  <p className="text-white font-semibold">~3 sec</p>
                                </div>
                              </div>

                              <div className="p-4 bg-gradient-to-r from-bnb-yellow/10 to-amber-500/10 rounded-xl border border-bnb-yellow/20">
                                <div className="flex items-center space-x-2 mb-2">
                                  <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                                  </svg>
                                  <p className="text-bnb-yellow font-medium text-sm">x402 Flex Protocol</p>
                                </div>
                                <p className="text-gray-400 text-xs">All payments route through BNBPayRouter for deterministic settlement</p>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Recent Transactions Table */}
                        {(() => {
                          // Filter payments based on search
                          const filteredPayments = payments.filter((payment) => {
                            if (!txSearchQuery) return true;
                            const query = txSearchQuery.toLowerCase();
                            return (
                              (payment.txHash?.toLowerCase().includes(query)) ||
                              (payment.paymentId?.toLowerCase().includes(query)) ||
                              (payment.payer?.toLowerCase().includes(query)) ||
                              (payment.merchant?.toLowerCase().includes(query)) ||
                              (payment.reference?.toLowerCase().includes(query))
                            );
                          });

                          // Pagination logic
                          const totalPages = Math.ceil(filteredPayments.length / TX_PER_PAGE);
                          const startIdx = (txPage - 1) * TX_PER_PAGE;
                          const endIdx = startIdx + TX_PER_PAGE;
                          const paginatedPayments = filteredPayments.slice(startIdx, endIdx);

                          return (
                            <div className="card-shadow rounded-2xl overflow-hidden">
                              <div className="p-4 sm:p-6 border-b border-bnb-gray">
                                <div className="flex flex-col gap-4">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <h3 className="text-lg font-semibold text-white flex items-center space-x-2">
                                      <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                                      </svg>
                                      <span>Recent Transactions</span>
                                    </h3>
                                    <span className="text-gray-400 text-sm">
                                      {txSearchQuery ? (
                                        <>Found {filteredPayments.length} result{filteredPayments.length !== 1 ? 's' : ''}</>
                                      ) : (
                                        <>Showing {filteredPayments.length > 0 ? startIdx + 1 : 0}-{Math.min(endIdx, filteredPayments.length)} of {totalTransactions}</>
                                      )}
                                    </span>
                                  </div>

                                  {/* Search Bar for Transactions */}
                                  <div className="relative">
                                    <input
                                      type="text"
                                      placeholder="Search by BSC transaction hash, payment ID, or address..."
                                      value={txSearchQuery}
                                      onChange={(e) => {
                                        setTxSearchQuery(e.target.value);
                                        setTxPage(1); // Reset to first page on search
                                      }}
                                      className="w-full bg-bnb-gray/30 text-white placeholder-gray-500 px-4 py-3 pl-12 rounded-xl border border-bnb-gray focus:border-bnb-yellow focus:outline-none transition-colors text-sm"
                                    />
                                    <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                    </svg>
                                    {txSearchQuery && (
                                      <button
                                        onClick={() => {
                                          setTxSearchQuery('');
                                          setTxPage(1);
                                        }}
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                                      >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* No Results State */}
                              {filteredPayments.length === 0 && txSearchQuery && (
                                <div className="p-8 text-center">
                                  <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                                  </svg>
                                  <h4 className="text-gray-400 font-medium mb-1">No transactions found</h4>
                                  <p className="text-gray-500 text-sm mb-3">No transactions match "{txSearchQuery}"</p>
                                  <button
                                    onClick={() => setTxSearchQuery('')}
                                    className="px-4 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all text-sm font-semibold"
                                  >
                                    Clear Search
                                  </button>
                                </div>
                              )}

                              {/* Table Header - only show when there are results */}
                              {filteredPayments.length > 0 && (
                                <>
                                  <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-bnb-gray/30 text-gray-400 text-xs font-medium uppercase tracking-wider">
                                    <div className="col-span-3">Payment ID</div>
                                    <div className="col-span-2">Amount</div>
                                    <div className="col-span-2">From</div>
                                    <div className="col-span-2">To</div>
                                    <div className="col-span-1">Status</div>
                                    <div className="col-span-2">Time</div>
                                  </div>

                                  {/* Table Body */}
                                  <div className="divide-y divide-bnb-gray/50">
                                {paginatedPayments.map((payment: Payment, index: number) => (
                                  <div
                                    key={payment.paymentId || index}
                                    className="group px-6 py-4 hover:bg-bnb-gray/20 transition-colors cursor-pointer"
                                    onClick={() => {
                                      if (payment.txHash) {
                                        window.open(`${payment.network === 'bnb' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${payment.txHash}`, '_blank');
                                      }
                                    }}
                                  >
                                    {/* Desktop View */}
                                    <div className="hidden md:grid grid-cols-12 gap-4 items-center">
                                      <div className="col-span-3">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-white font-mono text-sm group-hover:text-bnb-yellow transition-colors">
                                            {payment.paymentId.slice(0, 10)}...{payment.paymentId.slice(-4)}
                                          </span>
                                          <svg className="w-3 h-3 text-gray-500 group-hover:text-bnb-yellow opacity-0 group-hover:opacity-100 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                                          </svg>
                                        </div>
                                      </div>
                                      <div className="col-span-2">
                                        <div className="flex items-center space-x-2">
                                          <span className="text-bnb-yellow font-semibold">{formatPaymentAmount(payment.amount, 18)}</span>
                                          <span className="text-gray-500 text-xs">{getTokenSymbol(payment.token)}</span>
                                        </div>
                                      </div>
                                      <div className="col-span-2">
                                        <span className="text-gray-300 font-mono text-sm">{formatAddress(payment.payer)}</span>
                                      </div>
                                      <div className="col-span-2">
                                        <span className="text-gray-300 font-mono text-sm">{formatAddress(payment.merchant)}</span>
                                      </div>
                                      <div className="col-span-1">
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full mr-1.5"></span>
                                          Settled
                                        </span>
                                      </div>
                                      <div className="col-span-2">
                                        <span className="text-gray-400 text-sm">{formatDate(new Date(payment.timestamp).getTime())}</span>
                                      </div>
                                    </div>

                                    {/* Mobile View */}
                                    <div className="md:hidden space-y-3">
                                      <div className="flex items-center justify-between">
                                        <span className="text-white font-mono text-sm">
                                          {payment.paymentId.slice(0, 8)}...{payment.paymentId.slice(-4)}
                                        </span>
                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400">
                                          Settled
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <span className="text-bnb-yellow font-semibold">{formatPaymentAmount(payment.amount, 18)} {getTokenSymbol(payment.token)}</span>
                                        <span className="text-gray-400 text-xs">{formatDate(new Date(payment.timestamp).getTime())}</span>
                                      </div>
                                      <div className="flex items-center space-x-4 text-xs">
                                        <span className="text-gray-500">From: <span className="text-gray-300 font-mono">{formatAddress(payment.payer)}</span></span>
                                        <span className="text-gray-500">To: <span className="text-gray-300 font-mono">{formatAddress(payment.merchant)}</span></span>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                                  </div>

                                  {/* Pagination Footer */}
                                  <div className="px-4 sm:px-6 py-4 bg-bnb-gray/20 border-t border-bnb-gray/30">
                                <div className="flex items-center justify-between">
                                  <p className="text-gray-400 text-sm">
                                    Page {txPage} of {totalPages || 1}
                                  </p>
                                  <div className="flex items-center space-x-2">
                                    <button
                                      onClick={() => setTxPage(Math.max(1, txPage - 1))}
                                      disabled={txPage === 1}
                                      className="flex items-center space-x-1 px-3 py-1.5 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                                    >
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7"></path>
                                      </svg>
                                      <span className="text-sm">Prev</span>
                                    </button>

                                    {/* Page numbers */}
                                    <div className="flex items-center space-x-1">
                                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum;
                                        if (totalPages <= 5) {
                                          pageNum = i + 1;
                                        } else if (txPage <= 3) {
                                          pageNum = i + 1;
                                        } else if (txPage >= totalPages - 2) {
                                          pageNum = totalPages - 4 + i;
                                        } else {
                                          pageNum = txPage - 2 + i;
                                        }
                                        return (
                                          <button
                                            key={pageNum}
                                            onClick={() => setTxPage(pageNum)}
                                            className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${
                                              txPage === pageNum
                                                ? 'bg-bnb-yellow text-bnb-dark'
                                                : 'bg-bnb-gray/50 text-gray-300 hover:bg-bnb-gray hover:text-white'
                                            }`}
                                          >
                                            {pageNum}
                                          </button>
                                        );
                                      })}
                                    </div>

                                    <button
                                      onClick={() => setTxPage(Math.min(totalPages, txPage + 1))}
                                      disabled={txPage === totalPages || totalPages === 0}
                                      className="flex items-center space-x-1 px-3 py-1.5 bg-bnb-gray/50 hover:bg-bnb-yellow hover:text-bnb-dark text-gray-300 rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-bnb-gray/50 disabled:hover:text-gray-300"
                                    >
                                      <span className="text-sm">Next</span>
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                                      </svg>
                                    </button>
                                    </div>
                                  </div>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })()}

                        {/* Invoice Reference Pattern Info */}
                        <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20">
                          <div className="flex items-start space-x-3">
                            <svg className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            <div>
                              <p className="text-white font-medium text-sm mb-1">Invoice Linking Pattern</p>
                              <p className="text-gray-400 text-xs">
                                Payments are linked to invoices using the canonical reference format: <code className="text-blue-400 bg-blue-500/10 px-1 rounded">invoice:{'<invoiceId>'}</code>.
                                When creating payments, ensure your referenceData matches this pattern for automatic invoice status updates.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Gasless Relayer Info */}
                        <div className="mt-4 p-4 bg-gradient-to-r from-amber-500/10 to-orange-500/10 rounded-xl border border-amber-500/20">
                          <div className="flex items-start space-x-3">
                            <svg className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                            </svg>
                            <div>
                              <p className="text-white font-medium text-sm mb-1">Gasless Relayer API</p>
                              <p className="text-gray-400 text-xs">
                                All transactions (invoices, subscriptions, and gift cards) are processed through the <span className="text-amber-400">BNBPay Gasless Relayer</span>.
                                The relayer sponsors gas fees for recipients, enabling seamless on-chain payments without requiring users to hold BNB for gas.
                                Gift card redemptions use the same relayer infrastructure as regular payments.
                              </p>
                            </div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

            </>
          )}

          {/* Back to Home */}
          {walletAddress && (
            <div className="text-center mt-12">
              <a
                href="/"
                className="inline-flex items-center space-x-2 text-bnb-yellow hover:text-yellow-500 font-semibold transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
                <span>Back to Home</span>
              </a>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
