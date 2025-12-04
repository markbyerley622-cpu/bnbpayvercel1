/**
 * Contract Stub Functions for USD1 Payments
 * These are placeholder functions for blockchain interactions
 */

import type { InvoiceData, SubscriptionData, ContractStub } from './types';
import { getTokenDisplayName } from './price-utils';

export const contractStubs: ContractStub = {
  /**
   * Deploy USD1 payment contracts (stub)
   */
  async deployContract(): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 1000));
    console.log('[STUB] Deploying USD1 payment contracts...');
    return '0x' + Math.random().toString(16).slice(2, 42).padEnd(40, '0');
  },

  /**
   * Create invoice on-chain (stub)
   */
  async createInvoiceOnChain(invoice: InvoiceData): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('[STUB] Creating invoice on-chain:', invoice);

    const invoiceId = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');

    return JSON.stringify({
      invoiceId,
      txHash,
      status: 'pending',
      paymentLink: `https://pay.testnet/x402/usd1/invoice/${invoiceId}`,
    });
  },

  /**
   * Create subscription on-chain (stub)
   */
  async createSubscriptionOnChain(subscription: SubscriptionData): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 800));
    console.log('[STUB] Creating subscription on-chain:', subscription);

    const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');

    return JSON.stringify({
      subscriptionId,
      txHash,
      status: 'active',
      paymentLink: `https://pay.testnet/x402/usd1/subscription/${subscriptionId}`,
    });
  },

  /**
   * Settle multi-token payment to USD1 (stub)
   */
  async settleToUSD1(paymentId: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 1200));
    console.log('[STUB] Settling payment to USD1:', paymentId);

    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');

    return JSON.stringify({
      paymentId,
      settlementTxHash: txHash,
      settlementToken: 'USD1',
      status: 'settled',
      timestamp: Date.now(),
    });
  },

  /**
   * Simulate multi-token swap to USD1 (stub)
   */
  async simulateMultiTokenSwap(fromToken: string, toToken: string, amount: string): Promise<string> {
    await new Promise(resolve => setTimeout(resolve, 600));
    console.log('[STUB] Simulating swap:', { fromToken, toToken, amount });

    const rate = 0.98 + Math.random() * 0.04; // 98-102% rate
    const outputAmount = (parseFloat(amount) * rate).toFixed(6);

    return JSON.stringify({
      fromToken,
      toToken,
      inputAmount: amount,
      outputAmount,
      rate: rate.toFixed(4),
      slippage: '0.5%',
      estimatedGas: '150000',
    });
  },
};

/**
 * Clean token names for display (removes T prefix for testnet tokens)
 */
function cleanTokenName(token: string | undefined): string {
  if (!token) return 'BNB';
  return getTokenDisplayName(token);
}

/**
 * Clean x402 headers for display (removes T prefix from token names)
 */
function cleanX402Headers(headers: Record<string, string> | undefined) {
  if (!headers) return undefined;

  return {
    ...headers,
    'X-402-Currency': headers['X-402-Currency']?.startsWith('T')
      ? headers['X-402-Currency'].substring(1)
      : headers['X-402-Currency'],
    'X-402-Settlement': headers['X-402-Settlement']?.startsWith('T')
      ? headers['X-402-Settlement'].substring(1)
      : headers['X-402-Settlement'],
    'X-402-Accepts': headers['X-402-Accepts']
      ?.split(',')
      .map((t: string) => t.trim().startsWith('T') ? t.trim().substring(1) : t.trim())
      .join(', '),
  };
}

/**
 * Generate MCP example calls with clean token names
 */
