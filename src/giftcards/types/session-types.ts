/**
 * Session Types for BNB Pay Gift Cards
 * Implements FlexSessionGrant for spendable gift card sessions
 */

import type { Token, NetworkKey } from './types';

// Session status
export type SessionStatus = 'active' | 'spent' | 'revoked' | 'expired';

// Allowed payment schemes
export type PaymentScheme = 'permit2' | 'eip2612' | 'eip3009' | 'native_push' | 'erc20_pull';

// Pre-computed payment intent data (needed for Permit2 with witness)
export interface PreComputedIntent {
  paymentId: string;
  merchant: string;  // Receiver address for gift cards
  token: string;
  amount: string;    // Amount in wei
  deadline: number;
  resourceId: string;
  salt: string;
  intentHash: string;
  schemeId: string;
}

// Pre-signed authorization from creator (stored with gift card)
export interface CreatorAuthorization {
  scheme: PaymentScheme;
  // Pre-computed intent data (for Permit2 with witness)
  intent?: PreComputedIntent;
  // For Permit2 (with witness - includes intentHash in signature)
  permit2?: {
    permit: {
      permitted: { token: string; amount: string };
      nonce: string;
      deadline: number;
    };
    // Witness data that was included in the Permit2 signature
    witness?: {
      schemeId: string;
      intentHash: string;
      payer: string;
      salt: string;
    };
    signature: string;
  };
  // For EIP-2612 (WUSD) - includes pre-signed witness and intent
  eip2612?: {
    owner: string;
    spender: string;
    value: string;
    nonce: number;
    deadline: number;
    v: number;
    r: string;
    s: string;
    // Pre-computed intent data (all values used to compute intentHash)
    intent?: {
      paymentId: string;
      merchant: string;
      token: string;
      amount: string;
      deadline: number;
      resourceId: string;
      referenceHash: string;
      payer: string;
    };
    // Pre-signed witness data (creator signs at creation time)
    witness?: {
      schemeId: string;
      intentHash: string;
      payer: string;
      salt: string;
    };
    witnessSignature?: string;
  };
  // For EIP-3009 (XUSD/WUSD) - includes pre-signed witness and intent
  eip3009?: {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: string;
    v: number;
    r: string;
    s: string;
    // Pre-computed intent data (all values used to compute intentHash)
    intent?: {
      paymentId: string;
      merchant: string;
      token: string;
      amount: string;
      deadline: number;
      resourceId: string;
      referenceHash: string;
      payer: string;
    };
    // Pre-signed witness data (creator signs at creation time)
    witness?: {
      schemeId: string;
      intentHash: string;
      payer: string;
      salt: string;
    };
    witnessSignature?: string;
  };
}

// Token cap for session budgets
export interface TokenCap {
  token: string; // Token address
  symbol: Token;
  maxAmount: string; // Max amount in wei
  spentAmount: string; // Spent amount in wei
  decimals: number;
}

// FlexSessionGrant - EIP-712 typed data for session creation
export interface FlexSessionGrant {
  sessionId: string;
  payer: string; // User 1 (gift card creator)
  agent: string; // User 2 (gift card receiver/spender)
  usdCap: string; // Total USD cap (e.g., "200" for $200)
  tokenCaps: TokenCap[];
  allowedSchemes: PaymentScheme[];
  merchantScope: string[]; // Allowed merchant addresses (empty = any)
  collectorScope: string[]; // Allowed collector addresses (empty = any)
  ttl: number; // Time to live in seconds
  nonce: string;
  epoch: number;
  chainId: number;
}

// Session stored in session store
export interface GiftCardSession {
  // Core identifiers
  sessionId: string;
  accessCode: string; // Shareable code for URL
  sessionKey: string; // Internal key for API

  // Participants
  creatorAddress: string; // User 1 - created the gift card
  receiverAddress: string; // User 2 - can redeem the gift card

  // Session grant data
  grant: FlexSessionGrant;
  grantSignature: string; // EIP-712 signature from creator

  // Pre-signed authorization from creator for gasless redemption
  creatorAuth?: CreatorAuthorization;

  // Budget tracking
  usdCapRemaining: string;
  tokenBudgets: TokenCap[];

  // Card metadata
  amount: string; // Display amount
  token: Token;
  message?: string;
  senderName?: string;

  // Status & timing
  status: SessionStatus;
  network: NetworkKey;
  createdAt: number;
  expiresAt: number;
  lastSpentAt?: number;
  revokedAt?: number;

  // Transaction history
  spends: SessionSpend[];

  // X402 headers for API integration
  x402Headers: {
    'X-402-Protocol': string;
    'X-402-Session-Id': string;
    'X-402-Resource-Id': string;
    'X-402-USD-Cap': string;
    'X-402-USD-Remaining': string;
    'X-402-Chain': string;
    'X-402-Receiver': string;
    'X-402-Accepts': string;
  };
}

