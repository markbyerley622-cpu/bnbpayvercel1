/**
 * Receipt History Component
 *
 * Displays payment receipts grouped by type (invoices/subscriptions).
 * Includes view and download options for each receipt.
 * Bounded layout - errors never overflow or break UI.
 */

import { useState, useMemo } from 'react';
import { useReceiptStorage, type PaymentReceipt } from '../lib/receipt-storage';
import { formatAddress } from '../lib/web3';
import { ErrorCode, getSafeMessage } from '../lib/error-codes';

// ============================================================================
// Types
// ============================================================================

interface ReceiptHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string | null;
  onViewReceipt?: (receipt: PaymentReceipt) => void;
  onDownloadReceipt?: (receipt: PaymentReceipt) => void;
}

type TabType = 'all' | 'invoices' | 'subscriptions';

// ============================================================================
// Receipt History Modal
// ============================================================================

export function ReceiptHistory({
  isOpen,
  onClose,
  walletAddress,
  onViewReceipt,
  onDownloadReceipt,
}: ReceiptHistoryProps) {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [error, setError] = useState<string | null>(null);

  const { receipts, loading, invoiceReceipts, subscriptionReceipts, summary } =
    useReceiptStorage(walletAddress);

  // Filter receipts based on active tab
  const displayedReceipts = useMemo(() => {
    switch (activeTab) {
      case 'invoices':
        return invoiceReceipts;
      case 'subscriptions':
        return subscriptionReceipts;
      default:
        return receipts;
    }
  }, [activeTab, receipts, invoiceReceipts, subscriptionReceipts]);

  // Handle download with error catching
  const handleDownload = async (receipt: PaymentReceipt) => {
    try {
      setError(null);
      if (onDownloadReceipt) {
        onDownloadReceipt(receipt);
      }
    } catch (err) {
      setError(getSafeMessage(ErrorCode.UNKNOWN_ERROR));
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-history-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-bnb-dark border border-bnb-gray rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-bnb-gray flex items-center justify-between flex-shrink-0">
          <div>
            <h2
              id="receipt-history-title"
              className="text-xl font-bold text-white"
            >
              My Receipts
            </h2>
            {walletAddress && (
              <p className="text-xs text-gray-500 mt-1 font-mono">
                {formatAddress(walletAddress)}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-bnb-gray"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-bnb-gray flex-shrink-0">
          <div className="flex space-x-1 bg-bnb-gray/50 rounded-lg p-1">
            <TabButton
              active={activeTab === 'all'}
              onClick={() => setActiveTab('all')}
              count={receipts.length}
            >
              All
            </TabButton>
            <TabButton
              active={activeTab === 'invoices'}
              onClick={() => setActiveTab('invoices')}
              count={invoiceReceipts.length}
            >
              Invoices
            </TabButton>
            <TabButton
              active={activeTab === 'subscriptions'}
              onClick={() => setActiveTab('subscriptions')}
              count={subscriptionReceipts.length}
            >
              Subscriptions
            </TabButton>
          </div>
        </div>

        {/* Summary Stats */}
        {walletAddress && (
          <div className="px-6 py-3 bg-bnb-gray/30 border-b border-bnb-gray flex-shrink-0">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-bnb-yellow">{summary().totalPaid}</p>
                <p className="text-xs text-gray-500">Completed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-500">{summary().totalPending}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{summary().totalAmount}</p>
                <p className="text-xs text-gray-500">Total Paid</p>
              </div>
            </div>
          </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="px-6 py-3 bg-red-500/10 border-b border-red-500/20 flex-shrink-0">
            <p className="text-sm text-red-400 truncate">{error}</p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!walletAddress ? (
            <EmptyState
              icon="wallet"
              title="Connect Wallet"
              description="Connect your wallet to view your payment receipts"
            />
          ) : loading ? (
            <LoadingState />
          ) : displayedReceipts.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="No Receipts"
              description={
                activeTab === 'all'
                  ? "You haven't made any payments yet"
                  : `No ${activeTab} found`
              }
            />
          ) : (
            <div className="space-y-3">
              {displayedReceipts.map((receipt) => (
                <ReceiptCard
                  key={receipt.id}
                  receipt={receipt}
                  onView={() => onViewReceipt?.(receipt)}
                  onDownload={() => handleDownload(receipt)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-bnb-gray/30 border-t border-bnb-gray text-center flex-shrink-0">
          <p className="text-xs text-gray-500">
            Receipts are stored locally on this device
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Tab Button
// ============================================================================

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  count: number;
  children: React.ReactNode;
}

function TabButton({ active, onClick, count, children }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${
        active
          ? 'bg-bnb-yellow text-bnb-dark'
          : 'text-gray-400 hover:text-white hover:bg-bnb-gray'
      }`}
    >
      {children}
      <span
        className={`ml-2 text-xs px-1.5 py-0.5 rounded-full ${
          active ? 'bg-bnb-dark/20 text-bnb-dark' : 'bg-bnb-gray text-gray-500'
        }`}
      >
        {count}
      </span>
    </button>
  );
}

// ============================================================================
// Receipt Card
// ============================================================================

interface ReceiptCardProps {
  receipt: PaymentReceipt;
  onView?: () => void;
  onDownload?: () => void;
}

function ReceiptCard({ receipt, onView, onDownload }: ReceiptCardProps) {
  const statusStyles = {
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    paid: 'bg-green-500/10 text-green-500 border-green-500/30',
    failed: 'bg-red-500/10 text-red-500 border-red-500/30',
    cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  };

  const typeIcons = {
    invoice: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
    subscription: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-bnb-gray/50 border border-bnb-gray rounded-xl p-4 hover:border-bnb-yellow/30 transition-colors">
      <div className="flex items-start justify-between gap-4">
        {/* Left: Icon + Info */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {/* Type Icon */}
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
              receipt.type === 'invoice'
                ? 'bg-blue-500/10 text-blue-400'
                : 'bg-purple-500/10 text-purple-400'
            }`}
          >
            {typeIcons[receipt.type]}
          </div>

          {/* Details */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-white truncate">
                {receipt.description || receipt.reference || `Payment ${receipt.id.slice(-8)}`}
              </h3>
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${statusStyles[receipt.status]}`}
              >
                {receipt.status}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {formatDate(receipt.timestamp)}
            </p>
            {receipt.merchantName && (
              <p className="text-xs text-gray-400 mt-0.5 truncate">
                To: {receipt.merchantName}
              </p>
            )}
          </div>
        </div>

        {/* Right: Amount */}
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-bold text-white">
            {receipt.amount} <span className="text-sm text-gray-400">{receipt.token}</span>
          </p>
          <p className="text-xs text-gray-500 capitalize">{receipt.type}</p>
        </div>
      </div>

      {/* Transaction Hash */}
      {receipt.txHash && (
        <div className="mt-3 pt-3 border-t border-bnb-gray/50 flex items-center justify-between">
          <p className="text-xs text-gray-500 font-mono truncate flex-1">
            Tx: {receipt.txHash.slice(0, 12)}...{receipt.txHash.slice(-8)}
          </p>
          <a
            href={`https://${receipt.network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${receipt.txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-bnb-yellow hover:underline ml-2"
          >
            View
          </a>
        </div>
      )}

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-bnb-gray/50 flex items-center gap-2">
        {onView && (
          <button
            onClick={onView}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-bnb-gray text-gray-300 rounded-lg text-sm font-medium hover:bg-bnb-yellow/10 hover:text-bnb-yellow transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
              />
            </svg>
            View Receipt
          </button>
        )}
        {onDownload && (
          <button
            onClick={onDownload}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-bnb-yellow text-bnb-dark rounded-lg text-sm font-bold hover:bg-yellow-500 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Download PNG
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Empty State
// ============================================================================

interface EmptyStateProps {
  icon: 'wallet' | 'receipt';
  title: string;
  description: string;
}

function EmptyState({ icon, title, description }: EmptyStateProps) {
  const icons = {
    wallet: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
        />
      </svg>
    ),
    receipt: (
      <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.5"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    ),
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="w-20 h-20 bg-bnb-gray rounded-full flex items-center justify-center text-gray-500 mb-4">
        {icons[icon]}
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">{title}</h3>
      <p className="text-sm text-gray-500 max-w-xs">{description}</p>
    </div>
  );
}

// ============================================================================
// Loading State
// ============================================================================

function LoadingState() {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="w-10 h-10 border-3 border-bnb-yellow/30 border-t-bnb-yellow rounded-full animate-spin mb-4" />
      <p className="text-sm text-gray-500">Loading receipts...</p>
    </div>
  );
}

export default ReceiptHistory;
