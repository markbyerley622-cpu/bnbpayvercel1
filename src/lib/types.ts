/**
 * USD1 Payments UI Types
 */

import type { Token } from './price-utils';

export interface TokenPaymentOption {
  token: Token;
  tokenAmount: string;
  usdValue: string;
}

export interface InvoiceData {
  type: 'invoice';
  currency: string; // Settlement token (BNB, USDT, etc.)
  amount: string; // Settlement amount in selected token
  description: string;
  customer: {
    name: string;
    email: string;
  };
  dueDate?: string;
  supports_multi_token: boolean;
  settlement: string; // Settlement token (not always USD1)
  referenceId?: string;
  invoiceId?: string;
  paymentLink?: string;
  // Payment token info (what user is paying with)
  paymentToken?: Token;
  paymentAmount?: string; // Amount in payment token
  acceptedTokens?: TokenPaymentOption[];
  allowedTokens?: string[]; // List of allowed tokens for payment
  // Payee wallet address (who will pay this invoice)
  payeeWalletAddress?: string;
  // On-chain data
  merchantAddress?: string;
  txHash?: string;
  paymentId?: string;
  blockNumber?: number;
  // x402 Flex headers
  x402FlexHeaders?: Record<string, string>;
  resourceId?: string;
  createdAt?: number;
  // Payment status
  status?: 'pending' | 'paid' | 'cancelled' | 'expired';
  paidAt?: number;
  paidBy?: string;
  paidToken?: string;
  paidAmount?: string;
}

export interface SubscriptionData {
  type: 'subscription';
  currency: string; // Settlement token (can be any token, not just USD1)
  planName: string;
  price: string; // Settlement price in selected token
  price_usd1?: string; // Legacy: USD1 equivalent (optional)
  interval: 'monthly' | 'yearly';
  customerEmail?: string;
  supports_multi_token: boolean;
  settlement: string; // Settlement token (can be any token)
  subscriptionId?: string;
  paymentLink?: string;
  // Payment token info
  paymentToken?: Token;
  paymentAmount?: string; // Amount in payment token
  acceptedTokens?: TokenPaymentOption[];
  // On-chain data
  txHash?: string;
  planId?: number;
  merchantAddress?: string;
  createdAt?: number;
}

export interface MCPCall {
  method: string;
  payload: any;
  description: string;
}

export interface ContractStub {
  deployContract: () => Promise<string>;
  createInvoiceOnChain: (invoice: InvoiceData) => Promise<string>;
  createSubscriptionOnChain: (subscription: SubscriptionData) => Promise<string>;
  settleToUSD1: (paymentId: string) => Promise<string>;
  simulateMultiTokenSwap: (fromToken: string, toToken: string, amount: string) => Promise<string>;
}