// Individual spend record
export interface SessionSpend {
  spendId: string;
  sessionId: string;
  paymentId: string;
  schemeId: string;
  token: string;
  tokenSymbol: Token;
  amount: string;
  usdValue: string;
  merchant: string;
  resourceId: string;
  referenceData: string;
  txHash: string;
  blockNumber: number;
  timestamp: number;
}

// Session open request (to /relay/session/open)
export interface SessionOpenRequest {
  network: NetworkKey;
  receiver: string; // User 2 wallet address
  permit2: boolean;
  grant?: Partial<FlexSessionGrant>;
  metadata?: {
    amount: string;
    token: Token;
    message?: string;
    senderName?: string;
    ttlDays?: number;
  };
}

// Session open response
export interface SessionOpenResponse {
  sessionId: string;
  sessionKey: string;
  accessCode: string;
  expiresAt: number;
  network: NetworkKey;
  receiver: string;
  usdCap: string;
  tokenCaps: TokenCap[];
  redeemUrl: string;
  txHash?: string; // Transaction hash when session opened on-chain
}

// Session submit request (to /relay/session/submit)
export interface SessionSubmitRequest {
  network: NetworkKey;
  sessionId: string;
  accessCode: string;
  receiverAddress: string;
  receiverSignature: string; // Wallet signature proving ownership
  intent: {
    paymentId: string;
    merchant: string;
    token: string;
    amount: string;
    deadline: number;
    resourceId: string;
  };
  witness: {
    schemeId: string;
    intentHash: string;
    payer: string;
    salt: string;
  };
  witnessSignature: string;
}

// Session submit response
export interface SessionSubmitResponse {
  success: boolean;
  txHash: string;
  paymentId: string;
  spendId: string;
  sessionId: string;
  amountSpent: string;
  usdSpent: string;
  usdRemaining: string;
  tokenRemaining: string;
  network: NetworkKey;
}

// Session status query response
export interface SessionStatusResponse {
  sessionId: string;
  status: SessionStatus;
  usdCap: string;
  usdRemaining: string;
  tokenBudgets: TokenCap[];
  spendCount: number;
  lastSpend?: SessionSpend;
  createdAt: number;
  expiresAt: number;
  receiver: string;
  network: NetworkKey;
}

// Session revoke request
export interface SessionRevokeRequest {
  sessionId: string;
  revokerAddress: string;
  revokerSignature: string;
}

// Gift card display data (for UI)
export interface GiftCardDisplay {
  accessCode: string;
  amount: string;
  token: Token;
  usdValue: string;
  senderName?: string;
  message?: string;
  status: SessionStatus;
  expiresAt: number;
  redeemUrl: string;
  receiverAddress: string;
  network: NetworkKey;
  remainingBalance: string;
  spendHistory: SessionSpend[];
}

// Create gift card form data
export interface CreateGiftCardFormData {
  amount: string;
  token: Token;
  receiverAddress: string;
  message?: string;
  senderName?: string;
  expiresInDays: number;
  usdCap?: string; // Optional USD cap, defaults to amount value
}

// EIP-712 domain for session grants
export const SESSION_GRANT_DOMAIN = {
  name: 'BNBPay Session Store',
  version: '1',
};

// EIP-712 types for FlexSessionGrant
export const FLEX_SESSION_GRANT_TYPES = {
  TokenCap: [
    { name: 'token', type: 'address' },
    { name: 'maxAmount', type: 'uint256' },
  ],
  FlexSessionGrant: [
    { name: 'sessionId', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'agent', type: 'address' },
    { name: 'usdCap', type: 'uint256' },
    { name: 'tokenCaps', type: 'TokenCap[]' },
    { name: 'allowedSchemes', type: 'bytes32[]' },
    { name: 'merchantScope', type: 'address[]' },
    { name: 'collectorScope', type: 'address[]' },
    { name: 'ttl', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
    { name: 'epoch', type: 'uint256' },
  ],
};

// Helper to generate scheme IDs
export function getSchemeId(scheme: PaymentScheme): string {
  const schemeMap: Record<PaymentScheme, string> = {
    'permit2': 'exact:evm:permit2',
    'eip2612': 'exact:evm:eip2612',
    'eip3009': 'exact:evm:eip3009',
    'native_push': 'push:evm:direct',
    'erc20_pull': 'pull:evm:allowance',
  };
  return schemeMap[scheme];
}

// Helper to format USD amount
export function formatUsdAmount(amount: string): string {
  const num = parseFloat(amount);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(num);
}

// Helper to calculate remaining balance percentage
export function getRemainingPercentage(spent: string, cap: string): number {
  const spentNum = parseFloat(spent) || 0;
  const capNum = parseFloat(cap) || 1;
  const remaining = Math.max(0, capNum - spentNum);
  return Math.round((remaining / capNum) * 100);
}
