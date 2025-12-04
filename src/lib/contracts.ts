/**
 * Real Contract Functions for USD1 Payments
 * Integrates with deployed BNBPay contracts on BSC Testnet
 */

import { ethers } from 'ethers';
import type { InvoiceData, SubscriptionData, ContractStub } from './types';
import {
  createPayment,
  createSession,
  getPaymentDetails,
  isPaymentSettled,
  generateResourceId,
  getProvider,
  approveToken,
  checkAllowance,
  getExplorerUrl,
  CONTRACT_ADDRESSES,
  TOKEN_ADDRESSES,
} from '../contracts';

/**
 * Real contract implementation
 */
export const contracts: ContractStub = {
  /**
   * Deploy USD1 payment contracts (not needed - already deployed)
   */
  async deployContract(): Promise<string> {
    console.log('[INFO] Contracts already deployed at:');
    console.log('PaymentRegistry:', CONTRACT_ADDRESSES.PAYMENT_REGISTRY);
    console.log('BNBPayRouter:', CONTRACT_ADDRESSES.BNBPAY_ROUTER);
    console.log('SessionStore:', CONTRACT_ADDRESSES.SESSION_STORE);
    return CONTRACT_ADDRESSES.PAYMENT_REGISTRY;
  },

  /**
   * Create invoice on-chain via BNBPayRouter
   */
  async createInvoiceOnChain(invoice: InvoiceData): Promise<string> {
    try {
      // Check if window.ethereum exists (MetaMask or other Web3 wallet)
      if (!window.ethereum) {
        throw new Error('No Web3 wallet detected. Please install MetaMask.');
      }

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Create signer from browser wallet
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const merchantAddress = await signer.getAddress();

      // Generate unique IDs
      const timestamp = Date.now();
      const invoiceId = 'inv_' + timestamp + '_' + Math.random().toString(36).slice(2, 9);
      const referenceData = invoice.referenceId || invoiceId;
      const resourceId = generateResourceId(`invoice/${invoiceId}`, merchantAddress);

      // For testnet, use USDT as default payment token
      const paymentToken = invoice.paymentToken || TOKEN_ADDRESSES.USDT;
      const amount = invoice.amount;

      // Check allowance and approve if needed
      const allowance = await checkAllowance(
        provider,
        paymentToken,
        merchantAddress,
        CONTRACT_ADDRESSES.BNBPAY_ROUTER
      );

      if (parseFloat(allowance) < parseFloat(amount)) {
        console.log('[INFO] Approving token spending...');
        const approveTx = await approveToken(
          signer,
          paymentToken,
          CONTRACT_ADDRESSES.BNBPAY_ROUTER,
          amount
        );
        console.log('[INFO] Approval tx:', getExplorerUrl(approveTx));
      }

      // Create payment through router
      console.log('[INFO] Creating payment on-chain...');
      const { txHash, paymentId } = await createPayment(signer, {
        merchant: merchantAddress,
        token: paymentToken,
        amount,
        feeAmount: '0', // Optional fee
        referenceData,
        resourceId,
      });

      console.log('[SUCCESS] Payment created!');
      console.log('Transaction:', getExplorerUrl(txHash));
      console.log('Payment ID:', paymentId);

      // Create x402 session for this invoice
      const expiresAt = invoice.dueDate
        ? new Date(invoice.dueDate).getTime() / 1000
        : Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days

      const { sessionId } = await createSession(signer, {
        resourceId,
        merchant: merchantAddress,
        amount,
        token: paymentToken,
        expiresAt,
      });

      console.log('[INFO] Session created:', sessionId);

      return JSON.stringify({
        invoiceId,
        paymentId,
        sessionId,
        txHash,
        status: 'pending',
        paymentLink: `bnbpay:${merchantAddress}?amount=${amount}&token=${paymentToken}&reference=${referenceData}`,
        explorerUrl: getExplorerUrl(txHash),
        merchantAddress,
        resourceId,
      });
    } catch (error: any) {
      console.error('[ERROR] Failed to create invoice:', error);
      throw new Error(`Failed to create invoice: ${error.message}`);
    }
  },

  /**
   * Create subscription on-chain
   * Note: SubscriptionManager contract not yet deployed
   */
  async createSubscriptionOnChain(_subscription: SubscriptionData): Promise<string> {
    console.warn('[WARN] SubscriptionManager not deployed yet. Using stub.');

    // Placeholder until SubscriptionManager is deployed
    await new Promise((resolve) => setTimeout(resolve, 800));

    const subscriptionId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const txHash = '0x' + Math.random().toString(16).slice(2, 66).padEnd(64, '0');

    return JSON.stringify({
      subscriptionId,
      txHash,
      status: 'pending_deployment',
      message: 'SubscriptionManager contract not yet deployed',
      paymentLink: `https://pay.testnet/x402/usd1/subscription/${subscriptionId}`,
    });
  },

  /**
   * Settle multi-token payment to USD1
   * This would use a DEX router to swap tokens to USD1
   */
  async settleToUSD1(paymentId: string): Promise<string> {
    try {
      const provider = getProvider();

      // Get payment details from events
      const paymentDetails = await getPaymentDetails(provider, paymentId);

      console.log('[INFO] Payment details:', paymentDetails);

      // Check if already settled
      const settled = await isPaymentSettled(provider, paymentId);

      if (!settled) {
        throw new Error('Payment not found or not settled yet');
      }

      // In production, this would trigger a DEX swap to USD1
      // For now, we just return the payment details
      return JSON.stringify({
        paymentId,
        settlementTxHash: paymentDetails.txHash,
        settlementToken: 'USD1',
        status: 'settled',
        originalToken: paymentDetails.token,
        originalAmount: ethers.formatUnits(paymentDetails.amount, 18),
        timestamp: paymentDetails.timestamp,
        explorerUrl: getExplorerUrl(paymentDetails.txHash),
      });
    } catch (error: any) {
      console.error('[ERROR] Failed to settle payment:', error);
      throw new Error(`Failed to settle payment: ${error.message}`);
    }
  },

  /**
   * Simulate multi-token swap to USD1
   */
  async simulateMultiTokenSwap(
    fromToken: string,
    toToken: string,
    amount: string
  ): Promise<string> {
    console.log('[INFO] Simulating swap:', { fromToken, toToken, amount });

    // In production, this would query a DEX (PancakeSwap, etc.)
    // For now, simulate with mock rate
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
      dexRouter: 'PancakeSwap V2',
      path: [fromToken, toToken],
    });
  },
};

