/**
 * Core Types for BNB Pay Gift Cards
 */

// Network types
export type NetworkType = 'mainnet' | 'testnet';
export type NetworkKey = 'bnb' | 'bnbTestnet';

// Supported tokens
export type Token = 'BNB' | 'USDT' | 'USDC' | 'USD1' | 'WUSD' | 'XUSD' | 'BUSD';

// Card status
export type CardStatus = 'active' | 'claimed' | 'redeemed' | 'expired' | 'cancelled';
export type GiftCardType = 'direct' | 'open';

// Token info interface
export interface TokenInfo {
  symbol: Token;
  name: string;
  decimals: number;
  icon: string;
}

// BNB Pay Gift Card
export interface BNBPayCard {
  cardId: string;
  cardType: GiftCardType;
  amount: string;
  token: Token;
  creatorAddress: string;
  payerAddress: string;
  merchantAddress?: string;
  merchantName?: string;
  recipientAddress?: string;
  signature?: string;
  claimSigner?: string;
  claimedAgent?: string;
  sessionId?: string;
  sessionEpoch?: number;
  sessionSpendNonce?: string;
  sessionExpiresAt?: number;
  status: CardStatus;
  network: NetworkKey;
  createdAt: number;
  expiresAt?: number;
  redeemedAt?: number;
  redeemedBy?: string;
  txHash?: string;
  paymentId?: string;
  message?: string;
  senderName?: string;
  reference?: string;
  referenceId?: string;
  resourceId?: string;
  intentHash?: string;
  schemeId?: string;
  accessCode?: string;
  x402FlexHeaders?: Record<string, string>;
}

// Gift card create form data
export interface GiftCardCreateFormData {
  amount: string;
  token: Token;
  recipientAddress?: string;
  cardType: GiftCardType;
  message?: string;
  expiresInDays: number;
  network: NetworkKey;
  senderName?: string;
}

// Gift card redeem form data
export interface GiftCardRedeemFormData {
  accessCode?: string;
}

// Payment intent for gift cards
export interface GiftCardPaymentIntent {
  paymentId: string;
  merchant: string;
  token: string;
  amount: string;
  deadline: number;
  resourceId: string;
  referenceHash: string;
  payer: string;
}

// Flex witness for payment authorization
export interface FlexWitness {
  schemeId: string;
  intentHash: string;
  payer: string;
  salt: string;
}

// API response types
export interface GiftCardCreateResponse {
  success: boolean;
  card?: BNBPayCard;
  redeemUrl?: string;
  accessCode?: string;
  error?: string;
}

export interface GiftCardRedeemResponse {
  success: boolean;
  txHash?: string;
  paymentId?: string;
  error?: string;
}

export interface GiftCardStatusResponse {
  success: boolean;
  card?: BNBPayCard;
  error?: string;
}

// History item for display
export interface GiftCardHistoryItem {
  id: string;
  type: 'created' | 'redeemed' | 'expired' | 'cancelled';
  card: BNBPayCard;
  timestamp: number;
  txHash?: string;
}

// Network to chain ID mapping
export const NETWORK_CHAIN_IDS: Record<NetworkKey, number> = {
  bnb: 56,
  bnbTestnet: 97,
};

// Convert NetworkType to NetworkKey
export function toNetworkKey(network: NetworkType): NetworkKey {
  return network === 'mainnet' ? 'bnb' : 'bnbTestnet';
}

// Convert NetworkKey to NetworkType
export function toNetworkType(key: NetworkKey): NetworkType {
  return key === 'bnb' ? 'mainnet' : 'testnet';
}
