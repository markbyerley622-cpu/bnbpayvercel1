/**
 * Card Storage - Local JSON storage for BNB Pay Gift Cards
 * In production, this would be replaced with a proper database
 */

import type { BNBPayCard, Token, NetworkKey } from '../types';
import { ethers } from 'ethers';

// Storage keys
const CARDS_STORAGE_KEY = 'bnbpay_giftcards';
const CARDS_BY_MERCHANT_PREFIX = 'bnbpay_giftcards_merchant_';

/**
 * Generate a unique card ID
 */
export function generateCardId(): string {
  return `card_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate access code (16 characters, alphanumeric)
 */
export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed confusing chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 16; i++) {
    if (i > 0 && i % 4 === 0) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Generate card signature (keccak256 hash)
 */
export function generateCardSignature(cardId: string, accessCode: string, merchantAddress: string): string {
  const message = `${cardId}:${accessCode}:${merchantAddress}:${Date.now()}`;
  return ethers.keccak256(ethers.toUtf8Bytes(message));
}

/**
 * Generate resource ID for the card
 */
export function generateResourceId(
  merchantAddress: string,
  referenceId: string,
  amount: string,
  salt: string
): string {
  const data = ethers.solidityPacked(
    ['address', 'string', 'uint256', 'bytes32'],
    [merchantAddress, referenceId, BigInt(amount), salt]
  );
  return ethers.keccak256(data);
}

/**
 * Create a new card
 */
export function createCard(params: {
  amount: string;
  token: Token;
  merchantAddress: string;
  merchantName?: string;
  recipientAddress?: string;
  message?: string;
  expiresInDays?: number;
  network: NetworkKey;
}): BNBPayCard {
  const cardId = generateCardId();
  const accessCode = generateAccessCode();
  const signature = generateCardSignature(cardId, accessCode, params.merchantAddress);
  const referenceId = `card_ref_${cardId}`;
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const resourceId = generateResourceId(
    params.merchantAddress,
    referenceId,
    params.amount,
    salt
  );

  const card: BNBPayCard = {
    cardId,
    cardType: params.recipientAddress ? 'direct' : 'open',
    creatorAddress: params.merchantAddress,
    payerAddress: params.merchantAddress,
    accessCode,
    signature,
    amount: params.amount,
    token: params.token,
    merchantAddress: params.merchantAddress,
    merchantName: params.merchantName,
    recipientAddress: params.recipientAddress,
    status: 'active',
    network: params.network,
    createdAt: Date.now(),
    expiresAt: params.expiresInDays
      ? Date.now() + params.expiresInDays * 24 * 60 * 60 * 1000
      : undefined,
    message: params.message,
    resourceId,
    referenceId,
    x402FlexHeaders: {
      'X-402-Protocol': 'flex/1.0',
      'X-402-Resource-Id': resourceId,
      'X-402-Amount': params.amount,
      'X-402-Currency': params.token,
      'X-402-Chain': params.network === 'bnb' ? 'bnb-chain:56' : 'bnb-chain:97',
      'X-402-Merchant': params.merchantAddress,
      'X-402-Accepts': 'BNB,USDT,USDC,USD1,BUSD',
    },
  };

  return card;
}

/**
 * Save card to storage
 */
export function saveCard(card: BNBPayCard): void {
  // Save to global cards list
  const cards = getAllCards();
  cards.push(card);
  localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));

  // Save to merchant-specific list
  const merchantAddress = card.merchantAddress ?? card.creatorAddress ?? card.payerAddress;
  if (merchantAddress) {
    const merchantKey = `${CARDS_BY_MERCHANT_PREFIX}${merchantAddress.toLowerCase()}`;
    const merchantCards = JSON.parse(localStorage.getItem(merchantKey) || '[]');
    merchantCards.push(card);
    localStorage.setItem(merchantKey, JSON.stringify(merchantCards));
  }

  // Save individual card for easy lookup
  localStorage.setItem(`bnbpay_giftcard_${card.cardId}`, JSON.stringify(card));
}

/**
 * Get all cards
 */
export function getAllCards(): BNBPayCard[] {
  try {
    return JSON.parse(localStorage.getItem(CARDS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

/**
 * Get cards by merchant
 */
export function getCardsByMerchant(merchantAddress: string): BNBPayCard[] {
  try {
    const key = `${CARDS_BY_MERCHANT_PREFIX}${merchantAddress.toLowerCase()}`;
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

/**
 * Get card by ID
 */
export function getCardById(cardId: string): BNBPayCard | null {
  try {
    const stored = localStorage.getItem(`bnbpay_giftcard_${cardId}`);
    if (stored) return JSON.parse(stored);

    // Fallback to searching all cards
    const cards = getAllCards();
    return cards.find(c => c.cardId === cardId) || null;
  } catch {
    return null;
  }
}

/**
 * Get card by access code and signature
 */
export function getCardByCredentials(accessCode: string, signature: string): BNBPayCard | null {
  const cards = getAllCards();
  return cards.find(c =>
    Boolean(c.accessCode && c.signature) &&
    c.accessCode === accessCode.toUpperCase().replace(/\s/g, '') &&
    c.signature === signature
  ) || null;
}

/**
 * Validate card credentials
 */
export function validateCardCredentials(accessCode: string, signature: string): {
  valid: boolean;
  card?: BNBPayCard;
  error?: string;
} {
  const normalizedCode = accessCode.toUpperCase().replace(/[\s-]/g, '');
  const cards = getAllCards();

  const card = cards.find(c => {
    if (!c.accessCode || !c.signature) return false;
    const storedCode = c.accessCode.replace(/-/g, '');
    return storedCode === normalizedCode && c.signature === signature;
  });

  if (!card) {
    return { valid: false, error: 'Invalid access code or signature' };
  }

  if (card.status === 'redeemed') {
    return { valid: false, error: 'This card has already been redeemed' };
  }

  if (card.status === 'cancelled') {
    return { valid: false, error: 'This card has been cancelled' };
  }

  if (card.status === 'expired' || (card.expiresAt && card.expiresAt < Date.now())) {
    return { valid: false, error: 'This card has expired' };
  }

  return { valid: true, card };
}

/**
 * Validate card by access code only (signature looked up from storage)
 */
export function validateCardByAccessCode(accessCode: string): {
  valid: boolean;
  card?: BNBPayCard;
  error?: string;
} {
  const normalizedCode = accessCode.toUpperCase().replace(/[\s-]/g, '');
  const cards = getAllCards();

  const card = cards.find(c => {
    if (!c.accessCode) return false;
    const storedCode = c.accessCode.replace(/-/g, '');
    return storedCode === normalizedCode;
  });

  if (!card) {
    return { valid: false, error: 'Invalid access code' };
  }

  if (card.status === 'redeemed') {
    return { valid: false, error: 'This card has already been redeemed' };
  }

  if (card.status === 'cancelled') {
    return { valid: false, error: 'This card has been cancelled' };
  }

  if (card.status === 'expired' || (card.expiresAt && card.expiresAt < Date.now())) {
    return { valid: false, error: 'This card has expired' };
  }

  return { valid: true, card };
}

/**
 * Update card status
 */
export function updateCardStatus(
  cardId: string,
  status: BNBPayCard['status'],
  additionalData?: Partial<BNBPayCard>
): BNBPayCard | null {
  const card = getCardById(cardId);
  if (!card) return null;

  const updatedCard: BNBPayCard = {
    ...card,
    status,
    ...additionalData,
  };

  // Update individual card storage
  localStorage.setItem(`bnbpay_giftcard_${cardId}`, JSON.stringify(updatedCard));

  // Update global cards list
  const cards = getAllCards();
  const index = cards.findIndex(c => c.cardId === cardId);
  if (index >= 0) {
    cards[index] = updatedCard;
    localStorage.setItem(CARDS_STORAGE_KEY, JSON.stringify(cards));
  }

  // Update merchant-specific list
  const merchantAddress = card.merchantAddress ?? card.creatorAddress ?? card.payerAddress;
  if (merchantAddress) {
    const merchantKey = `${CARDS_BY_MERCHANT_PREFIX}${merchantAddress.toLowerCase()}`;
    const merchantCards = JSON.parse(localStorage.getItem(merchantKey) || '[]') as BNBPayCard[];
    const merchantIndex = merchantCards.findIndex(c => c.cardId === cardId);
    if (merchantIndex >= 0) {
      merchantCards[merchantIndex] = updatedCard;
      localStorage.setItem(merchantKey, JSON.stringify(merchantCards));
    }
  }

  return updatedCard;
}

/**
 * Mark card as redeemed
 */
export function markCardRedeemed(
  cardId: string,
  redeemedBy: string,
  txHash: string,
  paymentId?: string
): BNBPayCard | null {
  return updateCardStatus(cardId, 'redeemed', {
    redeemedAt: Date.now(),
    redeemedBy,
    txHash,
    paymentId,
  });
}

/**
 * Generate redemption link
 */
export function generateRedemptionLink(card: BNBPayCard): string {
  const data = {
    id: card.cardId,
    code: card.accessCode ?? '',
    sig: card.signature ?? '',
    amount: card.amount,
    token: card.token,
    merchant: card.merchantName || 'BNB Pay Card',
    msg: card.message || '',
  };
  const encoded = btoa(JSON.stringify(data));
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  return `${baseUrl}/giftcard/redeem?data=${encodeURIComponent(encoded)}`;
}

/**
 * Parse redemption link data
 */
export function parseRedemptionLink(encodedData: string): {
  id: string;
  code: string;
  sig: string;
  amount: string;
  token: Token;
  merchant: string;
  msg: string;
} | null {
  try {
    const decoded = atob(decodeURIComponent(encodedData));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export const cardStorage = {
  generateCardId,
  generateAccessCode,
  generateCardSignature,
  generateResourceId,
  createCard,
  saveCard,
  getAllCards,
  getCardsByMerchant,
  getCardById,
  getCardByCredentials,
  validateCardCredentials,
  updateCardStatus,
  markCardRedeemed,
  generateRedemptionLink,
  parseRedemptionLink,
};

export default cardStorage;
