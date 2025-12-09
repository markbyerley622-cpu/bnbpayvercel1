/**
 * Receipt PNG Generator
 *
 * Generates professional, branded receipt images using Canvas API.
 * Design inspired by Stripe, Coinbase, and PayPal receipts.
 *
 * Features:
 * - BNBPay logo header
 * - Token logo next to amount
 * - Clean typography and spacing
 * - PAID stamp for completed payments
 * - QR code with transaction link
 * - "Powered by Pepay Labs" footer
 */

import QRCode from 'qrcode';
import type { PaymentReceipt } from './receipt-storage';

// ============================================================================
// Token Logo Mapping
// ============================================================================

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

/**
 * Get token logo path with fallback
 */
function getTokenLogoPath(token: string): string {
  const upperToken = token.toUpperCase();
  return TOKEN_LOGOS[upperToken] || '/2.png';
}

// ============================================================================
// Configuration
// ============================================================================

const RECEIPT_CONFIG = {
  width: 800,
  height: 1300,
  padding: 50,
  borderRadius: 20,
  colors: {
    background: '#FFFFFF',
    headerBg: '#0B0E11',
    headerText: '#FFFFFF',
    bnbYellow: '#F0B90B',
    textPrimary: '#1A1A1A',
    textSecondary: '#4A5568',
    textMuted: '#718096',
    borderLight: '#E2E8F0',
    success: '#22C55E',
    pending: '#EAB308',
    failed: '#EF4444',
    cardBg: '#F7FAFC',
  },
  fonts: {
    title: 'bold 32px Inter, system-ui, sans-serif',
    subtitle: '500 20px Inter, system-ui, sans-serif',
    body: '400 16px Inter, system-ui, sans-serif',
    bodyBold: '600 16px Inter, system-ui, sans-serif',
    small: '400 14px Inter, system-ui, sans-serif',
    smallBold: '600 14px Inter, system-ui, sans-serif',
    stamp: 'bold 48px Inter, system-ui, sans-serif',
    amount: 'bold 56px Inter, system-ui, sans-serif',
    mono: '400 13px "SF Mono", Monaco, monospace',
  },
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load an image from URL and return as HTMLImageElement
 */
async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/**
 * Draw a rounded rectangle
 */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Format date for display
 */
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Format address for display (0x1234...5678)
 */
function formatAddress(address: string): string {
  if (!address) return 'N/A';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ============================================================================
// Main Generator Function
// ============================================================================

export interface GenerateReceiptOptions {
  receipt: PaymentReceipt;
  merchantLogo?: string;
  showQRCode?: boolean;
}

/**
 * Generate a professional receipt PNG image.
 * Returns a data URL of the generated image.
 */
export async function generateReceiptPng(
  options: GenerateReceiptOptions
): Promise<string> {
  const { receipt, showQRCode = true } = options;
  const { width, height, padding, colors, fonts } = RECEIPT_CONFIG;

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // =========================================================================
  // BACKGROUND
  // =========================================================================
  ctx.fillStyle = colors.background;
  ctx.fillRect(0, 0, width, height);

  // Subtle border
  ctx.strokeStyle = colors.borderLight;
  ctx.lineWidth = 2;
  roundRect(ctx, 1, 1, width - 2, height - 2, RECEIPT_CONFIG.borderRadius);
  ctx.stroke();

  // =========================================================================
  // HEADER - Dark BNBPay Header
  // =========================================================================
  const headerHeight = 100;
  ctx.fillStyle = colors.headerBg;
  roundRect(ctx, 0, 0, width, headerHeight, RECEIPT_CONFIG.borderRadius);
  ctx.fill();
  ctx.fillRect(0, headerHeight - RECEIPT_CONFIG.borderRadius, width, RECEIPT_CONFIG.borderRadius);

  // BNBPay Logo
  try {
    const logo = await loadImage('/10.png');
    const logoHeight = 50;
    const logoWidth = (logo.width / logo.height) * logoHeight;
    ctx.drawImage(logo, padding, 25, logoWidth, logoHeight);
  } catch (e) {
    // Fallback to text
    ctx.fillStyle = colors.bnbYellow;
    ctx.font = fonts.title;
    ctx.fillText('BNBPay', padding, 60);
  }

  // "Payment Receipt" title
  ctx.fillStyle = colors.headerText;
  ctx.font = fonts.subtitle;
  ctx.textAlign = 'right';
  ctx.fillText('Payment Receipt', width - padding, 55);
  ctx.fillStyle = colors.bnbYellow;
  ctx.font = fonts.small;
  ctx.fillText(receipt.type === 'invoice' ? 'Invoice Payment' : 'Subscription Payment', width - padding, 75);
  ctx.textAlign = 'left';

  let currentY = headerHeight + 40;

  // =========================================================================
  // PAID STAMP (if status is paid)
  // =========================================================================
  if (receipt.status === 'paid') {
    ctx.save();
    ctx.translate(width - 160, currentY + 30);
    ctx.rotate(-15 * Math.PI / 180);

    // Stamp border
    ctx.strokeStyle = colors.success;
    ctx.lineWidth = 4;
    roundRect(ctx, -80, -30, 160, 60, 8);
    ctx.stroke();

    // Stamp text
    ctx.fillStyle = colors.success;
    ctx.font = fonts.stamp;
    ctx.textAlign = 'center';
    ctx.fillText('PAID', 0, 18);

    ctx.restore();
    ctx.textAlign = 'left';
  }

  // =========================================================================
  // AMOUNT SECTION - Big and Bold with Token Logo
  // =========================================================================
  ctx.fillStyle = colors.textMuted;
  ctx.font = fonts.small;
  ctx.fillText('AMOUNT', padding, currentY);
  currentY += 15;

  // Token logo
  const tokenLogoSize = 60;
  let tokenLogoDrawn = false;
  try {
    const tokenLogo = await loadImage(getTokenLogoPath(receipt.token));
    ctx.drawImage(tokenLogo, padding, currentY, tokenLogoSize, tokenLogoSize);
    tokenLogoDrawn = true;
  } catch (e) {
    console.log('Token logo not loaded');
  }

  // Amount text
  const amountX = tokenLogoDrawn ? padding + tokenLogoSize + 15 : padding;
  ctx.fillStyle = colors.textPrimary;
  ctx.font = fonts.amount;
  ctx.fillText(receipt.amount, amountX, currentY + 50);

  // Token symbol
  const amountTextWidth = ctx.measureText(receipt.amount).width;
  ctx.fillStyle = colors.textSecondary;
  ctx.font = 'bold 28px Inter, system-ui, sans-serif';
  ctx.fillText(receipt.token, amountX + amountTextWidth + 12, currentY + 50);

  currentY += 90;

  // =========================================================================
  // DIVIDER
  // =========================================================================
  ctx.strokeStyle = colors.borderLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, currentY);
  ctx.lineTo(width - padding, currentY);
  ctx.stroke();
  currentY += 30;

  // =========================================================================
  // DETAILS CARD
  // =========================================================================
  const cardStartY = currentY;
  const cardPadding = 25;
  const lineHeight = 45;

  // Card background
  ctx.fillStyle = colors.cardBg;
  const cardHeight = 7 * lineHeight + cardPadding * 2;
  roundRect(ctx, padding, cardStartY, width - padding * 2, cardHeight, 12);
  ctx.fill();

  // Card border
  ctx.strokeStyle = colors.borderLight;
  ctx.lineWidth = 1;
  roundRect(ctx, padding, cardStartY, width - padding * 2, cardHeight, 12);
  ctx.stroke();

  currentY = cardStartY + cardPadding;
  const labelX = padding + cardPadding;
  const valueX = width - padding - cardPadding;

  // Helper to draw detail row
  const drawDetailRow = (label: string, value: string, isMono = false) => {
    ctx.fillStyle = colors.textMuted;
    ctx.font = fonts.bodyBold;
    ctx.textAlign = 'left';
    ctx.fillText(label, labelX, currentY);

    ctx.fillStyle = colors.textPrimary;
    ctx.font = isMono ? fonts.mono : fonts.body;
    ctx.textAlign = 'right';

    // Truncate long values
    const maxWidth = valueX - labelX - 150;
    let displayValue = value;
    while (ctx.measureText(displayValue).width > maxWidth && displayValue.length > 10) {
      displayValue = displayValue.slice(0, -4) + '...';
    }
    ctx.fillText(displayValue, valueX, currentY);
    ctx.textAlign = 'left';
    currentY += lineHeight;
  };

  // Draw detail rows
  drawDetailRow('Description', receipt.description || 'Payment');
  drawDetailRow('Date & Time', formatDate(receipt.timestamp));
  drawDetailRow('Merchant', receipt.merchantName || 'BNBPay Merchant');
  drawDetailRow('Merchant Wallet', formatAddress(receipt.merchantAddress), true);
  drawDetailRow('Payer Wallet', formatAddress(receipt.payerWallet), true);
  drawDetailRow('Network', receipt.network === 'mainnet' ? 'BNB Mainnet' : 'BNB Testnet');
  drawDetailRow('Reference', receipt.reference || receipt.invoiceId || 'N/A', true);

  currentY = cardStartY + cardHeight + 30;

  // =========================================================================
  // TRANSACTION HASH SECTION
  // =========================================================================
  if (receipt.txHash) {
    ctx.fillStyle = colors.textMuted;
    ctx.font = fonts.smallBold;
    ctx.fillText('TRANSACTION HASH', padding, currentY);
    currentY += 20;

    // Hash box
    const hashBoxHeight = 50;
    ctx.fillStyle = '#FEF3C7'; // Light yellow bg
    roundRect(ctx, padding, currentY, width - padding * 2, hashBoxHeight, 8);
    ctx.fill();

    ctx.strokeStyle = colors.bnbYellow;
    ctx.lineWidth = 2;
    roundRect(ctx, padding, currentY, width - padding * 2, hashBoxHeight, 8);
    ctx.stroke();

    // Hash text
    ctx.fillStyle = colors.textPrimary;
    ctx.font = fonts.mono;
    const truncatedHash = `${receipt.txHash.slice(0, 30)}...${receipt.txHash.slice(-10)}`;
    ctx.fillText(truncatedHash, padding + 15, currentY + 32);

    currentY += hashBoxHeight + 30;
  }

  // =========================================================================
  // QR CODE
  // =========================================================================
  if (showQRCode && receipt.txHash) {
    const qrSize = 120;
    const qrX = width - padding - qrSize;
    const explorerUrl = `https://${receipt.network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${receipt.txHash}`;

    try {
      const qrDataUrl = await QRCode.toDataURL(explorerUrl, {
        width: qrSize,
        margin: 1,
        color: {
          dark: '#0B0E11',
          light: '#FFFFFF',
        },
      });
      const qrImg = await loadImage(qrDataUrl);

      // QR label
      ctx.fillStyle = colors.textMuted;
      ctx.font = fonts.small;
      ctx.textAlign = 'right';
      ctx.fillText('Scan to verify', qrX + qrSize, currentY - 5);
      ctx.textAlign = 'left';

      // QR code with border
      ctx.strokeStyle = colors.borderLight;
      ctx.lineWidth = 1;
      roundRect(ctx, qrX - 5, currentY, qrSize + 10, qrSize + 10, 8);
      ctx.stroke();
      ctx.drawImage(qrImg, qrX, currentY + 5, qrSize, qrSize);

      currentY += qrSize + 30;
    } catch (e) {
      console.error('Failed to generate QR code');
    }
  }

  // =========================================================================
  // FOOTER - Powered by Pepay Labs
  // =========================================================================
  const footerY = height - 100;

  // Footer divider
  ctx.strokeStyle = colors.borderLight;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padding, footerY);
  ctx.lineTo(width - padding, footerY);
  ctx.stroke();

  // Footer background
  ctx.fillStyle = '#F7FAFC';
  ctx.fillRect(0, footerY + 1, width, height - footerY - 1);

  // "Powered by" text
  ctx.fillStyle = colors.textMuted;
  ctx.font = fonts.small;
  ctx.fillText('Powered by', padding, footerY + 40);

  // Pepay Labs logo
  try {
    const pepayLogo = await loadImage('/pepaylabs.png');
    const pepayLogoHeight = 35;
    const pepayLogoWidth = (pepayLogo.width / pepayLogo.height) * pepayLogoHeight;
    ctx.drawImage(pepayLogo, padding + 85, footerY + 20, pepayLogoWidth, pepayLogoHeight);
  } catch (e) {
    // Fallback text
    ctx.fillStyle = colors.bnbYellow;
    ctx.font = fonts.bodyBold;
    ctx.fillText('Pepay Labs', padding + 85, footerY + 40);
  }

  // BNBPay small logo in footer
  try {
    const bnbSmall = await loadImage('/10.png');
    ctx.drawImage(bnbSmall, width - padding - 50, footerY + 15, 50, 50);
  } catch (e) {
    // Ignore
  }

  // Timestamp
  ctx.fillStyle = colors.textMuted;
  ctx.font = fonts.small;
  ctx.textAlign = 'center';
  const genDate = new Date().toISOString().split('T')[0];
  ctx.fillText(`Receipt generated on ${genDate}`, width / 2, footerY + 75);
  ctx.textAlign = 'left';

  return canvas.toDataURL('image/png', 1.0);
}

// ============================================================================
// Download Function
// ============================================================================

/**
 * Download a receipt as PNG file.
 * Generates the PNG and triggers browser download.
 */
export async function downloadReceiptPng(receipt: PaymentReceipt): Promise<void> {
  try {
    console.log('[ReceiptGenerator] Generating PNG for receipt:', receipt.id);

    // Generate PNG
    const dataUrl = await generateReceiptPng({ receipt });

    // Create download link
    const link = document.createElement('a');
    link.download = `${receipt.invoiceId || receipt.subscriptionId || receipt.id}-receipt.png`;
    link.href = dataUrl;

    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log('[ReceiptGenerator] Download triggered');
  } catch (error) {
    console.error('[ReceiptGenerator] Failed to download receipt:', error);
    throw error;
  }
}

export default {
  generateReceiptPng,
  downloadReceiptPng,
};
