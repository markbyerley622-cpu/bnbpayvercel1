import { useState } from 'react';
import type { NetworkType } from '../lib/web3';
import { formatAddress } from '../lib/web3';

// Token logo mapping
const TOKEN_LOGOS: Record<string, string> = {
  BNB: '/bnblogo.png',
  USDT: '/usdt.png',
  USDC: '/usdc.png',
  BUSD: '/busd.png',
  USD1: '/USD1.png',
  WUSD: '/wusd.png',
  XUSD: '/xusd-removebg-preview.png',
  FDUSD: '/fdusd.png',
};

function getTokenLogo(token: string): string {
  return TOKEN_LOGOS[token.toUpperCase()] || '/2.png';
}

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
    // Helper to load images
    const loadImage = (src: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${src}`));
        img.src = src;
      });
    };

    // Create a canvas to render the receipt as PNG
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas dimensions (high resolution for quality)
    const width = 800;
    const height = 1150;
    const scale = 2; // 2x for retina displays
    canvas.width = width * scale;
    canvas.height = height * scale;
    ctx.scale(scale, scale);

    // Background - white for professional look
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);

    // Header section with dark purple to BNB yellow gradient (matching invoice style)
    const headerGradient = ctx.createLinearGradient(0, 0, width, 0);
    headerGradient.addColorStop(0, '#6D28D9'); // Purple-700 (no pink)
    headerGradient.addColorStop(1, '#F0B90B'); // BNB Yellow
    ctx.fillStyle = headerGradient;
    roundRect(ctx, 0, 0, width, 140, 0);
    ctx.fill();

    // Try to draw BNBPay logo in header
    try {
      const bnbLogo = await loadImage('/10.png');
      const logoHeight = 50;
      const logoWidth = (bnbLogo.width / bnbLogo.height) * logoHeight;
      ctx.drawImage(bnbLogo, 50, 25, logoWidth, logoHeight);
    } catch {
      // Fallback to text
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('BNBPay', 50, 60);
    }

    // Subscription Receipt title (right side of header)
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '500 20px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('Subscription Receipt', width - 50, 55);
    ctx.fillStyle = '#0B0E11';
    ctx.font = '14px system-ui, -apple-system, sans-serif';
    ctx.fillText('Recurring Payment', width - 50, 80);

    // Receipt ID
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '12px monospace';
    ctx.fillText(`ID: ${subscriptionId.slice(0, 8)}...${subscriptionId.slice(-4)}`, width - 50, 110);
    ctx.textAlign = 'left';

    let currentY = 180;

    // Success checkmark circle
    const checkX = width / 2;
    ctx.beginPath();
    ctx.arc(checkX, currentY, 40, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.15)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(checkX, currentY, 32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
    ctx.fill();

    // Checkmark
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(checkX - 15, currentY);
    ctx.lineTo(checkX - 3, currentY + 12);
    ctx.lineTo(checkX + 18, currentY - 12);
    ctx.stroke();

    currentY += 60;

    // Subscription Activated text
    ctx.fillStyle = '#22c55e';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Subscription Activated', width / 2, currentY);

    currentY += 30;

    // Plan name - Purple-700 (no pink)
    ctx.fillStyle = '#6D28D9';
    ctx.font = '18px system-ui, -apple-system, sans-serif';
    ctx.fillText(planName, width / 2, currentY);

    currentY += 50;

    // Token logo + Amount section
    const tokenLogoSize = 50;
    let tokenLogoDrawn = false;
    try {
      const tokenLogo = await loadImage(getTokenLogo(displayPaidToken));
      const logoX = width / 2 - 140;
      ctx.drawImage(tokenLogo, logoX, currentY - 35, tokenLogoSize, tokenLogoSize);
      tokenLogoDrawn = true;
    } catch {
      console.log('Token logo not loaded');
    }

    // Amount text
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    const amountText = `${displayPaidAmount} ${displayPaidToken}`;
    const amountX = tokenLogoDrawn ? width / 2 - 80 : width / 2;
    ctx.textAlign = tokenLogoDrawn ? 'left' : 'center';
    ctx.fillText(amountText, amountX, currentY);

    currentY += 30;

    // Interval
    ctx.fillStyle = '#718096';
    ctx.font = '16px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`per ${interval === 'monthly' ? 'month' : 'year'}`, width / 2, currentY);

    currentY += 40;

    // Divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, currentY);
    ctx.lineTo(width - 50, currentY);
    ctx.stroke();

    currentY += 30;

    // Details card background
    const cardHeight = 320;
    ctx.fillStyle = '#F7FAFC';
    roundRect(ctx, 50, currentY, width - 100, cardHeight, 12);
    ctx.fill();
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    roundRect(ctx, 50, currentY, width - 100, cardHeight, 12);
    ctx.stroke();

    // Details content
    ctx.textAlign = 'left';
    const leftMargin = 75;
    const rightMargin = width - 75;
    let yPos = currentY + 35;
    const lineHeight = 40;

    // Helper function for detail rows
    const drawDetailRow = (label: string, value: string) => {
      ctx.fillStyle = '#718096';
      ctx.font = '600 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, leftMargin, yPos);
      ctx.fillStyle = '#1a1a1a';
      ctx.font = '14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'right';
      // Truncate long values
      const maxWidth = rightMargin - leftMargin - 150;
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

    currentY += cardHeight + 25;

    // Transaction hash section
    ctx.fillStyle = '#718096';
    ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('TRANSACTION HASH', leftMargin - 25, currentY);
    currentY += 20;

    // Yellow box for tx hash (matching BNB branding)
    ctx.fillStyle = '#FEF9E7'; // Light yellow background
    roundRect(ctx, 50, currentY, width - 100, 50, 8);
    ctx.fill();
    ctx.strokeStyle = '#F0B90B'; // BNB Yellow border
    ctx.lineWidth = 2;
    roundRect(ctx, 50, currentY, width - 100, 50, 8);
    ctx.stroke();

    ctx.fillStyle = '#1a1a1a';
    ctx.font = '12px monospace';
    const truncatedHash = txHash.length > 50 ? `${txHash.slice(0, 30)}...${txHash.slice(-15)}` : txHash;
    ctx.fillText(truncatedHash, 65, currentY + 32);

    // Footer section
    const footerY = height - 100;

    // Footer divider
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, footerY);
    ctx.lineTo(width - 50, footerY);
    ctx.stroke();

    // Footer background
    ctx.fillStyle = '#F7FAFC';
    ctx.fillRect(0, footerY + 1, width, height - footerY);

    // Centered "Powered by" text
    ctx.fillStyle = '#718096';
    ctx.font = '12px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Powered by', width / 2, footerY + 25);

    // Try to draw Pepay Labs logo (centered)
    try {
      const pepayLogo = await loadImage('/pepaylabs.png');
      const pepayHeight = 30;
      const pepayWidth = (pepayLogo.width / pepayLogo.height) * pepayHeight;
      ctx.drawImage(pepayLogo, (width - pepayWidth) / 2, footerY + 32, pepayWidth, pepayHeight);
    } catch {
      // Fallback text
      ctx.fillStyle = '#8B5CF6';
      ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Pepay Labs', width / 2, footerY + 50);
    }

    // Generated date (smaller, at bottom)
    ctx.fillStyle = '#9CA3AF';
    ctx.font = '11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    const genDate = new Date().toISOString().split('T')[0];
    ctx.fillText(`Receipt generated on ${genDate}`, width / 2, footerY + 85);

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[98vh] sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col my-auto">
        {/* Header - Purple to Yellow gradient */}
        <div className="bg-gradient-to-r from-purple-700 to-bnb-yellow p-3 sm:p-5 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <img src="/10.png" alt="BNBPay" className="h-8 sm:h-10 flex-shrink-0" />
              <div className="min-w-0">
                <h2 className="text-lg sm:text-xl font-bold text-white truncate">Subscription Activated!</h2>
                <p className="text-white/70 text-xs truncate">ID: {subscriptionId.slice(0, 8)}...{subscriptionId.slice(-4)}</p>
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="text-white/80 hover:text-white text-xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors flex-shrink-0 ml-2"
              >
                ×
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-3 sm:p-5 space-y-3 sm:space-y-4 overflow-y-auto flex-1 bg-gray-50">
          {/* Success Badge + Amount (Combined for space) */}
          <div className="flex items-center justify-center space-x-3 py-2">
            <div className="bg-green-100 rounded-full p-2 sm:p-3 flex-shrink-0">
              <svg className="w-6 h-6 sm:w-8 sm:h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>
            <div className="text-left">
              <p className="text-purple-700 font-semibold text-sm">{planName}</p>
              <div className="flex items-center space-x-2">
                <img
                  src={getTokenLogo(displayPaidToken)}
                  alt={displayPaidToken}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full"
                  onError={(e) => { (e.target as HTMLImageElement).src = '/2.png'; }}
                />
                <span className="text-2xl sm:text-3xl font-bold text-bnb-dark">{displayPaidAmount}</span>
                <span className="text-lg sm:text-xl font-semibold text-gray-600">{displayPaidToken}</span>
              </div>
              <p className="text-gray-500 text-xs">per {interval === 'monthly' ? 'month' : 'year'}</p>
            </div>
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
                  className="text-bnb-yellow hover:text-yellow-400"
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
          <div className="bg-bnb-yellow/10 border-2 border-bnb-yellow/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <span className="text-bnb-dark font-bold text-sm">Transaction Confirmed</span>
            </div>
            <div className="bg-white rounded-lg p-2 border border-gray-200">
              <p className="text-gray-500 text-xs mb-1">Transaction Hash</p>
              <div className="flex items-center gap-2">
                <code className="text-bnb-dark font-mono text-xs break-all flex-1 truncate">
                  {txHash.slice(0, 20)}...{txHash.slice(-10)}
                </code>
                <button
                  onClick={() => copyToClipboard(txHash, setTxCopied)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold transition-all flex-shrink-0 ${
                    txCopied
                      ? 'bg-green-500 text-white'
                      : 'bg-bnb-dark text-bnb-yellow hover:bg-gray-800'
                  }`}
                >
                  {txCopied ? '✓' : 'Copy'}
                </button>
              </div>
            </div>
            <a
              href={txLink}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center space-x-2 w-full py-2 bg-bnb-dark text-bnb-yellow font-semibold rounded-lg hover:bg-gray-800 transition-colors text-xs"
            >
              <span>View on BscScan</span>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
              </svg>
            </a>
          </div>

          {/* Download Receipt - Purple to Yellow gradient */}
          <button
            onClick={downloadReceipt}
            className="w-full flex items-center justify-center space-x-2 bg-gradient-to-r from-purple-700 to-bnb-yellow hover:opacity-90 text-white font-bold py-3 px-4 rounded-xl transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
            </svg>
            <span className="text-sm">Download Receipt</span>
          </button>

          {/* Email Section - Compact */}
          <div className="bg-white rounded-xl p-3 border border-gray-200">
            <p className="text-gray-600 text-xs mb-2 text-center font-medium">Or send receipt to your email</p>
            {emailSent ? (
              <div className="flex items-center justify-center space-x-2 text-green-600 bg-green-50 rounded-lg p-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                </svg>
                <span className="font-semibold text-sm">Sent!</span>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 px-3 py-2 border border-gray-300 text-gray-800 placeholder-gray-400 rounded-lg focus:outline-none focus:border-bnb-yellow text-sm min-w-0"
                />
                <button
                  onClick={sendEmailReceipt}
                  disabled={emailSending}
                  className="px-3 py-2 bg-bnb-dark hover:bg-gray-800 text-bnb-yellow font-semibold rounded-lg transition-all disabled:opacity-50 flex items-center space-x-1 flex-shrink-0"
                >
                  {emailSending ? (
                    <div className="w-4 h-4 border-2 border-bnb-yellow border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
                      </svg>
                      <span className="text-sm hidden sm:inline">Send</span>
                    </>
                  )}
                </button>
              </div>
            )}
            {emailError && (
              <p className="text-red-500 text-xs mt-2 text-center">{emailError}</p>
            )}
          </div>

          {/* Close Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-gray-200 text-gray-700 font-semibold rounded-xl hover:bg-gray-300 transition-colors text-sm"
            >
              Close
            </button>
          )}
        </div>

        {/* Footer - Compact */}
        <div className="px-3 py-2 bg-gray-100 flex-shrink-0 border-t border-gray-200">
          <div className="flex items-center justify-center flex-wrap gap-1 text-xs text-gray-500">
            <span>Powered by</span>
            <img src="/pepaylabs.png" alt="PePay" className="h-4 rounded" />
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
