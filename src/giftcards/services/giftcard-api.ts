/**
 * Gift Card API Service
 * Unified API handler for gift card operations
 * Uses the main BNBPay API for all on-chain operations
 */

import { bnbpayApi, type NetworkKey } from '../../lib/bnbpay-api';
import type { BNBPayCard, Token, GiftCardCreateResponse, GiftCardRedeemResponse } from '../types';
import { cardStorage, generateRedemptionLink } from './card-storage';
import { getTokenInfo } from './tokens';
import { ethers } from 'ethers';

// API base URL (uses the same proxy as main app)
const API_BASE_URL = '/api';

/**
 * Error class for gift card operations
 */
export class GiftCardError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GiftCardError';
  }
}

/**
 * Create a gift card
 * Signs authorization and stores card data
 */
export async function createGiftCard(params: {
  amount: string;
  token: Token;
  recipientAddress: string;
  message?: string;
  expiresInDays: number;
  network: NetworkKey;
  merchantAddress: string;
}): Promise<GiftCardCreateResponse> {
  try {
    // Create card in local storage
    const card = cardStorage.createCard({
      amount: params.amount,
      token: params.token,
      merchantAddress: params.merchantAddress,
      recipientAddress: params.recipientAddress,
      message: params.message,
      expiresInDays: params.expiresInDays,
      network: params.network,
    });

    // Save to local storage
    cardStorage.saveCard(card);

    // Generate redemption URL
    const redeemUrl = generateRedemptionLink(card);

    return {
      success: true,
      card,
      redeemUrl,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create gift card';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Redeem a gift card
 * Validates credentials and initiates payment
 */
export async function redeemGiftCard(params: {
  accessCode: string;
  signature: string;
  redeemerAddress: string;
}): Promise<GiftCardRedeemResponse> {
  try {
    // Validate card credentials
    const validation = cardStorage.validateCardCredentials(params.accessCode, params.signature);

    if (!validation.valid || !validation.card) {
      return {
        success: false,
        error: validation.error || 'Invalid card credentials',
      };
    }

    const card = validation.card;

    // Get token info for decimals
    const networkType = card.network === 'bnb' ? 'mainnet' : 'testnet';
    const tokenInfo = getTokenInfo(card.token, networkType);
    const decimals = tokenInfo?.decimals ?? 18;

    // Build payment intent using BNBPay API
    const intentResponse = await bnbpayApi.buildPaymentIntent({
      mode: 'minimal',
      network: card.network,
      merchant: card.merchantAddress,
      token: card.token,
      amount: card.amount,
      decimals,
      scheme: 'aa_push',
      referenceId: `giftcard:${card.cardId}`,
    });

    // Mark card as redeemed
    cardStorage.markCardRedeemed(
      card.cardId,
      params.redeemerAddress,
      'pending', // txHash will be updated after on-chain confirmation
      intentResponse.derived.paymentId
    );

    return {
      success: true,
      paymentId: intentResponse.derived.paymentId,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to redeem gift card';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Get gift card by ID
 */
export async function getGiftCard(cardId: string): Promise<BNBPayCard | null> {
  return cardStorage.getCardById(cardId);
}

/**
 * Get gift cards by merchant
 */
export async function getGiftCardsByMerchant(merchantAddress: string): Promise<BNBPayCard[]> {
  return cardStorage.getCardsByMerchant(merchantAddress);
}

/**
 * Get all gift cards
 */
export async function getAllGiftCards(): Promise<BNBPayCard[]> {
  return cardStorage.getAllCards();
}

/**
 * Cancel a gift card (only if not redeemed)
 */
export async function cancelGiftCard(cardId: string): Promise<BNBPayCard | null> {
  const card = cardStorage.getCardById(cardId);
  if (!card) return null;

  if (card.status === 'redeemed') {
    throw new GiftCardError('Cannot cancel a redeemed card', 'ALREADY_REDEEMED');
  }

  return cardStorage.updateCardStatus(cardId, 'cancelled');
}

/**
 * Check if a payment has been confirmed on-chain
 */
export async function checkPaymentConfirmation(
  paymentId: string,
  network: NetworkKey
): Promise<{ confirmed: boolean; txHash?: string }> {
  try {
    const status = await bnbpayApi.getPaymentStatus(paymentId, network);
    return {
      confirmed: status.status === 'confirmed',
      txHash: status.payment?.txHash,
    };
  } catch {
    return { confirmed: false };
  }
}

/**
 * Subscribe to payment updates via SSE
 * Returns cleanup function
 */
export function subscribeToPaymentUpdates(
  paymentId: string,
  onUpdate: (status: 'pending' | 'confirmed' | 'failed', txHash?: string) => void
): () => void {
  let eventSource: EventSource | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;

    eventSource = new EventSource(`${API_BASE_URL}/payments/${paymentId}/stream-sse`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data.status, data.txHash);

        // Close connection if confirmed or failed
        if (data.status === 'confirmed' || data.status === 'failed') {
          eventSource?.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      // Reconnect after delay
      if (!closed) {
        setTimeout(connect, 5000);
      }
    };
  };

  connect();

  // Return cleanup function
  return () => {
    closed = true;
    eventSource?.close();
  };
}

/**
 * Format card amount for display
 */
export function formatCardAmount(amount: string, token: Token): string {
  const value = parseFloat(amount);
  if (isNaN(value)) return `0 ${token}`;

  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6
  })} ${token}`;
}

/**
 * Format card status for display
 */
export function formatCardStatus(status: BNBPayCard['status']): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'text-green-500' };
    case 'redeemed':
      return { label: 'Redeemed', color: 'text-blue-500' };
    case 'expired':
      return { label: 'Expired', color: 'text-gray-500' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-red-500' };
    default:
      return { label: 'Unknown', color: 'text-gray-500' };
  }
}

/**
 * Check if card is still valid
 */
export function isCardValid(card: BNBPayCard): boolean {
  if (card.status !== 'active') return false;
  if (card.expiresAt && card.expiresAt < Date.now()) return false;
  return true;
}

/**
 * Generate QR code data for a gift card
 */
export function generateQRCodeData(card: BNBPayCard): string {
  const redeemUrl = generateRedemptionLink(card);
  return redeemUrl;
}

/**
 * Parse amount from user input (handles various formats)
 */
export function parseAmountInput(input: string): string {
  // Remove any non-numeric characters except decimal point
  const cleaned = input.replace(/[^\d.]/g, '');

  // Ensure only one decimal point
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }

  return cleaned || '0';
}

/**
 * Validate amount against minimum and maximum
 */
export function validateAmount(amount: string, min: number = 0.01, max: number = 10000): {
  valid: boolean;
  error?: string;
} {
  const value = parseFloat(amount);

  if (isNaN(value)) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (value < min) {
    return { valid: false, error: `Minimum amount is ${min}` };
  }

  if (value > max) {
    return { valid: false, error: `Maximum amount is ${max}` };
  }

  return { valid: true };
}

/**
 * Validate Ethereum address
 */
export function validateAddress(address: string): {
  valid: boolean;
  error?: string;
} {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  try {
    ethers.getAddress(address);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid wallet address' };
  }
}

// Export service object
export const giftCardApi = {
  createGiftCard,
  redeemGiftCard,
  getGiftCard,
  getGiftCardsByMerchant,
  getAllGiftCards,
  cancelGiftCard,
  checkPaymentConfirmation,
  subscribeToPaymentUpdates,
  formatCardAmount,
  formatCardStatus,
  isCardValid,
  generateQRCodeData,
  parseAmountInput,
  validateAmount,
  validateAddress,
};

export default giftCardApi;
