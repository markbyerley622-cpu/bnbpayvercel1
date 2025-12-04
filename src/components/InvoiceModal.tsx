import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { InvoiceData } from '../lib/types';
import { isTestnetToken, getTokenDisplayName, getTokenImagePath, getTokensForNetwork, type Token } from '../lib/price-utils';
import { subscribeToInvoiceSSE, type InvoiceStatus } from '../lib/bnbpay-api';

interface InvoiceModalProps {
  invoice: InvoiceData;
  onClose: () => void;
}

export function InvoiceModal({ invoice, onClose }: InvoiceModalProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const [paymentStatus, setPaymentStatus] = useState<InvoiceStatus>(invoice.txHash ? 'paid' : 'pending');
  const [txHash, setTxHash] = useState<string | undefined>(invoice.txHash);

  // Get all supported tokens for displaying accepted payment methods
  const network = invoice.paymentToken && isTestnetToken(invoice.paymentToken as Token) ? 'testnet' : 'mainnet';
  const acceptedTokens = getTokensForNetwork(network);

  // Generate QR code for payment link URL
  // Uses the full payment link so any QR scanner can open the payment page
  useEffect(() => {
    if (qrCanvasRef.current && invoice.paymentLink) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        invoice.paymentLink,
        { width: 200, margin: 2 },
        (error) => {
          if (error) console.error('QR Code generation error:', error);
        }
      );
    }
  }, [invoice.paymentLink]);

  // Subscribe to real-time payment updates via SSE
  useEffect(() => {
    if (!invoice.invoiceId || paymentStatus === 'paid') return;

    let eventSource: EventSource | null = null;

    try {
      eventSource = subscribeToInvoiceSSE(invoice.invoiceId);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Invoice SSE update:', data);

          if (data.event === 'update' && data.data) {
            if (data.data.status === 'paid') {
              setPaymentStatus('paid');
              if (data.data.txHash) {
                setTxHash(data.data.txHash);
              }
            } else if (data.data.status) {
              setPaymentStatus(data.data.status);
            }
          } else if (data.event === 'snapshot' && data.data) {
            if (data.data.status === 'paid') {
              setPaymentStatus('paid');
              if (data.data.txHash) {
                setTxHash(data.data.txHash);
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse SSE message:', e);
        }
      };

      eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        // Don't close on error, let it reconnect
      };
    } catch (e) {
      console.error('Failed to connect to SSE:', e);
    }

    return () => {
      if (eventSource) {
        eventSource.close();
      }
    };
  }, [invoice.invoiceId, paymentStatus]);

  const handleCopyLink = () => {
    if (invoice.paymentLink) {
      navigator.clipboard.writeText(invoice.paymentLink);
      alert('Payment link copied to clipboard!');
    }
  };

  const _handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(invoice, null, 2));
    alert('Invoice JSON copied to clipboard!');
  };
  void _handleCopyJSON; // Suppress unused warning - available for future use

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[75vh] overflow-hidden shadow-card flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="bg-gray-900 p-6 rounded-t-2xl">
          {/* BNBPay Logo */}
          <div className="flex justify-center mb-4">
            <img src="/bnbpay-logo.png" alt="BNBPay" className="h-12" />
          </div>

          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-bnb-yellow">Invoice Generated!</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-bnb-yellow opacity-90 mt-1">
            Invoice ID: {invoice.invoiceId}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Payee Wallet Restriction - Prominent Display */}
          {invoice.payeeWalletAddress && (
            <div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <span className="text-amber-800 font-bold">Restricted Payment Invoice</span>
              </div>
              <p className="text-amber-700 text-sm mb-2">This invoice can only be paid by the following wallet:</p>
              <div className="bg-amber-100 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <code className="text-amber-900 font-mono text-sm break-all">{invoice.payeeWalletAddress}</code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(invoice.payeeWalletAddress || '');
                      alert('Payee wallet address copied!');
                    }}
                    className="ml-2 px-2 py-1 bg-amber-200 hover:bg-amber-300 text-amber-800 text-xs rounded transition-colors flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Invoice Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 font-semibold">Customer:</span>
              <span className="text-gray-800">{invoice.customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600 font-semibold">Merchant Wallet:</span>
              <span className="text-gray-800 font-mono text-sm">{invoice.merchantAddress || invoice.customer.email}</span>
            </div>
            {invoice.payeeWalletAddress && (
              <div className="flex justify-between items-start border-t border-gray-200 pt-3">
                <span className="text-gray-600 font-semibold">Payee Wallet:</span>
                <span className="text-amber-600 font-mono text-xs text-right max-w-[200px] break-all">
                  {invoice.payeeWalletAddress}
                </span>
              </div>
            )}

            {/* Payment Token (what user entered) */}
            {invoice.paymentToken && invoice.paymentAmount && (
              <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                <span className="text-gray-600 font-semibold">Payment:</span>
                <div className="flex items-center gap-2">
                  <img
                    src={getTokenImagePath(invoice.paymentToken)}
                    alt={getTokenDisplayName(invoice.paymentToken)}
                    className="h-6 w-6 rounded-full"
                  />
                  <span className="text-gray-800 font-bold text-lg">
                    {invoice.paymentAmount} {getTokenDisplayName(invoice.paymentToken)}
                  </span>
                </div>
              </div>
            )}

            {/* Payment Token */}
            <div className="flex justify-between items-center border-t border-gray-200 pt-3">
              <span className="text-gray-600 font-semibold">Payment Token:</span>
              <div className="flex items-center gap-2">
                <img
                  src={getTokenImagePath(invoice.settlement)}
                  alt={getTokenDisplayName(invoice.settlement)}
                  className="h-8 w-8 rounded-full"
                />
                <span className="text-bnb-yellow font-bold text-xl">{invoice.amount} {getTokenDisplayName(invoice.settlement)}</span>
              </div>
            </div>

            {invoice.dueDate && (
              <div className="flex justify-between">
                <span className="text-gray-600 font-semibold">Due Date:</span>
                <span className="text-gray-800">{invoice.dueDate}</span>
              </div>
            )}
          </div>

          {/* Payment Intent Details */}
          {invoice.paymentId && (
            <div className={`border rounded-lg p-4 ${paymentStatus === 'paid' ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
              <h4 className={`font-semibold mb-3 flex items-center gap-2 ${paymentStatus === 'paid' ? 'text-green-800' : 'text-blue-800'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {paymentStatus === 'paid' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  )}
                </svg>
                {paymentStatus === 'paid' ? 'Payment Received' : 'Invoice Ready - Awaiting Payment'}
              </h4>
              <div className="space-y-2 text-sm">
                {txHash && (
                  <div className="flex justify-between items-start">
                    <span className={`font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-blue-700'}`}>Transaction:</span>
                    <a
                      href={`https://${invoice.paymentToken && isTestnetToken(invoice.paymentToken) ? 'testnet.' : ''}bscscan.com/tx/${txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 font-mono text-xs break-all max-w-[200px]"
                    >
                      {txHash.slice(0, 10)}...{txHash.slice(-8)}
                    </a>
                  </div>
                )}
                <div className="flex justify-between items-start">
                  <span className={`font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-blue-700'}`}>Payment ID:</span>
                  <span className={`font-mono text-xs break-all max-w-[200px] ${paymentStatus === 'paid' ? 'text-green-900' : 'text-blue-900'}`}>
                    {invoice.paymentId.slice(0, 10)}...{invoice.paymentId.slice(-8)}
                  </span>
                </div>
                {invoice.merchantAddress && (
                  <div className="flex justify-between items-start">
                    <span className={`font-semibold ${paymentStatus === 'paid' ? 'text-green-700' : 'text-blue-700'}`}>Merchant:</span>
                    <span className={`font-mono text-xs break-all max-w-[200px] ${paymentStatus === 'paid' ? 'text-green-900' : 'text-blue-900'}`}>
                      {invoice.merchantAddress.slice(0, 10)}...{invoice.merchantAddress.slice(-8)}
                    </span>
                  </div>
                )}
              </div>
              <div className={`mt-3 pt-3 border-t text-xs ${paymentStatus === 'paid' ? 'border-green-200 text-green-700' : 'border-blue-200 text-blue-700'}`}>
                {paymentStatus === 'paid' ? (
                  <>
                    ✓ Payment confirmed on BNB Chain via PaymentRegistry
                    <br />
                    ✓ Routed through BNBPayRouter
                    <br />
                    ✓ Payment in {getTokenDisplayName(invoice.settlement)} complete
                  </>
                ) : (
                  <>
                    • Invoice intent created with x402 Flex protocol
                    <br />
                    • Payment will be processed via BNBPayRouter
                    <br />
                    • Payment in {getTokenDisplayName(invoice.settlement)}
                    <br />
                    • Share QR code or payment link with customer
                  </>
                )}
              </div>
            </div>
          )}

          {/* QR Code */}
          <div className="text-center">
            <h3 className="font-semibold text-gray-800 mb-3">Scan to Pay</h3>
            <div className="inline-block bg-white p-4 rounded-lg border-2 border-gray-200">
              <canvas ref={qrCanvasRef} />
            </div>
          </div>

          {/* Payment Link */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={invoice.paymentLink || ''}
                readOnly
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm font-mono"
              />
              <button
                onClick={handleCopyLink}
                className="px-4 py-2 bg-bnb-yellow text-bnb-dark font-semibold rounded-lg hover:-translate-y-0.5 transition-transform"
              >
                Copy
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 View JSON payload and MCP examples in Agent Mode
            </p>
          </div>

          {/* Payment Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h4 className="font-semibold text-blue-800 mb-3">
              Payment Required: {invoice.amount} {getTokenDisplayName(invoice.settlement)}
            </h4>

            <div className="text-sm text-blue-700 space-y-2 mb-3">
              <p className="font-semibold">Accepted Payment Tokens:</p>
              <div className="flex items-center gap-3 flex-wrap">
                {acceptedTokens.map(token => (
                  <div key={token} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-blue-200">
                    <img
                      src={getTokenImagePath(token)}
                      alt={getTokenDisplayName(token)}
                      className="h-5 w-5 rounded-full"
                    />
                    <span className="text-xs font-medium">{getTokenDisplayName(token)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-blue-600 border-t border-blue-200 pt-2">
              • Pay in {getTokenDisplayName(invoice.settlement)} via BNBPayRouter
              <br />
              • Real-time payment verification via PaymentRegistry
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-2xl flex-shrink-0">
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <span>Powered by</span>
            <img src="/pepaylabs.png" alt="PePay" className="h-6 rounded" />
            <span>•</span>
            <strong>BNBPay</strong>
            <span>•</span>
            <span>x402 Flex</span>
          </div>
        </div>
      </div>
    </div>
  );
}
