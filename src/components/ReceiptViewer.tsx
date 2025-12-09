/**
 * Receipt Viewer Modal
 *
 * Displays a single receipt in detail with download option.
 * Used when user clicks "View Receipt" from history or after payment.
 */

import { useState, useEffect } from 'react';
import type { PaymentReceipt } from '../lib/receipt-storage';
import { generateReceiptPng, downloadReceiptPng } from '../lib/receipt-generator';
import { formatAddress } from '../lib/web3';

interface ReceiptViewerProps {
  isOpen: boolean;
  onClose: () => void;
  receipt: PaymentReceipt | null;
}

export function ReceiptViewer({ isOpen, onClose, receipt }: ReceiptViewerProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate receipt image when modal opens
  useEffect(() => {
    if (isOpen && receipt) {
      generateImage();
    }
    return () => {
      if (imageUrl) {
        URL.revokeObjectURL(imageUrl);
      }
    };
  }, [isOpen, receipt]);

  const generateImage = async () => {
    if (!receipt) return;

    setLoading(true);
    setError(null);

    try {
      const dataUrl = await generateReceiptPng({ receipt });
      setImageUrl(dataUrl);
    } catch (err) {
      setError('Failed to generate receipt image');
      console.error('Receipt generation error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!receipt) return;

    setDownloading(true);
    setError(null);

    try {
      await downloadReceiptPng(receipt);
    } catch (err) {
      setError('Failed to download receipt');
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  if (!isOpen || !receipt) return null;

  const statusColors = {
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
    paid: 'bg-green-500/10 text-green-500 border-green-500/30',
    failed: 'bg-red-500/10 text-red-500 border-red-500/30',
    cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/30',
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-bnb-yellow/20 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Payment Receipt</h2>
              <p className="text-xs text-gray-400">{receipt.id}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Error Display */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {/* Receipt Details Summary */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <span
                className={`text-sm px-3 py-1 rounded-full border font-semibold uppercase ${statusColors[receipt.status]}`}
              >
                {receipt.status}
              </span>
              <span className="text-sm text-gray-500 capitalize">
                {receipt.type}
              </span>
            </div>

            <div className="text-center py-4">
              <p className="text-4xl font-bold text-gray-900">
                {receipt.amount}{' '}
                <span className="text-xl text-gray-500">{receipt.token}</span>
              </p>
              <p className="text-sm text-gray-500 mt-2">{formatDate(receipt.timestamp)}</p>
            </div>

            {/* Quick Details */}
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <p className="text-gray-500">Merchant</p>
                <p className="font-medium text-gray-900 truncate">
                  {receipt.merchantName || formatAddress(receipt.merchantAddress)}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Network</p>
                <p className="font-medium text-gray-900">
                  {receipt.network === 'mainnet' ? 'BNB Mainnet' : 'BNB Testnet'}
                </p>
              </div>
              {receipt.txHash && (
                <div className="col-span-2">
                  <p className="text-gray-500">Transaction</p>
                  <a
                    href={`https://${receipt.network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${receipt.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-bnb-yellow hover:underline break-all"
                  >
                    {receipt.txHash}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Image Preview */}
          <div className="p-6 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Receipt Preview</h3>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="w-10 h-10 border-3 border-bnb-yellow/30 border-t-bnb-yellow rounded-full animate-spin mb-4" />
                <p className="text-sm text-gray-500">Generating receipt...</p>
              </div>
            ) : imageUrl ? (
              <div className="flex justify-center">
                <img
                  src={imageUrl}
                  alt="Receipt Preview"
                  className="max-w-full h-auto rounded-lg shadow-lg border border-gray-200"
                  style={{ maxHeight: '400px' }}
                />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <svg className="w-12 h-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="text-sm text-gray-500">Failed to load preview</p>
                <button
                  onClick={generateImage}
                  className="mt-2 text-sm text-bnb-yellow hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-white border-t border-gray-100 flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading || loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-bnb-yellow text-gray-900 rounded-xl font-bold hover:bg-yellow-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {downloading ? (
              <>
                <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Downloading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download PNG
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReceiptViewer;