/**
 * Generate MCP example calls (same as before)
 */
export function generateMCPExamples(data: InvoiceData | SubscriptionData) {
  if (data.type === 'invoice') {
    return [
      {
        method: 'x402.create_invoice',
        payload: data,
        description: 'Create a new USD1 invoice on-chain',
      },
      {
        method: 'x402.get_status',
        payload: { invoiceId: data.invoiceId || 'inv_xxx' },
        description: 'Check invoice payment status via PaymentRegistry events',
      },
      {
        method: 'x402.settle_to_usd1',
        payload: { invoiceId: data.invoiceId || 'inv_xxx' },
        description: 'Settle multi-token payment to USD1 via DEX',
      },
    ];
  } else {
    return [
      {
        method: 'x402.create_subscription',
        payload: data,
        description: 'Create a new USD1 subscription (requires SubscriptionManager)',
      },
      {
        method: 'x402.charge_subscription',
        payload: { subscriptionId: data.subscriptionId || 'sub_xxx' },
        description: 'Charge active subscription via Permit2',
      },
      {
        method: 'x402.cancel_subscription',
        payload: { subscriptionId: data.subscriptionId || 'sub_xxx' },
        description: 'Cancel subscription',
      },
    ];
  }
}

/**
 * Helper to connect wallet
 */
export async function connectWallet(): Promise<{ address: string; chainId: number }> {
  if (!window.ethereum) {
    throw new Error('No Web3 wallet detected. Please install MetaMask.');
  }

  // Request account access
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });

  // Get chain ID
  const chainId = await window.ethereum.request({ method: 'eth_chainId' });

  return {
    address: accounts[0],
    chainId: parseInt(chainId, 16),
  };
}

/**
 * Helper to switch to BSC Testnet
 */
export async function switchToBSCTestnet(): Promise<void> {
  if (!window.ethereum) {
    throw new Error('No Web3 wallet detected');
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x61' }], // 97 in hex
    });
  } catch (switchError: any) {
    // Chain not added, add it
    if (switchError.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0x61',
            chainName: 'BNB Smart Chain Testnet',
            nativeCurrency: {
              name: 'BNB',
              symbol: 'tBNB',
              decimals: 18,
            },
            rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
            blockExplorerUrls: ['https://testnet.bscscan.com'],
          },
        ],
      });
    } else {
      throw switchError;
    }
  }
}
