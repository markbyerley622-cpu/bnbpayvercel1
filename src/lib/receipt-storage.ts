/**
 * Receipt Storage Utility
 *
 * Manages local storage of payment receipts per wallet address.
 * Each wallet only sees their own receipts.
 *
 * Storage key format: `bnbpay_receipts_<WALLET_ADDRESS>`
 */

import { useState, useEffect, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export type ReceiptType = 'invoice' | 'subscription';
export type ReceiptStatus = 'pending' | 'paid' | 'failed' | 'cancelled';

export interface PaymentReceipt {
  id: string;
  type: ReceiptType;
  timestamp: number;
  amount: string;
  currency: string;
  token: string;
  tokenLogoUrl: string;
  reference: string;
  invoiceId?: string;
  subscriptionId?: string;
  merchantAddress: string;
  merchantName?: string;
  payerWallet: string;
  description?: string;
  status: ReceiptStatus;
  txHash?: string;
  network: 'mainnet' | 'testnet';
  pngUrl?: string;
  pngDataUrl?: string;
}

export interface ReceiptListFilters {
  type?: ReceiptType;
  status?: ReceiptStatus;
  startDate?: Date;
  endDate?: Date;
}

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
 * Get token logo URL with fallback
 */
export function getTokenLogoUrl(token: string): string {
  const upperToken = token.toUpperCase();
  return TOKEN_LOGOS[upperToken] || '/2.png'; // fallback to generic coin
}

// ============================================================================
// Storage Keys - Using bnbpay_receipts_ prefix as requested
// ============================================================================

function getStorageKey(walletAddress: string): string {
  return `bnbpay_receipts_${walletAddress.toLowerCase()}`;
}

// ============================================================================
// Receipt CRUD Operations
// ============================================================================

/**
 * Get all receipts for a wallet address.
 * Returns empty array if no receipts found.
 */
export function getReceipts(walletAddress: string): PaymentReceipt[] {
  if (!walletAddress) return [];

  try {
    const key = getStorageKey(walletAddress);
    const stored = localStorage.getItem(key);
    console.log(`[ReceiptStorage] Loading receipts for ${walletAddress}, key: ${key}, found: ${stored ? 'yes' : 'no'}`);
    if (!stored) return [];

    const receipts = JSON.parse(stored) as PaymentReceipt[];
    console.log(`[ReceiptStorage] Loaded ${receipts.length} receipts`);
    // Sort by timestamp descending (newest first)
    return receipts.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('[ReceiptStorage] Failed to get receipts:', error);
    return [];
  }
}

/**
 * Get receipts filtered by type and/or status.
 */
export function getFilteredReceipts(
  walletAddress: string,
  filters: ReceiptListFilters
): PaymentReceipt[] {
  let receipts = getReceipts(walletAddress);

  if (filters.type) {
    receipts = receipts.filter(r => r.type === filters.type);
  }

  if (filters.status) {
    receipts = receipts.filter(r => r.status === filters.status);
  }

  if (filters.startDate) {
    const start = filters.startDate.getTime();
    receipts = receipts.filter(r => r.timestamp >= start);
  }

  if (filters.endDate) {
    const end = filters.endDate.getTime();
    receipts = receipts.filter(r => r.timestamp <= end);
  }

  return receipts;
}

/**
 * Get invoice receipts only.
 */
export function getInvoiceReceipts(walletAddress: string): PaymentReceipt[] {
  return getFilteredReceipts(walletAddress, { type: 'invoice' });
}

/**
 * Get subscription receipts only.
 */
export function getSubscriptionReceipts(walletAddress: string): PaymentReceipt[] {
  return getFilteredReceipts(walletAddress, { type: 'subscription' });
}

/**
 * Get a single receipt by ID.
 */
export function getReceiptById(
  walletAddress: string,
  receiptId: string
): PaymentReceipt | null {
  const receipts = getReceipts(walletAddress);
  return receipts.find(r => r.id === receiptId) || null;
}

/**
 * Save a new receipt (APPENDS to existing receipts, never overwrites).
 * Returns the saved receipt with generated ID.
 */
export function saveReceipt(
  walletAddress: string,
  receipt: Omit<PaymentReceipt, 'id'>
): PaymentReceipt {
  if (!walletAddress) {
    throw new Error('Wallet address required to save receipt');
  }

  const receipts = getReceipts(walletAddress);

  // Generate unique ID
  const id = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

  const newReceipt: PaymentReceipt = {
    ...receipt,
    id,
  };

  // Check for duplicates (same txHash or invoiceId)
  const existingIndex = receipts.findIndex(
    r => (r.txHash === receipt.txHash && r.txHash) ||
         (r.invoiceId === receipt.invoiceId && r.invoiceId) ||
         (r.subscriptionId === receipt.subscriptionId && r.subscriptionId)
  );

  if (existingIndex >= 0) {
    // Update existing receipt
    console.log(`[ReceiptStorage] Updating existing receipt at index ${existingIndex}`);
    receipts[existingIndex] = { ...receipts[existingIndex], ...newReceipt, id: receipts[existingIndex].id };
  } else {
    // APPEND new receipt to the beginning
    console.log(`[ReceiptStorage] Adding new receipt`);
    receipts.unshift(newReceipt);
  }

  try {
    const key = getStorageKey(walletAddress);
    localStorage.setItem(key, JSON.stringify(receipts));
    console.log(`[ReceiptStorage] Saved ${receipts.length} receipts to ${key}`);
  } catch (error) {
    console.error('[ReceiptStorage] Failed to save receipt:', error);
    throw new Error('Failed to save receipt');
  }

  return existingIndex >= 0 ? receipts[existingIndex] : newReceipt;
}

/**
 * Update an existing receipt.
 */
export function updateReceipt(
  walletAddress: string,
  receiptId: string,
  updates: Partial<PaymentReceipt>
): PaymentReceipt | null {
  if (!walletAddress) return null;

  const receipts = getReceipts(walletAddress);
  const index = receipts.findIndex(r => r.id === receiptId);

  if (index < 0) return null;

  receipts[index] = {
    ...receipts[index],
    ...updates,
    id: receiptId, // Preserve original ID
  };

  try {
    const key = getStorageKey(walletAddress);
    localStorage.setItem(key, JSON.stringify(receipts));
  } catch (error) {
    console.error('[ReceiptStorage] Failed to update receipt:', error);
    return null;
  }

  return receipts[index];
}

/**
 * Update receipt PNG data URL.
 */
export function updateReceiptPng(
  walletAddress: string,
  receiptId: string,
  pngDataUrl: string
): boolean {
  const result = updateReceipt(walletAddress, receiptId, { pngDataUrl });
  return result !== null;
}

/**
 * Delete a receipt.
 */
export function deleteReceipt(walletAddress: string, receiptId: string): boolean {
  if (!walletAddress) return false;

  const receipts = getReceipts(walletAddress);
  const filtered = receipts.filter(r => r.id !== receiptId);

  if (filtered.length === receipts.length) return false;

  try {
    const key = getStorageKey(walletAddress);
    localStorage.setItem(key, JSON.stringify(filtered));
    return true;
  } catch (error) {
    console.error('[ReceiptStorage] Failed to delete receipt:', error);
    return false;
  }
}

/**
 * Clear all receipts for a wallet.
 */
export function clearReceipts(walletAddress: string): boolean {
  if (!walletAddress) return false;

  try {
    const key = getStorageKey(walletAddress);
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('[ReceiptStorage] Failed to clear receipts:', error);
    return false;
  }
}

// ============================================================================
// Receipt Creation Helpers
// ============================================================================

/**
 * Create a receipt from invoice payment.
 */
export function createInvoiceReceipt(params: {
  walletAddress: string;
  invoiceId: string;
  reference: string;
  amount: string;
  currency: string;
  token: string;
  merchantAddress: string;
  merchantName?: string;
  payerWallet: string;
  description?: string;
  txHash?: string;
  status: ReceiptStatus;
  network: 'mainnet' | 'testnet';
}): PaymentReceipt {
  console.log('[ReceiptStorage] Creating invoice receipt:', params);
  return saveReceipt(params.walletAddress, {
    type: 'invoice',
    timestamp: Date.now(),
    amount: params.amount,
    currency: params.currency,
    token: params.token,
    tokenLogoUrl: getTokenLogoUrl(params.token),
    reference: params.reference,
    invoiceId: params.invoiceId,
    merchantAddress: params.merchantAddress,
    merchantName: params.merchantName || 'BNBPay Merchant',
    payerWallet: params.payerWallet,
    description: params.description,
    status: params.status,
    txHash: params.txHash,
    network: params.network,
  });
}

/**
 * Create a receipt from subscription payment.
 */
export function createSubscriptionReceipt(params: {
  walletAddress: string;
  subscriptionId: string;
  planName: string;
  reference: string;
  amount: string;
  currency: string;
  token: string;
  merchantAddress: string;
  merchantName?: string;
  payerWallet: string;
  txHash?: string;
  status: ReceiptStatus;
  network: 'mainnet' | 'testnet';
}): PaymentReceipt {
  console.log('[ReceiptStorage] Creating subscription receipt:', params);
  return saveReceipt(params.walletAddress, {
    type: 'subscription',
    timestamp: Date.now(),
    amount: params.amount,
    currency: params.currency,
    token: params.token,
    tokenLogoUrl: getTokenLogoUrl(params.token),
    reference: params.reference,
    subscriptionId: params.subscriptionId,
    merchantAddress: params.merchantAddress,
    merchantName: params.merchantName || 'BNBPay Merchant',
    payerWallet: params.payerWallet,
    description: params.planName,
    status: params.status,
    txHash: params.txHash,
    network: params.network,
  });
}

// ============================================================================
// Stats & Summary
// ============================================================================

export interface ReceiptSummary {
  totalInvoices: number;
  totalSubscriptions: number;
  totalPaid: number;
  totalPending: number;
  totalAmount: string;
  latestReceipt: PaymentReceipt | null;
}

/**
 * Get receipt summary for a wallet.
 */
export function getReceiptSummary(walletAddress: string): ReceiptSummary {
  const receipts = getReceipts(walletAddress);

  const invoices = receipts.filter(r => r.type === 'invoice');
  const subscriptions = receipts.filter(r => r.type === 'subscription');
  const paid = receipts.filter(r => r.status === 'paid');
  const pending = receipts.filter(r => r.status === 'pending');

  // Sum amounts (simplified - assumes same currency)
  const totalAmount = paid.reduce((sum, r) => sum + parseFloat(r.amount || '0'), 0);

  return {
    totalInvoices: invoices.length,
    totalSubscriptions: subscriptions.length,
    totalPaid: paid.length,
    totalPending: pending.length,
    totalAmount: totalAmount.toFixed(2),
    latestReceipt: receipts[0] || null,
  };
}

// ============================================================================
// React Hook
// ============================================================================

export function useReceiptStorage(walletAddress: string | null) {
  const [receipts, setReceipts] = useState<PaymentReceipt[]>([]);
  const [loading, setLoading] = useState(true);

  // Load receipts when wallet changes
  useEffect(() => {
    if (!walletAddress) {
      setReceipts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const loadedReceipts = getReceipts(walletAddress);
    setReceipts(loadedReceipts);
    setLoading(false);
  }, [walletAddress]);

  // Refresh receipts
  const refresh = useCallback(() => {
    if (!walletAddress) return;
    const loadedReceipts = getReceipts(walletAddress);
    setReceipts(loadedReceipts);
  }, [walletAddress]);

  // Add a new receipt
  const addReceipt = useCallback(
    (receipt: Omit<PaymentReceipt, 'id'>) => {
      if (!walletAddress) return null;
      const saved = saveReceipt(walletAddress, receipt);
      refresh();
      return saved;
    },
    [walletAddress, refresh]
  );

  // Update a receipt
  const update = useCallback(
    (receiptId: string, updates: Partial<PaymentReceipt>) => {
      if (!walletAddress) return null;
      const updated = updateReceipt(walletAddress, receiptId, updates);
      refresh();
      return updated;
    },
    [walletAddress, refresh]
  );

  // Delete a receipt
  const remove = useCallback(
    (receiptId: string) => {
      if (!walletAddress) return false;
      const result = deleteReceipt(walletAddress, receiptId);
      refresh();
      return result;
    },
    [walletAddress, refresh]
  );

  // Get filtered receipts
  const getFiltered = useCallback(
    (filters: ReceiptListFilters) => {
      if (!walletAddress) return [];
      return getFilteredReceipts(walletAddress, filters);
    },
    [walletAddress]
  );

  // Get summary
  const summary = useCallback(() => {
    if (!walletAddress) {
      return {
        totalInvoices: 0,
        totalSubscriptions: 0,
        totalPaid: 0,
        totalPending: 0,
        totalAmount: '0.00',
        latestReceipt: null,
      };
    }
    return getReceiptSummary(walletAddress);
  }, [walletAddress, receipts]); // Add receipts as dependency to recalculate when receipts change

  return {
    receipts,
    loading,
    refresh,
    addReceipt,
    update,
    remove,
    getFiltered,
    summary,
    invoiceReceipts: receipts.filter(r => r.type === 'invoice'),
    subscriptionReceipts: receipts.filter(r => r.type === 'subscription'),
  };
}

export default {
  getReceipts,
  getFilteredReceipts,
  getInvoiceReceipts,
  getSubscriptionReceipts,
  getReceiptById,
  saveReceipt,
  updateReceipt,
  updateReceiptPng,
  deleteReceipt,
  clearReceipts,
  createInvoiceReceipt,
  createSubscriptionReceipt,
  getReceiptSummary,
  getTokenLogoUrl,
};