export function generateMCPExamples(data: InvoiceData | SubscriptionData) {
  // Get the user's selected settlement token (cleaned)
  const settlementToken = cleanTokenName(data.settlement || data.paymentToken);

  if (data.type === 'invoice') {
    const invoiceData = data as InvoiceData;

    // Create a clean payload with proper token names
    const cleanPayload = {
      type: 'invoice',
      currency: cleanTokenName(invoiceData.currency),
      amount: invoiceData.amount,
      description: invoiceData.description,
      customer: invoiceData.payeeWalletAddress
        ? { payeeWallet: invoiceData.payeeWalletAddress }
        : { name: invoiceData.customer?.name },
      dueDate: invoiceData.dueDate,
      settlement: cleanTokenName(invoiceData.settlement),
      referenceId: invoiceData.referenceId,
      paymentToken: cleanTokenName(invoiceData.paymentToken),
      paymentAmount: invoiceData.paymentAmount,
      ...(invoiceData.payeeWalletAddress && { payeeWalletAddress: invoiceData.payeeWalletAddress }),
      invoiceId: invoiceData.invoiceId,
      paymentLink: invoiceData.paymentLink,
      x402FlexHeaders: cleanX402Headers(invoiceData.x402FlexHeaders),
      resourceId: invoiceData.resourceId,
      merchantAddress: invoiceData.merchantAddress,
      paymentId: invoiceData.paymentId,
      createdAt: invoiceData.createdAt,
    };

    // Remove undefined values
    Object.keys(cleanPayload).forEach(key => {
      if (cleanPayload[key as keyof typeof cleanPayload] === undefined) {
        delete cleanPayload[key as keyof typeof cleanPayload];
      }
    });

    return [
      {
        method: 'x402.create_invoice',
        payload: cleanPayload,
        description: `Create a new ${settlementToken} invoice`,
      },
      {
        method: 'x402.get_status',
        payload: { invoiceId: invoiceData.invoiceId || 'inv_xxx' },
        description: 'Check invoice payment status',
      },
      {
        method: 'x402.settle_payment',
        payload: {
          invoiceId: invoiceData.invoiceId || 'inv_xxx',
          settlementToken: settlementToken,
        },
        description: `Settle multi-token payment to ${settlementToken}`,
      },
    ];
  } else {
    const subscriptionData = data as SubscriptionData;

    // Create clean subscription payload
    const cleanPayload = {
      type: 'subscription',
      planName: subscriptionData.planName,
      price: subscriptionData.price,
      currency: cleanTokenName(subscriptionData.currency),
      interval: subscriptionData.interval,
      settlement: cleanTokenName(subscriptionData.settlement),
      subscriptionId: subscriptionData.subscriptionId,
      merchantAddress: subscriptionData.merchantAddress,
      paymentLink: subscriptionData.paymentLink,
      createdAt: subscriptionData.createdAt,
    };

    // Remove undefined values
    Object.keys(cleanPayload).forEach(key => {
      if (cleanPayload[key as keyof typeof cleanPayload] === undefined) {
        delete cleanPayload[key as keyof typeof cleanPayload];
      }
    });

    return [
      {
        method: 'x402.create_subscription',
        payload: cleanPayload,
        description: `Create a new ${settlementToken} subscription`,
      },
      {
        method: 'x402.charge_subscription',
        payload: { subscriptionId: subscriptionData.subscriptionId || 'sub_xxx' },
        description: 'Charge active subscription',
      },
      {
        method: 'x402.cancel_subscription',
        payload: { subscriptionId: subscriptionData.subscriptionId || 'sub_xxx' },
        description: 'Cancel subscription',
      },
    ];
  }
}

/**
 * Generate clean JSON payload for display
 */
export function generateCleanPayload(data: InvoiceData | SubscriptionData) {
  if (data.type === 'invoice') {
    const invoiceData = data as InvoiceData;
    const payload: Record<string, unknown> = {
      type: 'invoice',
      currency: cleanTokenName(invoiceData.currency),
      amount: invoiceData.amount,
      description: invoiceData.description,
      settlement: cleanTokenName(invoiceData.settlement),
      paymentToken: cleanTokenName(invoiceData.paymentToken),
      paymentAmount: invoiceData.paymentAmount,
      invoiceId: invoiceData.invoiceId,
      paymentLink: invoiceData.paymentLink,
      merchantAddress: invoiceData.merchantAddress,
      createdAt: invoiceData.createdAt,
    };

    // Add optional fields
    if (invoiceData.customer?.name && invoiceData.customer.name !== 'Specified Wallet') {
      payload.customer = { name: invoiceData.customer.name };
    }
    if (invoiceData.dueDate) payload.dueDate = invoiceData.dueDate;
    if (invoiceData.referenceId) payload.referenceId = invoiceData.referenceId;
    if (invoiceData.payeeWalletAddress) payload.payeeWalletAddress = invoiceData.payeeWalletAddress;
    if (invoiceData.x402FlexHeaders) payload.x402FlexHeaders = cleanX402Headers(invoiceData.x402FlexHeaders);
    if (invoiceData.resourceId) payload.resourceId = invoiceData.resourceId;
    if (invoiceData.paymentId) payload.paymentId = invoiceData.paymentId;

    return payload;
  } else {
    const subscriptionData = data as SubscriptionData;
    const payload: Record<string, unknown> = {
      type: 'subscription',
      planName: subscriptionData.planName,
      price: subscriptionData.price,
      currency: cleanTokenName(subscriptionData.currency),
      interval: subscriptionData.interval,
      settlement: cleanTokenName(subscriptionData.settlement),
      subscriptionId: subscriptionData.subscriptionId,
      merchantAddress: subscriptionData.merchantAddress,
      paymentLink: subscriptionData.paymentLink,
      createdAt: subscriptionData.createdAt,
    };

    if (subscriptionData.customerEmail) payload.customerEmail = subscriptionData.customerEmail;

    return payload;
  }
}
