/**
 * BNBPay Contract Integration
 * Real blockchain interactions for PaymentRegistry, BNBPayRouter, and SessionStore
 */

import { ethers, type Provider, type Signer } from 'ethers';
import PaymentRegistryABI from './abis/PaymentRegistry.json';
import BNBPayRouterABI from './abis/BNBPayRouter.json';
import SessionStoreABI from './abis/SessionStore.json';

// Contract addresses from .env
export const CONTRACT_ADDRESSES = {
  PAYMENT_REGISTRY: import.meta.env.VITE_PAYMENT_REGISTRY as string,
  BNBPAY_ROUTER: import.meta.env.VITE_BNBPAY_ROUTER as string,
  SESSION_STORE: import.meta.env.VITE_SESSION_STORE as string,
  PERMIT2: import.meta.env.VITE_PERMIT2_ADDRESS as string,
  FEE_RECIPIENT: import.meta.env.VITE_FEE_RECIPIENT as string,
};

// Network configuration
export const NETWORK_CONFIG = {
  chainId: parseInt(import.meta.env.VITE_CHAIN_ID || '97'),
  networkName: import.meta.env.VITE_NETWORK_NAME || 'BNB Testnet',
  rpcUrl: import.meta.env.VITE_RPC_URL as string,
  blockExplorer: import.meta.env.VITE_BLOCK_EXPLORER as string,
};

// Token addresses
export const TOKEN_ADDRESSES = {
  BNB: import.meta.env.VITE_TOKEN_BNB || '0x0000000000000000000000000000000000000000',
  USDT: import.meta.env.VITE_TOKEN_USDT as string,
  BUSD: import.meta.env.VITE_TOKEN_BUSD as string,
};

/**
 * Get contract instances
 */
export function getContracts(signerOrProvider: Signer | Provider) {
  return {
    paymentRegistry: new ethers.Contract(
      CONTRACT_ADDRESSES.PAYMENT_REGISTRY,
      PaymentRegistryABI.abi,
      signerOrProvider
    ),
    bnbpayRouter: new ethers.Contract(
      CONTRACT_ADDRESSES.BNBPAY_ROUTER,
      BNBPayRouterABI.abi,
      signerOrProvider
    ),
    sessionStore: new ethers.Contract(
      CONTRACT_ADDRESSES.SESSION_STORE,
      SessionStoreABI.abi,
      signerOrProvider
    ),
  };
}

/**
 * Get read-only provider
 */
export function getProvider(): Provider {
  return new ethers.JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
}

/**
 * Payment Intent structure for BNBPayRouter
 */
export interface PaymentIntent {
  payer: string;
  merchant: string;
  token: string;
  amount: bigint;
  feeAmount: bigint;
  registry: string;
}

/**
 * Create a payment through BNBPayRouter
 * This routes through the router which then settles in PaymentRegistry
 */
export async function createPayment(
  signer: Signer,
  params: {
    merchant: string;
    token: string;
    amount: string; // in wei/token units
    feeAmount?: string; // in wei/token units
    referenceData: string; // Invoice ID or reference
    resourceId: string; // Deterministic resource ID
  }
): Promise<{ txHash: string; paymentId: string }> {
  const contracts = getContracts(signer);
  const payerAddress = await signer.getAddress();

  const intent: PaymentIntent = {
    payer: payerAddress,
    merchant: params.merchant,
    token: params.token,
    amount: ethers.parseUnits(params.amount, 18),
    feeAmount: params.feeAmount ? ethers.parseUnits(params.feeAmount, 18) : 0n,
    registry: CONTRACT_ADDRESSES.PAYMENT_REGISTRY,
  };

  // Generate scheme ID (can be customized based on payment type)
  const schemeId = ethers.id('x402.invoice.v1');

  // Call BNBPayRouter.pay() which routes to PaymentRegistry
  const tx = await contracts.bnbpayRouter.pay(
    intent,
    schemeId,
    params.referenceData,
    params.resourceId
  );

  const receipt = await tx.wait();

  // Extract PaymentSettledV2 event to get paymentId
  const paymentEvent = receipt.logs.find((log: any) => {
    try {
      const parsed = contracts.paymentRegistry.interface.parseLog(log);
      return parsed?.name === 'PaymentSettledV2';
    } catch {
      return false;
    }
  });

  let paymentId = '';
  if (paymentEvent) {
    const parsed = contracts.paymentRegistry.interface.parseLog(paymentEvent);
    paymentId = parsed?.args?.paymentId || '';
  }

  return {
    txHash: receipt.hash,
    paymentId,
  };
}

/**
 * Check if a payment has been settled
 */
