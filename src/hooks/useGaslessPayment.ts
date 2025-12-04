/**
 * React Hook for Gasless Payments via Permit2
 *
 * Handles the complete flow of gasless payments:
 * 1. Check Permit2 approval
 * 2. Build payment intent
 * 3. Sign Permit2 permit
 * 4. Sign witness
 * 5. Relay to BNBPay API
 */

import { useState, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  payInvoiceGasless,
  isPermit2Approved,
  approvePermit2,
  PERMIT2_ADDRESS,
} from '../lib/gasless-payments';
import type { NetworkType } from './useInvoices';

export interface GaslessPaymentParams {
  merchantAddress: string;
  amount: string; // Human-readable amount
  paymentToken: string; // Token symbol (USDT, USDC, etc.)
  tokenAddress: string;
  invoiceId: string;
  resourceId?: string;
  network: NetworkType;
  signer: ethers.Signer;
  provider: ethers.Provider;
}

export interface GaslessPaymentResult {
  txHash: string;
  paymentId: string;
}

export interface PaymentError {
  code: string;
  message: string;
  details?: any;
}

/**
 * Hook for executing gasless payments
 */
export function useGaslessPayment() {
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<PaymentError | null>(null);
  const [requiresApproval, setRequiresApproval] = useState(false);

  /**
   * Check if Permit2 approval is needed for a token
   */
  const checkPermit2Approval = useCallback(
    async (
      tokenAddress: string,
      owner: string,
      provider: ethers.Provider
    ): Promise<boolean> => {
      try {
        const isApproved = await isPermit2Approved(tokenAddress, owner, provider);
        setRequiresApproval(!isApproved);
        return isApproved;
      } catch (err: any) {
        console.error('Failed to check Permit2 approval:', err);
        setError({
          code: 'APPROVAL_CHECK_FAILED',
          message: 'Failed to check token approval status',
          details: err,
        });
        return false;
      }
    },
    []
  );

  /**
   * Approve Permit2 for a token (one-time setup)
   */
  const approveToken = useCallback(
    async (tokenAddress: string, signer: ethers.Signer): Promise<string> => {
      setApproving(true);
      setError(null);

      try {
        console.log(`Approving Permit2 (${PERMIT2_ADDRESS}) for token ${tokenAddress}...`);
        const txHash = await approvePermit2(tokenAddress, signer);
        console.log(`✅ Permit2 approved! Tx hash: ${txHash}`);
        setRequiresApproval(false);
        return txHash;
      } catch (err: any) {
        const errorMessage = err.message || 'Failed to approve Permit2';
        console.error('❌ Permit2 approval failed:', err);
        setError({
          code: 'APPROVAL_FAILED',
          message: errorMessage,
          details: err,
        });
        throw new Error(errorMessage);
      } finally {
        setApproving(false);
      }
    },
    []
  );

  /**
   * Execute gasless payment via Permit2
   */
  const payGasless = useCallback(
    async (params: GaslessPaymentParams): Promise<GaslessPaymentResult> => {
      setLoading(true);
      setError(null);

      try {
        // Check if approval is needed first
        const owner = await params.signer.getAddress();
        const isApproved = await checkPermit2Approval(
          params.tokenAddress,
          owner,
          params.provider
        );

        if (!isApproved) {
          throw new Error(
            'Permit2 approval required. Please approve the token first.'
          );
        }

        // Check token balance
        const tokenContract = new ethers.Contract(
          params.tokenAddress,
          ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
          params.provider
        );
        const balance = await tokenContract.balanceOf(owner);
        const decimals = await tokenContract.decimals();
        const requiredAmount = ethers.parseUnits(params.amount, decimals);

        if (balance < requiredAmount) {
          throw new Error(
            `Insufficient balance. Required: ${params.amount} ${params.paymentToken}, Available: ${ethers.formatUnits(balance, decimals)} ${params.paymentToken}`
          );
        }

        console.log('🚀 Starting gasless payment...');
        console.log('Invoice ID:', params.invoiceId);
        console.log('Amount:', params.amount, params.paymentToken);
        console.log('Merchant:', params.merchantAddress);
        console.log('Token:', params.tokenAddress);

        // Execute gasless payment
        const result = await payInvoiceGasless({
          merchantAddress: params.merchantAddress,
          amount: params.amount,
          paymentToken: params.paymentToken,
          tokenAddress: params.tokenAddress,
          invoiceId: params.invoiceId,
          resourceId: params.resourceId,
          network: params.network,
          signer: params.signer,
          provider: params.provider,
        });

        console.log('✅ Gasless payment successful!');
        console.log('Tx Hash:', result.txHash);
        console.log('Payment ID:', result.paymentId);

        return result;
      } catch (err: any) {
        console.error('❌ Gasless payment failed:', err);

        // Categorize errors
        let errorCode = 'PAYMENT_FAILED';
        let errorMessage = err.message || 'Payment failed';

        if (err.message?.includes('Permit2 approval required')) {
          errorCode = 'PERMIT2_NOT_APPROVED';
        } else if (err.message?.includes('Insufficient balance')) {
          errorCode = 'INSUFFICIENT_BALANCE';
        } else if (err.message?.includes('expired')) {
          errorCode = 'SIGNATURE_EXPIRED';
        } else if (err.message?.includes('invalid')) {
          errorCode = 'INVALID_SIGNATURE';
        } else if (err.message?.includes('user rejected')) {
          errorCode = 'USER_REJECTED';
          errorMessage = 'Payment cancelled by user';
        }

        setError({
          code: errorCode,
          message: errorMessage,
          details: err,
        });

        throw err;
      } finally {
        setLoading(false);
      }
    },
    [checkPermit2Approval]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    payGasless,
    checkPermit2Approval,
    approveToken,
    loading,
    approving,
    error,
    requiresApproval,
    clearError,
  };
}
