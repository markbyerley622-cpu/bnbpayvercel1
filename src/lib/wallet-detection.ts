/**
 * Wallet Detection for Gasless Payments
 * Based on @bnbpay/sdk permit2.ts wallet lane detection
 */

import { ethers } from 'ethers';

export type Permit2WalletLane = 'bundle' | 'sign_only' | 'unsupported';

export interface WalletLaneDetection {
  lane: Permit2WalletLane;
  walletName?: string;
  reasons: string[];
  canUseGasless: boolean; // true if bundle or sign_only
  canUseBundleFlow: boolean; // true only if bundle
}

// Wallets that support eth_signTransaction (can sign raw transactions)
// Note: MetaMask excluded due to testnet compatibility issues
const RAW_TX_WALLETS = [
  'isRabby',
  'isFrame',
  'isTrust',
  'isOkxWallet',
  'isCoinbaseWallet',
  'isRainbow',
  'isZerion',
  'isTrustWallet',
];

/**
 * Detect wallet capability for Permit2 gasless payments
 * Returns 'bundle' for wallets that can sign raw tx, 'sign_only' for MetaMask, 'unsupported' otherwise
 */
export function detectPermit2WalletLane(): WalletLaneDetection {
  const win: any = typeof window !== 'undefined' ? window : {};
  const ethereum = win.ethereum;
  const binanceChain = win.BinanceChain;

  const reasons: string[] = [];
  let walletName: string | undefined;

  // Check if wallet is available
  if (!ethereum && !binanceChain) {
    reasons.push('no wallet detected');
    return {
      lane: 'unsupported',
      walletName,
      reasons,
      canUseGasless: false,
      canUseBundleFlow: false,
    };
  }

  // Check for raw tx support (wallets that can sign raw transactions)
  const hasRawTxFlag = ethereum
    ? RAW_TX_WALLETS.some((flag) => ethereum[flag])
    : false;
  const isMetaMask = Boolean(ethereum?.isMetaMask);
  const isBinance = Boolean(binanceChain || ethereum?.isBinanceWallet);

  if (hasRawTxFlag || isBinance) {
    walletName =
      (hasRawTxFlag && RAW_TX_WALLETS.find((flag) => ethereum?.[flag])) ||
      (isBinance ? 'Binance Web3 Wallet' : undefined);
    reasons.push('wallet supports eth_signTransaction for bundle lane');
    return {
      lane: 'bundle',
      walletName,
      reasons,
      canUseGasless: true,
      canUseBundleFlow: true,
    };
  }

  if (isMetaMask) {
    walletName = 'MetaMask';
    // MetaMask is not recommended due to testnet compatibility issues
    // Recommend users to use WalletConnect with Trust Wallet or similar
    reasons.push('MetaMask detected - recommend using WalletConnect with Trust Wallet for better testnet support');
    return {
      lane: 'sign_only',
      walletName,
      reasons,
      canUseGasless: true,
      canUseBundleFlow: false,
    };
  }

  reasons.push('unknown wallet; treat as unsupported for gasless Permit2');
  return {
    lane: 'unsupported',
    walletName,
    reasons,
    canUseGasless: false,
    canUseBundleFlow: false,
  };
}

/**
 * Build an ERC20 approval transaction for Permit2
 * Used for wallets in 'bundle' lane that can sign raw transactions
 */
export function buildPermit2ApprovalTx(params: {
  token: string;
  permit2Address: string;
  amount?: bigint;
  chainId: number;
  nonce?: number;
  gasLimit?: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
}): ethers.TransactionRequest {
  const token = ethers.getAddress(params.token);
  const spender = ethers.getAddress(params.permit2Address);
  const iface = new ethers.Interface(['function approve(address spender,uint256 amount)']);
  const data = iface.encodeFunctionData('approve', [spender, params.amount ?? ethers.MaxUint256]);

  const tx: ethers.TransactionRequest = {
    to: token,
    data,
    value: 0n,
    chainId: params.chainId,
    gasLimit: params.gasLimit ?? 60000n,
    maxFeePerGas: params.maxFeePerGas,
    maxPriorityFeePerGas: params.maxPriorityFeePerGas,
  };

  if (params.nonce !== undefined) {
    tx.nonce = params.nonce;
  }

  return tx;
}

/**
 * Get user-friendly description of wallet capability
 */
export function getWalletCapabilityMessage(detection: WalletLaneDetection): string {
  if (detection.lane === 'bundle') {
    return `${detection.walletName || 'Your wallet'} supports fully gasless payments via Permit2 bundle. No gas required!`;
  }

  if (detection.lane === 'sign_only') {
    return `${detection.walletName || 'Your wallet'} supports gasless payments with signature-only flow. Limited bundle support.`;
  }

  return `${detection.walletName || 'Your wallet'} does not support gasless payments. You'll need to pay gas fees.`;
}

/**
 * Check if current wallet supports gasless payments
 */
export function supportsGaslessPayments(): boolean {
  const detection = detectPermit2WalletLane();
  return detection.canUseGasless;
}

/**
 * Check if current wallet supports Permit2 bundle flow (requires raw tx signing)
 */
export function supportsBundleFlow(): boolean {
  const detection = detectPermit2WalletLane();
  return detection.canUseBundleFlow;
}