export async function isPaymentSettled(
  provider: Provider,
  paymentId: string
): Promise<boolean> {
  const contracts = getContracts(provider);
  // PaymentRegistry has a mapping to track settled payments
  // This would need to be exposed via a view function
  // For now, we can check events
  const filter = contracts.paymentRegistry.filters.PaymentSettledV2(paymentId);
  const events = await contracts.paymentRegistry.queryFilter(filter);
  return events.length > 0;
}

/**
 * Get payment details from events
 */
export async function getPaymentDetails(
  provider: Provider,
  paymentId: string
): Promise<any> {
  const contracts = getContracts(provider);
  const filter = contracts.paymentRegistry.filters.PaymentSettledV2(paymentId);
  const events = await contracts.paymentRegistry.queryFilter(filter);

  if (events.length === 0) {
    throw new Error('Payment not found');
  }

  const event = events[0] as ethers.EventLog;
  return {
    paymentId: event.args[0],
    payer: event.args[1],
    merchant: event.args[2],
    token: event.args[3],
    amount: event.args[4].toString(),
    feeAmount: event.args[5].toString(),
    schemeId: event.args[6],
    referenceData: event.args[7],
    resourceId: event.args[8],
    timestamp: event.args[9].toString(),
    blockNumber: event.blockNumber,
    txHash: event.transactionHash,
  };
}

/**
 * Create a session for x402 flows
 */
export async function createSession(
  signer: Signer,
  params: {
    resourceId: string;
    merchant: string;
    amount: string;
    token: string;
    expiresAt: number;
  }
): Promise<{ sessionId: string; txHash: string }> {
  const contracts = getContracts(signer);

  const tx = await contracts.sessionStore.createSession(
    params.resourceId,
    params.merchant,
    ethers.parseUnits(params.amount, 18),
    params.token,
    params.expiresAt
  );

  const receipt = await tx.wait();

  // Extract session ID from event
  const sessionEvent = receipt.logs.find((log: any) => {
    try {
      const parsed = contracts.sessionStore.interface.parseLog(log);
      return parsed?.name === 'SessionCreated';
    } catch {
      return false;
    }
  });

  let sessionId = '';
  if (sessionEvent) {
    const parsed = contracts.sessionStore.interface.parseLog(sessionEvent);
    sessionId = parsed?.args?.sessionId || '';
  }

  return {
    sessionId,
    txHash: receipt.hash,
  };
}

/**
 * Generate a deterministic payment ID
 */
export function generatePaymentId(
  merchant: string,
  referenceId: string,
  timestamp: number
): string {
  return ethers.id(`${merchant}-${referenceId}-${timestamp}`);
}

/**
 * Generate a deterministic resource ID for x402
 */
export function generateResourceId(resourcePath: string, merchant: string): string {
  return ethers.id(`x402://${merchant}/${resourcePath}`);
}

/**
 * Approve token spending for payments
 */
export async function approveToken(
  signer: Signer,
  tokenAddress: string,
  spenderAddress: string,
  amount: string
): Promise<string> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function approve(address spender, uint256 amount) returns (bool)'],
    signer
  );

  const tx = await tokenContract.approve(
    spenderAddress,
    ethers.parseUnits(amount, 18)
  );
  const receipt = await tx.wait();
  return receipt.hash;
}

/**
 * Check token allowance
 */
export async function checkAllowance(
  provider: Provider,
  tokenAddress: string,
  owner: string,
  spender: string
): Promise<string> {
  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function allowance(address owner, address spender) view returns (uint256)'],
    provider
  );

  const allowance = await tokenContract.allowance(owner, spender);
  return ethers.formatUnits(allowance, 18);
}

/**
 * Get token balance
 */
export async function getTokenBalance(
  provider: Provider,
  tokenAddress: string,
  account: string
): Promise<string> {
  if (tokenAddress === TOKEN_ADDRESSES.BNB) {
    const balance = await provider.getBalance(account);
    return ethers.formatEther(balance);
  }

  const tokenContract = new ethers.Contract(
    tokenAddress,
    ['function balanceOf(address account) view returns (uint256)'],
    provider
  );

  const balance = await tokenContract.balanceOf(account);
  return ethers.formatUnits(balance, 18);
}

/**
 * Get transaction explorer URL
 */
export function getExplorerUrl(txHash: string): string {
  return `${NETWORK_CONFIG.blockExplorer}/tx/${txHash}`;
}

/**
 * Get address explorer URL
 */
export function getAddressExplorerUrl(address: string): string {
  return `${NETWORK_CONFIG.blockExplorer}/address/${address}`;
}
