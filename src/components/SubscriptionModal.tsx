import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { SubscriptionData } from '../lib/types';
import { getTokenImagePath } from '../lib/price-utils';

interface SubscriptionModalProps {
  subscription: SubscriptionData;
  onClose: () => void;
}

export function SubscriptionModal({ subscription, onClose }: SubscriptionModalProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (qrCanvasRef.current && subscription.paymentLink) {
      QRCode.toCanvas(
        qrCanvasRef.current,
        subscription.paymentLink,
        { width: 200, margin: 2 },
        (error) => {
          if (error) console.error('QR Code generation error:', error);
        }
      );
    }
  }, [subscription.paymentLink]);

  const handleCopyLink = () => {
    if (subscription.paymentLink) {
      navigator.clipboard.writeText(subscription.paymentLink);
      alert('Subscription link copied to clipboard!');
    }
  };

  const _handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(subscription, null, 2));
    alert('Subscription JSON copied to clipboard!');
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
            <h2 className="text-2xl font-bold text-bnb-yellow">Subscription Created!</h2>
            <button
              onClick={onClose}
              className="text-white hover:text-gray-300 text-2xl font-bold"
            >
              ×
            </button>
          </div>
          <p className="text-bnb-yellow opacity-90 mt-1">
            Subscription ID: {subscription.subscriptionId}
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Subscription Details */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-600 font-semibold">Plan:</span>
              <span className="text-gray-800 font-bold">{subscription.planName}</span>
            </div>

            {/* Payment Token (what user selected) */}
            {subscription.paymentToken && subscription.paymentAmount && (
              <div className="flex justify-between items-center border-t border-gray-200 pt-3">
                <span className="text-gray-600 font-semibold">Recurring Payment:</span>
                <div className="flex items-center gap-2">
                  <img
                    src={getTokenImagePath(subscription.paymentToken)}
                    alt={subscription.paymentToken}
                    className="h-6 w-6 rounded-full"
                  />
                  <span className="text-gray-800 font-bold text-lg">
                    {subscription.paymentAmount} {subscription.paymentToken}
                  </span>
                </div>
              </div>
            )}

            {/* Settlement Token */}
            <div className="flex justify-between items-center border-t border-gray-200 pt-3">
              <span className="text-gray-600 font-semibold">Settles to:</span>
              <div className="flex items-center gap-2">
                <img
                  src={getTokenImagePath(subscription.settlement as any)}
                  alt={subscription.settlement}
                  className="h-6 w-6 rounded-full"
                />
                <span className="text-bnb-yellow font-bold text-xl">{subscription.price} {subscription.settlement}</span>
              </div>
            </div>

            <div className="flex justify-between">
              <span className="text-gray-600 font-semibold">Interval:</span>
              <span className="text-gray-800 capitalize">{subscription.interval}</span>
            </div>

            {subscription.customerEmail && (
              <div className="flex justify-between">
                <span className="text-gray-600 font-semibold">Customer:</span>
                <span className="text-gray-800">{subscription.customerEmail}</span>
              </div>
            )}
          </div>

          {/* QR Code */}
          <div className="text-center">
            <h3 className="font-semibold text-gray-800 mb-3">Scan to Subscribe</h3>
            <div className="inline-block bg-white p-4 rounded-lg border-2 border-gray-200">
              <canvas ref={qrCanvasRef} />
            </div>
          </div>

          {/* Subscription Link */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">Subscription Link</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={subscription.paymentLink || ''}
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

          {/* Payment Options */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-800 mb-3">
              Recurring {subscription.price} {subscription.settlement} - Payment Details:
            </h4>

            {subscription.acceptedTokens && subscription.acceptedTokens.length > 0 ? (
              <div className="space-y-2 mb-3">
                {subscription.acceptedTokens.map((option) => (
                  <div
                    key={option.token}
                    className="flex justify-between items-center py-2 px-3 bg-white rounded-lg border border-purple-100"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={getTokenImagePath(option.token)}
                        alt={option.token}
                        className="h-6 w-6 rounded-full"
                      />
                      <span className="font-semibold text-purple-900">{option.token}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-purple-900">
                        {option.tokenAmount} {option.token}
                      </div>
                      <div className="text-xs text-purple-600">
                        per {subscription.interval === 'monthly' ? 'month' : 'year'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="text-xs text-purple-600 border-t border-purple-200 pt-2 space-y-1">
              <div>• Automatic recurring charges with retry logic</div>
              <div>• Dunning management for failed payments</div>
              <div>• Direct settlement to {subscription.settlement}</div>
              <div>• Webhook notifications for all events</div>
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
