import { useState } from 'react';
import type { NetworkType } from '../lib/web3';
import { formatAddress } from '../lib/web3';

interface SubscriptionReceiptProps {
  subscriptionId: string;
  planName: string;
  interval: string;
  amount: string;
  token: string;
  paidToken?: string;
  paidAmount?: string;
  merchantAddress: string;
  merchantName?: string;
  payerAddress: string;
  txHash: string;
  network: NetworkType;
  paidAt: number;
  onClose?: () => void;
}

export function SubscriptionReceipt({
  subscriptionId,
  planName,
  interval,
  amount,
  token,
  paidToken,
  paidAmount,
  merchantAddress,
  merchantName,
  payerAddress,
  txHash,
  network,
  paidAt,
  onClose,
}: SubscriptionReceiptProps) {
  const [email, setEmail] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [txCopied, setTxCopied] = useState(false);

  const explorerUrl = network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com';
  const formattedDate = new Date(paidAt).toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const displayPaidToken = paidToken || token;
  const displayPaidAmount = paidAmount || amount;
  const txLink = `${explorerUrl}/tx/${txHash}`;

  const copyToClipboard = (text: string, setCopied: (val: boolean) => void) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadReceipt = async () => {
    // Create a canvas to render the receipt as PNG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions (high resolution for quality)
    const width = 800;
    const height = 1150; // Increased height for better layout
    const scale = 2; // 2x for retina displays
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0B0E11');
    bgGradient.addColorStop(1, '#1a1d21');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Header section with purple accent for subscriptions
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, '#8B5CF6');
    headerGradient.addColorStop(1, '#F0B90B');
    ctx.fillStyle = headerGradient;
    ctx.fillRect(0, 0, width, 160);

    // Header text
    ctx.fillStyle = '#0B0E11';
    ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BNBPay', width / 2, 60);
    ctx.font = '20px system-ui, -apple-system, sans-serif';
    ctx.fillText('Subscription Receipt', width / 2, 95);

    // Receipt ID
    ctx.font = '14px monospace';
    ctx.fillText(`ID: ${subscriptionId.slice(0, 8)}...${subscriptionId.slice(-4)}`, width / 2, 130);

    // Success checkmark circle
    const checkY = 220;
    ctx.beginPath();
    ctx.arc(width / 2, checkY, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(width / 2, checkY, 35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
    ctx.fill();

    // Checkmark
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(width / 2 - 15, checkY);
    ctx.lineTo(width / 2 - 3, checkY + 12);
    ctx.lineTo(width / 2 + 18, checkY - 12);
    ctx.stroke();

    // Subscription Activated text
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Subscription Activated', width / 2, 290);

    // Plan name
    ctx.fillStyle = '#8B5CF6';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.fillText(planName, width / 2, 325);

    // Amount section
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.fillText(`${displayPaidAmount} ${displayPaidToken}`, width / 2, 390);

    // Interval
    ctx.fillStyle = '#9ca3af';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.fillText(`per ${interval === 'monthly' ? 'month' : 'year'}`, width / 2, 420);

    // Details card background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    roundRect(ctx, 50, 470, width - 100, 420, 16); // Increased height for all content
    ctx.fill();

    // Details content
    ctx.textAlign = 'left';
    const leftMargin = 80;
    const rightMargin = width - 80;
    let yPos = 510;
    const lineHeight = 45;

    // Helper function for detail rows
    const drawDetailRow = (label: string, value: string) => {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.fillText(label, leftMargin, yPos);
      ctx.fillStyle = '#ffffff';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      // Truncate long values
      const maxWidth = rightMargin - leftMargin - 120;
      let displayValue = value;
      while (ctx.measureText(displayValue).width > maxWidth && displayValue.length > 10) {
        displayValue = displayValue.slice(0, -4) + '...';
      }
      ctx.fillText(displayValue, rightMargin, yPos);
      ctx.textAlign = 'left';
      yPos += lineHeight;
    };

    drawDetailRow('Plan', planName);
    drawDetailRow('Billing Cycle', interval === 'monthly' ? 'Monthly' : 'Yearly');
    drawDetailRow('Date & Time', formattedDate);
    drawDetailRow('Merchant', merchantName || 'BNBPay Merchant');
    drawDetailRow('Merchant Wallet', formatAddress(merchantAddress));
    drawDetailRow('Subscriber Wallet', formatAddress(payerAddress));
    drawDetailRow('Network', network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet');

    // Transaction hash with highlight
    yPos += 10;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.1)';
    roundRect(ctx, 60, yPos - 25, width - 120, 50, 8);
    ctx.fill();

    ctx.fillStyle = '#8B5CF6';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('TRANSACTION HASH', leftMargin, yPos);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    yPos += 22;
    // Truncate tx hash if too long
    const truncatedTxHash = txHash.length > 60 ? txHash.slice(0, 30) + '...' + txHash.slice(-10) : txHash;
    ctx.fillText(truncatedTxHash, leftMargin, yPos);

    // Footer with PePay Labs branding
    yPos = height - 100;

    // Powered by text
    ctx.fillStyle = '#6b7280';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by', width / 2, yPos);

    // PePay Labs branding box
    yPos += 25;
    ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
    roundRect(ctx, width/2 - 100, yPos - 15, 200, 30, 8);
    ctx.fill();
    ctx.fillStyle = '#8B5CF6';
    ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
    ctx.fillText('PePay Labs • BNBPay', width / 2, yPos + 5);

    // x402 Flex badge
    yPos += 35;
    ctx.fillStyle = '#F0B90B';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.fillText('x402 Flex Protocol', width / 2, yPos);

    // Explorer link
    yPos += 20;
    ctx.fillStyle = '#4b5563';
    ctx.font = '10px system-ui, -apple-system, sans-serif';
    ctx.fillText(txLink, width / 2, yPos);

    // Convert to PNG and download
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `BNBPay_Subscription_Receipt_${subscriptionId.slice(0, 8)}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  // Helper function for rounded rectangles
  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const sendEmailReceipt = async () => {
    if (!email || !email.includes('@')) {
      setEmailError('Please enter a valid email address');
      return;
    }

    setEmailSending(true);
    setEmailError(null);

    try {
      const response = await fetch('/api/subscriptions/' + subscriptionId + '/send-receipt', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          receiptData: {
            subscriptionId,
            planName,
            interval,
            amount: displayPaidAmount,
            token: displayPaidToken,
            settlementAmount: amount,
            settlementToken: token,
            merchantAddress,
            merchantName,
            payerAddress,
            txHash,
            network,
            paidAt: formattedDate,
            explorerUrl: txLink,
          },
        }),
      });

      if (response.ok) {
        setEmailSent(true);
        setEmail('');
      } else {
        setEmailError('Email service not available. Please download the receipt instead.');
      }
    } catch (err) {
      setEmailError('Email service not available. Please download the receipt instead.');
    } finally {
      setEmailSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4">
      <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[95vh] sm:max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-bnb-yellow p-4 sm:p-6 rounded-t-2xl">
          <div className="flex justify-center mb-3 sm:mb-4">
            <img src="/bnbpay-logo.png" alt="BNBPay" className="h-8 sm:h-12" />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white">Subscription Activated!</h2>
              <p className="text-white/80 mt-1 text-xs sm:text-sm truncate">Receipt ID: {subscriptionId.slice(0, 8)}...{subscriptionId.slice(-4)}</p>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white hover:text-gray-300 text-2xl font-bold w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 space-y-4 sm:space-y-5 overflow-y-auto flex-1 bg-gray-50">
          {/* Success Badge */}
          <div className="flex items-center justify-center">
            <div className="bg-green-100 rounded-full p-3 sm:p-4">
              <svg className="w-8 h-8 sm:w-12 sm:h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
          </div>

          {/* Plan & Amount Display */}
          <div className="text-center">
            <p className="text-purple-600 font-semibold text-sm sm:text-base mb-2">{planName}</p>
            <p className="text-gray-500 text-xs sm:text-sm mb-1 sm:mb-2">Amount Paid</p>
            <div className="flex items-center justify-center space-x-2 sm:space-x-3">
              <span className="text-3xl sm:text-4xl font-bold text-bnb-dark">{displayPaidAmount}</span>
              <span className="text-xl sm:text-2xl font-semibold text-gray-600">{displayPaidToken}</span>
            </div>
            <p className="text-gray-500 text-sm mt-1">per {interval === 'monthly' ? 'month' : 'year'}</p>
          </div>

          {/* Payment Details */}
          <div className="bg-white rounded-xl p-3 sm:p-4 space-y-2 sm:space-y-3 border border-gray-200">
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Plan Name</span>
              <span className="text-gray-800 text-sm sm:text-right break-words">{planName}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Billing Cycle</span>
              <span className="text-gray-800 text-sm">{interval === 'monthly' ? 'Monthly' : 'Yearly'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Date & Time</span>
              <span className="text-gray-800 text-xs sm:text-sm">{formattedDate}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Merchant</span>
              <span className="text-gray-800 text-sm">{merchantName || 'BNBPay Merchant'}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Merchant Wallet</span>
              <div className="flex items-center space-x-2">
                <span className="text-gray-800 font-mono text-xs sm:text-sm">{formatAddress(merchantAddress)}</span>
                <a
                  href={`${explorerUrl}/address/${merchantAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-600 hover:text-purple-700"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </a>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Subscriber Wallet</span>
              <span className="text-gray-800 font-mono text-xs sm:text-sm">{formatAddress(payerAddress)}</span>
            </div>
            <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 border-t border-gray-100 pt-2 sm:pt-3">
              <span className="text-gray-500 text-xs sm:text-sm font-medium">Network</span>
              <span className="text-gray-800 text-sm">{network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}</span>
            </div>
          </div>

          {/* Transaction Link - Highlighted */}
          <div className="bg-purple-50 border-2 border-purple-500 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span className="text-bnb-dark font-bold text-sm sm:text-base">Transaction Confirmed</span>
            </div>
            <div className="bg-white rounded-lg p-2 sm:p-3 border border-purple-200">
              <p className="text-gray-500 text-xs mb-1">Transaction Hash</p>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <code className="text-bnb-dark font-mono text-xs break-all flex-1">
                  {txHash}
                </code>
                <button
                  onClick={() => copyToClipboard(txHash, setTxCopied)}
                  className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex-shrink-0 w-full sm:w-auto ${
                    txCopied
                      ? 'bg-green-500 text-white'
                      : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {txCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <a
              href={txLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 sm:mt-3 flex items-center justify-center space-x-2 w-full py-2 sm:py-2.5 bg-bnb-dark text-purple-400 font-semibold rounded-lg hover:bg-gray-800 transition-colors text-sm"
            >
              <span>View on BscScan</span>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </div>

          {/* Download Receipt */}
          <button
            onClick={downloadReceipt}
            className="w-full flex items-center justify-center space-x-2 sm:space-x-3 bg-gradient-to-r from-purple-600 to-bnb-yellow hover:opacity-90 text-white font-bold py-3 sm:py-4 px-4 sm:px-6 rounded-xl transition-all hover:scale-[1.02]"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span className="text-sm sm:text-base">Download Receipt</span>
            <img src="/2.png" alt="Coin" className="h-6 w-6 sm:h-8 sm:w-8" />
          </button>

          {/* Email Section */}
          <div className="bg-white rounded-xl p-3 sm:p-4 border border-gray-200">
            <p className="text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3 text-center font-medium">Or send receipt to your email</p>
            {emailSent ? (
              <div className="flex items-center justify-center space-x-2 text-green-600 bg-green-50 rounded-xl p-2 sm:p-3">
                <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="font-semibold text-sm">Receipt sent to your email!</span>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 px-3 sm:px-4 py-2.5 sm:py-3 border border-gray-300 text-gray-800 placeholder-gray-400 rounded-xl focus:outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 text-sm"
                />
                <button
                  onClick={sendEmailReceipt}
                  disabled={emailSending}
                  className="px-4 sm:px-5 py-2.5 sm:py-3 bg-bnb-dark hover:bg-gray-800 text-white font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  {emailSending ? (
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                      <span className="text-sm">Send</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {emailError && (
              <p className="text-red-500 text-xs sm:text-sm mt-2 text-center">{emailError}</p>
            )}
          </div>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-2.5 sm:py-3 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-colors text-sm"
            >
              Close
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 bg-gray-100 rounded-b-2xl flex-shrink-0 border-t border-gray-200">
          <div className="flex items-center justify-center flex-wrap gap-1 sm:gap-2 text-xs sm:text-sm text-gray-500">
            <span>Powered by</span>
            <img src="/pepaylabs.png" alt="PePay" className="h-4 sm:h-5 rounded" />
            <span>•</span>
            <strong className="text-bnb-dark">BNBPay</strong>
            <span>•</span>
            <span>x402 Flex</span>
          </div>
        </div>
      </div>
    </div>
  );
}
