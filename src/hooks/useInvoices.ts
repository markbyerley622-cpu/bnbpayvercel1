/**
 * React Hooks for Invoice Management
 *
 * Provides hooks for creating, fetching, and paying invoices using BNBPay API.
 */

import { useState, useCallback } from 'react';
import {
  buildPaymentIntent,
  type BuildIntentRequest,
  type BuildIntentResponse,
  type NetworkKey,
} from '../lib/bnbpay-api';

export interface Invoice {
  id: string;
  merchantAddress: string;
  customerName: string;
  customerEmail: string;
  description: string;
  amount: string; // Human-readable amount (e.g., "10.50")
  currency: string; // Token symbol (USD1, USDT, etc.)
  tokenAddress: string;
  dueDate: Date;
  status: 'pending' | 'paid' | 'expired' | 'failed';
  createdAt: Date;
  paidAt?: Date;
  txHash?: string;
  paymentId?: string;
  network: NetworkType;
}

export type NetworkType = 'testnet' | 'mainnet';

export interface CreateInvoiceParams {
  merchantAddress: string;
  customerName: string;
  customerEmail: string;
  description: string;
  amount: string;
  currency: string;
  tokenAddress: string;
  dueDate: Date;
  network: NetworkType;
}

export interface CreateInvoiceResult {
  invoice: Invoice;
  paymentIntent?: BuildIntentResponse;
}

/**
 * Hook for managing invoices
 */
export function useInvoices() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Create a new invoice
   */
  const createInvoice = useCallback(
    async (params: CreateInvoiceParams): Promise<CreateInvoiceResult> => {
      setLoading(true);
      setError(null);

      try {
        // Generate invoice ID
        const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create invoice object
        const invoice: Invoice = {
          id: invoiceId,
          merchantAddress: params.merchantAddress,
          customerName: params.customerName,
          customerEmail: params.customerEmail,
          description: params.description,
          amount: params.amount,
          currency: params.currency,
          tokenAddress: params.tokenAddress,
          dueDate: params.dueDate,
          status: 'pending',
          createdAt: new Date(),
          network: params.network,
        };

        // Add to invoice list
        setInvoices((prev) => [...prev, invoice]);

        // Optionally build payment intent for immediate payment
        // This creates the canonical invoice reference on the API
        let paymentIntent: BuildIntentResponse | undefined;
        try {
          const networkKey: NetworkKey = params.network === 'mainnet' ? 'bnb' : 'bnbTestnet';
          const intentRequest: BuildIntentRequest = {
            mode: 'minimal',
            network: networkKey,
            merchant: params.merchantAddress,
            token: params.tokenAddress,
            amount: params.amount,
            scheme: 'permit2', // Default to gasless Permit2
            invoiceId: invoiceId, // Use canonical invoice reference
            deadlineSeconds: Math.floor((params.dueDate.getTime() - Date.now()) / 1000),
          };

          paymentIntent = await buildPaymentIntent(intentRequest);
        } catch (err) {
          console.error('Failed to build payment intent:', err);
          // Don't fail invoice creation if intent building fails
        }

        return { invoice, paymentIntent };
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to create invoice';
        setError(errorMessage);
        throw new Error(errorMessage);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  /**
   * Get invoice by ID
   */
  const getInvoice = useCallback(
    (invoiceId: string): Invoice | undefined => {
      return invoices.find((inv) => inv.id === invoiceId);
    },
    [invoices]
  );

  /**
   * Update invoice status
   */
  const updateInvoiceStatus = useCallback(
    (
      invoiceId: string,
      status: Invoice['status'],
      txHash?: string,
      paymentId?: string
    ) => {
      setInvoices((prev) =>
        prev.map((inv) => {
          if (inv.id === invoiceId) {
            return {
              ...inv,
              status,
              txHash,
              paymentId,
              paidAt: status === 'paid' ? new Date() : inv.paidAt,
            };
          }
          return inv;
        })
      );
    },
    []
  );

  /**
   * Mark invoice as paid
   */
  const markInvoicePaid = useCallback(
    (invoiceId: string, txHash: string, paymentId: string) => {
      updateInvoiceStatus(invoiceId, 'paid', txHash, paymentId);
    },
    [updateInvoiceStatus]
  );

  /**
   * Mark invoice as failed
   */
  const markInvoiceFailed = useCallback(
    (invoiceId: string) => {
      updateInvoiceStatus(invoiceId, 'failed');
    },
    [updateInvoiceStatus]
  );

  /**
   * Check for expired invoices
   */
  const checkExpiredInvoices = useCallback(() => {
    const now = new Date();
    setInvoices((prev) =>
      prev.map((inv) => {
        if (inv.status === 'pending' && inv.dueDate < now) {
          return { ...inv, status: 'expired' as const };
        }
        return inv;
      })
    );
  }, []);

  /**
   * Get pending invoices
   */
  const getPendingInvoices = useCallback(() => {
    return invoices.filter((inv) => inv.status === 'pending');
  }, [invoices]);

  /**
   * Get paid invoices
   */
  const getPaidInvoices = useCallback(() => {
    return invoices.filter((inv) => inv.status === 'paid');
  }, [invoices]);

  return {
    invoices,
    loading,
    error,
    createInvoice,
    getInvoice,
    updateInvoiceStatus,
    markInvoicePaid,
    markInvoiceFailed,
    checkExpiredInvoices,
    getPendingInvoices,
    getPaidInvoices,
  };
}
