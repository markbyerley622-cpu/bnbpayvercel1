/**
 * Invoice Payment Modal Component
 *
 * Displays an invoice and provides Permit2-based gasless payment functionality.
 * Handles approval flow, signature requests, and payment status tracking.
 *
 * ERROR HANDLING:
 * - All errors are caught and displayed safely via bounded UI components
 * - Internal error details (stack traces, raw errors) are NEVER shown to users
 * - User-facing messages are generic but helpful
 */

import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import type { Invoice } from '../hooks/useInvoices';
import { useGaslessPayment } from '../hooks/useGaslessPayment';
import {
  ErrorCode,
  getSafeMessage,
  mapToErrorCode,
  logInternalError,
  generateReferenceId,
  isRetryableError,
} from '../lib/error-codes';
import { AlertBanner } from './ErrorUI';

export interface InvoicePaymentProps {
  invoice: Invoice;
  signer?: ethers.Signer;
  provider?: ethers.Provider;
  onPaymentSuccess?: (txHash: string, paymentId: string) => void;
  onPaymentError?: (error: Error) => void;
  onClose?: () => void;
}

export function InvoicePayment({
  invoice,
  signer,
  provider,
  onPaymentSuccess,
  onPaymentError,
  onClose,
}: InvoicePaymentProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [paymentLink, setPaymentLink] = useState<string>('');
  const [copiedQR, setCopiedQR] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'approving' | 'signing' | 'relaying' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  // Safe error state - NEVER expose internal details
  const [safeError, setSafeError] = useState<{
    code: ErrorCode;
    message: string;
    referenceId: string;
    canRetry: boolean;
  } | null>(null);

  // Handle error safely - internal details logged, user gets friendly message
  const handleSafeError = (err: unknown, context?: Record<string, unknown>) => {
    const errorCode = mapToErrorCode(err);
    const referenceId = logInternalError(errorCode, err, {
      invoiceId: invoice.id,
      merchantAddress: invoice.merchantAddress,
      ...context,
    });

    setSafeError({
      code: errorCode,
      message: getSafeMessage(errorCode),
      referenceId,
      canRetry: isRetryableError(errorCode),
    });

    setPaymentStatus('error');
    setStatusMessage(''); // Clear old message, error component handles display
  };

  // Clear safe error
  const clearSafeError = () => {
    setSafeError(null);
    setPaymentStatus('idle');
    setStatusMessage('');
  };

  const {
    payGasless,
    checkPermit2Approval,
    approveToken,
    loading,
    approving,
    error,
    requiresApproval,
    clearError,
  } = useGaslessPayment();

  // Generate QR code and payment link
  useEffect(() => {
    const generateQR = async () => {
      // Payment link format: bnbpay://pay?invoice=INV123&amount=10.50&token=USDT
      const link = `bnbpay://pay?invoice=${invoice.id}&amount=${invoice.amount}&token=${invoice.currency}&merchant=${invoice.merchantAddress}&network=${invoice.network}`;
      setPaymentLink(link);

      try {
        const qr = await QRCode.toDataURL(link, {
          width: 300,
          margin: 2,
          color: {
            dark: '#0B0E11',
            light: '#FFFFFF',
          },
        });
        setQrCodeUrl(qr);
      } catch (err) {
        console.error('Failed to generate QR code:', err);
      }
    };

    generateQR();
  }, [invoice]);

  // Check approval status on mount
  useEffect(() => {
    const checkApproval = async () => {
      if (!signer || !provider) return;

      try {
        const owner = await signer.getAddress();
        await checkPermit2Approval(invoice.tokenAddress, owner, provider);
      } catch (err) {
        console.error('Failed to check approval:', err);
      }
    };

    checkApproval();
  }, [invoice.tokenAddress, signer, provider, checkPermit2Approval]);

  const handleCopyQR = async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopiedQR(true);
      setTimeout(() => setCopiedQR(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(paymentLink);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleApproveToken = async () => {
    if (!signer) {
      setSafeError({
        code: ErrorCode.WALLET_NOT_CONNECTED,
        message: getSafeMessage(ErrorCode.WALLET_NOT_CONNECTED),
        referenceId: generateReferenceId(),
        canRetry: false,
      });
      setPaymentStatus('error');
      return;
    }

    try {
      setPaymentStatus('approving');
      setStatusMessage('Requesting token approval...');
      clearError();
      clearSafeError();

      await approveToken(invoice.tokenAddress, signer);

      setStatusMessage('Token approved successfully!');
      setTimeout(() => {
        setPaymentStatus('idle');
        setStatusMessage('');
      }, 3000);
    } catch (err: unknown) {
      // Safe error handling - NEVER show raw error to user
      handleSafeError(err, { action: 'approveToken', token: invoice.currency });
      onPaymentError?.(err instanceof Error ? err : new Error('Approval failed'));
    }
  };

  const handlePayWithPermit2 = async () => {
    if (!signer || !provider) {
      setSafeError({
        code: ErrorCode.WALLET_NOT_CONNECTED,
        message: getSafeMessage(ErrorCode.WALLET_NOT_CONNECTED),
        referenceId: generateReferenceId(),
        canRetry: false,
      });
      setPaymentStatus('error');
      return;
    }

    try {
      setPaymentStatus('signing');
      setStatusMessage('Requesting signatures...');
      clearError();
      clearSafeError();

      const result = await payGasless({
        merchantAddress: invoice.merchantAddress,
        amount: invoice.amount,
        paymentToken: invoice.currency,
        tokenAddress: invoice.tokenAddress,
        invoiceId: invoice.id,
        network: invoice.network,
        signer,
        provider,
      });

      setPaymentStatus('success');
      setStatusMessage('Payment successful!');

      // Notify parent component
      onPaymentSuccess?.(result.txHash, result.paymentId);

      // Auto-close after 3 seconds
      setTimeout(() => {
        onClose?.();
      }, 3000);
    } catch (err: unknown) {
      // Safe error handling - NEVER expose raw error to user
      // Generic message for payment failures to avoid leaking internal details
      handleSafeError(err, {
        action: 'payWithPermit2',
        invoiceAmount: invoice.amount,
        token: invoice.currency,
      });
      onPaymentError?.(err instanceof Error ? err : new Error('Payment failed'));
    }
  };

  const isExpired = new Date() > invoice.dueDate;
  const canPay = invoice.status === 'pending' && !isExpired;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-card max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-6 rounded-t-2xl text-white">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold mb-2">Invoice Payment</h2>
              <p className="text-sm opacity-90">Invoice #{invoice.id}</p>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white text-2xl leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Invoice Details */}
        <div className="p-6 space-y-4">
          {/* Amount */}
          <div className="text-center py-6 bg-gray-50 rounded-lg">
            <div className="text-4xl font-bold text-gray-900">
              {invoice.amount} {invoice.currency}
            </div>
            <div className="text-sm text-gray-600 mt-2">
              {invoice.description}
            </div>
          </div>

          {/* Customer Info */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Customer:</span>
              <div className="font-medium">{invoice.customerName}</div>
              <div className="text-gray-500">{invoice.customerEmail}</div>
            </div>
            <div>
              <span className="text-gray-600">Due Date:</span>
              <div className="font-medium">
                {invoice.dueDate.toLocaleDateString()}
              </div>
              {isExpired && (
                <div className="text-red-600 font-semibold mt-1">EXPIRED</div>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">Status:</span>
            <span
              className={`font-semibold ${
                invoice.status === 'paid'
                  ? 'text-green-600'
                  : invoice.status === 'pending'
                  ? 'text-yellow-600'
                  : 'text-red-600'
              }`}
            >
              {invoice.status.toUpperCase()}
            </span>
          </div>

          {/* QR Code */}
          {qrCodeUrl && (
            <div className="text-center py-4">
              <img
                src={qrCodeUrl}
                alt="Payment QR Code"
                className="mx-auto rounded-lg shadow-md"
              />
              <button
                onClick={handleCopyQR}
                className="mt-3 text-sm text-blue-600 hover:text-blue-700"
              >
                {copiedQR ? '✓ Copied!' : 'Copy Payment Link'}
              </button>
            </div>
          )}

          {/* Payment Link */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="text-sm text-gray-600 mb-2">Payment Link:</div>
            <div className="flex gap-2">
              <input
                type="text"
                value={paymentLink}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm font-mono"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-bnb-yellow text-gray-900 font-semibold rounded-lg hover:bg-yellow-500 transition-colors"
              >
                {copiedLink ? '✓' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Payment Status Message */}
          {statusMessage && (
            <div
              className={`p-4 rounded-lg ${
                paymentStatus === 'success'
                  ? 'bg-green-50 text-green-700'
                  : paymentStatus === 'error'
                  ? 'bg-red-50 text-red-700'
                  : 'bg-blue-50 text-blue-700'
              }`}
            >
              {statusMessage}
            </div>
          )}

          {/* Safe Error Display - bounded, no internal details */}
          {safeError && (
            <AlertBanner
              message={safeError.message}
              type="error"
              referenceId={safeError.referenceId}
              showRetry={safeError.canRetry}
              onRetry={safeError.canRetry ? () => {
                clearSafeError();
                handlePayWithPermit2();
              } : undefined}
              onDismiss={clearSafeError}
            />
          )}

          {/* Legacy error display (from hook) - also wrapped safely */}
          {error && !safeError && (
            <AlertBanner
              message={getSafeMessage(mapToErrorCode(error))}
              type="error"
              referenceId={generateReferenceId()}
              onDismiss={clearError}
            />
          )}

          {/* Payment Actions */}
          {canPay && signer && provider && (
            <div className="space-y-3 pt-4 border-t">
              {requiresApproval && (
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm text-yellow-800 mb-3">
                    <strong>First-time setup required:</strong> You need to approve
                    Permit2 to transfer {invoice.currency} on your behalf. This is a
                    one-time approval.
                  </div>
                  <button
                    onClick={handleApproveToken}
                    disabled={approving}
                    className="w-full px-6 py-3 bg-yellow-500 text-white font-bold rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {approving ? 'Approving...' : 'Approve Token'}
                  </button>
                </div>
              )}

              <button
                onClick={handlePayWithPermit2}
                disabled={loading || approving || requiresApproval || paymentStatus === 'success'}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all transform hover:scale-[1.02]"
              >
                {loading
                  ? 'Processing...'
                  : requiresApproval
                  ? 'Approve Token First'
                  : paymentStatus === 'success'
                  ? '✓ Payment Complete'
                  : `Pay ${invoice.amount} ${invoice.currency} (Gasless)`}
              </button>

              <div className="text-xs text-center text-gray-500">
                ⚡ Gasless payment via Permit2 • No gas fees • Relayed by BNBPay
              </div>
            </div>
          )}

          {!canPay && (
            <div className="p-4 bg-gray-100 rounded-lg text-center text-gray-700">
              {isExpired
                ? 'This invoice has expired'
                : invoice.status === 'paid'
                ? '✓ Invoice already paid'
                : 'Invoice cannot be paid at this time'}
            </div>
          )}

          {!signer && canPay && (
            <div className="p-4 bg-blue-50 rounded-lg text-center text-blue-700">
              Please connect your wallet to pay this invoice
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-gray-50 rounded-b-2xl text-center text-sm text-gray-600">
          Powered by{' '}
          <span className="font-semibold text-bnb-yellow">BNBPay</span> •{' '}
          <span className="font-semibold">x402 Flex</span>
        </div>
      </div>
    </div>
  );
}
