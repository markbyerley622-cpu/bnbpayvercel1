/**
 * Customer Payment Layout
 *
 * Wraps payment pages (invoice/subscription) with customer-mode UI:
 * - Customer header with wallet connect and receipt history
 * - Receipt storage integration
 * - Safe error handling
 */

import { useState, useCallback } from 'react';
import { CustomerHeader } from './CustomerHeader';
import { ReceiptHistory } from './ReceiptHistory';
import { FloatingParticles } from './FloatingParticles';
import type { NetworkType } from '../lib/web3';
import type { PaymentReceipt } from '../lib/receipt-storage';
import { downloadReceiptPng } from '../lib/receipt-generator';
import { ErrorCode, getSafeMessage, logInternalError } from '../lib/error-codes';
import { AlertBanner } from './ErrorUI';

// ============================================================================
// Types
// ============================================================================

interface CustomerPaymentLayoutProps {
  children: React.ReactNode;
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  walletAddress: string | null;
  onWalletChanged: (address: string | null) => void;
  merchantName?: string;
  title?: string;
}

// ============================================================================
// Component
// ============================================================================

export function CustomerPaymentLayout({
  children,
  network,
  onNetworkChange,
  walletAddress,
  onWalletChanged,
  merchantName,
  title,
}: CustomerPaymentLayoutProps) {
  const [showReceiptHistory, setShowReceiptHistory] = useState(false);
  const [error, setError] = useState<{
    message: string;
    referenceId: string;
  } | null>(null);

  // Handle receipt view - open in new window
  const handleViewReceipt = useCallback(async (receipt: PaymentReceipt) => {
    try {
      setError(null);
      // For view, just open transaction on explorer if txHash exists
      if (receipt.txHash) {
        const explorerUrl = `https://${receipt.network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${receipt.txHash}`;
        window.open(explorerUrl, '_blank');
      }
    } catch (err) {
      const referenceId = logInternalError(ErrorCode.UNKNOWN_ERROR, err, {
        action: 'viewReceipt',
        receiptId: receipt.id,
      });
      setError({
        message: getSafeMessage(ErrorCode.UNKNOWN_ERROR),
        referenceId,
      });
    }
  }, []);

  // Handle receipt download
  const handleDownloadReceipt = useCallback(async (receipt: PaymentReceipt) => {
    try {
      setError(null);
      await downloadReceiptPng(receipt);
    } catch (err) {
      const referenceId = logInternalError(ErrorCode.UNKNOWN_ERROR, err, {
        action: 'downloadReceipt',
        receiptId: receipt.id,
      });
      setError({
        message: 'Failed to download receipt. Please try again.',
        referenceId,
      });
    }
  }, []);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-bnb-dark via-gray-900 to-bnb-dark overflow-hidden">
      {/* Background Animation */}
      <FloatingParticles />

      {/* Customer Header */}
      <CustomerHeader
        network={network}
        onNetworkChange={onNetworkChange}
        onWalletChanged={onWalletChanged}
        walletAddress={walletAddress}
        onOpenReceiptHistory={() => setShowReceiptHistory(true)}
        title={title}
        merchantName={merchantName}
      />

      {/* Error Banner */}
      {error && (
        <div className="max-w-4xl mx-auto px-4 pt-4">
          <AlertBanner
            message={error.message}
            type="error"
            referenceId={error.referenceId}
            onDismiss={clearError}
          />
        </div>
      )}

      {/* Main Content */}
      <main className="relative z-10">
        {children}
      </main>

      {/* Receipt History Modal */}
      <ReceiptHistory
        isOpen={showReceiptHistory}
        onClose={() => setShowReceiptHistory(false)}
        walletAddress={walletAddress}
        onViewReceipt={handleViewReceipt}
        onDownloadReceipt={handleDownloadReceipt}
      />

      {/* Footer */}
      <footer className="relative z-10 py-6 text-center">
        <p className="text-sm text-gray-500">
          Powered by{' '}
          <span className="text-bnb-yellow font-semibold">BNBPay</span>
          {' • '}
          <span className="text-gray-400">x402 Flex</span>
        </p>
      </footer>
    </div>
  );
}

// ============================================================================
// Receipt Save Helper Hook
// ============================================================================

import { useCallback as useCallbackReact } from 'react';
import { createInvoiceReceipt, createSubscriptionReceipt } from '../lib/receipt-storage';

export interface SaveReceiptParams {
  walletAddress: string;
  type: 'invoice' | 'subscription';
  id: string;
  reference: string;
  amount: string;
  currency: string;
  token: string;
  merchantAddress: string;
  merchantName?: string;
  description?: string;
  txHash?: string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  network: 'mainnet' | 'testnet';
}

export function useSaveReceipt() {
  const saveReceipt = useCallbackReact((params: SaveReceiptParams) => {
    try {
      if (params.type === 'invoice') {
        return createInvoiceReceipt({
          walletAddress: params.walletAddress,
          invoiceId: params.id,
          reference: params.reference,
          amount: params.amount,
          currency: params.currency,
          token: params.token,
          merchantAddress: params.merchantAddress,
          merchantName: params.merchantName,
          payerWallet: params.walletAddress,
          description: params.description,
          txHash: params.txHash,
          status: params.status,
          network: params.network,
        });
      } else {
        return createSubscriptionReceipt({
          walletAddress: params.walletAddress,
          subscriptionId: params.id,
          planName: params.description || 'Subscription',
          reference: params.reference,
          amount: params.amount,
          currency: params.currency,
          token: params.token,
          merchantAddress: params.merchantAddress,
          merchantName: params.merchantName,
          payerWallet: params.walletAddress,
          txHash: params.txHash,
          status: params.status,
          network: params.network,
        });
      }
    } catch (error) {
      console.error('[SaveReceipt] Failed to save receipt:', error);
      return null;
    }
  }, []);

  return { saveReceipt };
}

export default CustomerPaymentLayout;
