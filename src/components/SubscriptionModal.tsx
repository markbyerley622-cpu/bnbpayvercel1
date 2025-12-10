import { useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import type { SubscriptionData } from '../lib/types';
import { getTokenImagePath, getTokenDisplayName, type Token } from '../lib/price-utils';
import { useToast } from '../contexts/ToastContext';

interface SubscriptionModalProps {
  subscription: SubscriptionData;
  onClose: () => void;
}

export function SubscriptionModal({ subscription, onClose }: SubscriptionModalProps) {
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  const toast = useToast();

  // Get accepted tokens from subscription (selected by creator)
  const allowedTokens = subscription.allowedTokens && subscription.allowedTokens.length > 0
    ? subscription.allowedTokens
    : [subscription.settlement]; // Fall back to settlement token

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
      toast.success('Subscription link copied to clipboard!');
    }
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(subscription, null, 2));
    toast.success('Subscription JSON copied to clipboard!');
  };
  void handleCopyJSON; // Suppress unused warning - available for future use

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

          {/* Payment Options - Show only allowed tokens */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <h4 className="font-semibold text-purple-800 mb-3">
              Recurring {subscription.price} {getTokenDisplayName(subscription.settlement as Token)}
            </h4>

            <div className="text-sm text-purple-700 space-y-2 mb-3">
              <p className="font-semibold">Accepted Payment Tokens:</p>
              <div className="flex items-center gap-3 flex-wrap">
                {allowedTokens.map(token => (
                  <div key={token} className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-purple-200">
                    <img
                      src={getTokenImagePath(token as Token)}
                      alt={getTokenDisplayName(token as Token)}
                      className="h-5 w-5 rounded-full"
                    />
                    <span className="text-xs font-medium">{getTokenDisplayName(token as Token)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-purple-700 border-t border-purple-200 pt-2 space-y-1">
              <div>• Pay with {allowedTokens.length === 1 ? getTokenDisplayName(allowedTokens[0] as Token) : 'any accepted token'} via BNBPayRouter</div>
              <div>• Settlement in {getTokenDisplayName(subscription.settlement as Token)}</div>
              <div>• Automatic recurring charges with retry logic</div>
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
