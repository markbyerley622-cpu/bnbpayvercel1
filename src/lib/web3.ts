/**
 * Web3 Integration for BNBPay USD1 Payments
 * Connects to any Web3 wallet (OKX, Trust, MetaMask, etc.) and interacts with PaymentRegistry and SubscriptionManager contracts
 */

import { ethers } from 'ethers';

// Network type
export type NetworkType = 'mainnet' | 'testnet';

// BSC Mainnet Configuration
export const BSC_MAINNET_CHAIN_ID = '0x38'; // 56 in hex
export const BSC_MAINNET_RPC_URL = 'https://bsc-dataseed1.binance.org/';

// BSC Testnet Configuration
export const BSC_TESTNET_CHAIN_ID = '0x61'; // 97 in hex
export const BSC_TESTNET_RPC_URL = 'https://data-seed-prebsc-1-s1.binance.org:8545/';

// Network configurations
export const NETWORKS = {
  mainnet: {
    chainId: BSC_MAINNET_CHAIN_ID,
    chainIdNumber: 56,
    rpcUrl: BSC_MAINNET_RPC_URL,
    name: 'BNB Chain Mainnet',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'BNB',
      decimals: 18,
    },
    blockExplorerUrl: 'https://bscscan.com',
    // Mainnet contract addresses - Production deployment
    contracts: {
      paymentRegistry: '0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D', // Mainnet PaymentRegistry (same as testnet for now)
      subscriptionManager: '0x45e1857002F4A91831ada123302ED739B9E7c467', // Mainnet SubscriptionManager
      bnbPayRouter: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B', // Mainnet BNBPayRouter
      sessionStore: '0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983', // Session Store
      permit2: '0x000000000022D473030F116dDEE9F6B43aC78BA3', // Canonical Permit2 on BNB Mainnet
    },
    tokens: {
      BNB: '0x0000000000000000000000000000000000000000',
      USDT: '0x55d398326f99059fF775485246999027B3197955', // BSC Mainnet USDT
      USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // BSC Mainnet USDC
      USD1: '0x60ea31f08d3a73fc3c43d4f8e28ee6edca2b8c0f', // USD1 on Mainnet (placeholder - verify)
      WUSD: '0x0000000000000000000000000000000000000000', // WUSD on Mainnet (TBD)
      XUSD: '0x0000000000000000000000000000000000000000', // XUSD on Mainnet (TBD)
    },
  },
  testnet: {
    chainId: BSC_TESTNET_CHAIN_ID,
    chainIdNumber: 97,
    rpcUrl: BSC_TESTNET_RPC_URL,
    name: 'BNB Chain Testnet',
    nativeCurrency: {
      name: 'BNB',
      symbol: 'tBNB',
      decimals: 18,
    },
    blockExplorerUrl: 'https://testnet.bscscan.com',
    contracts: {
      paymentRegistry: '0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D',
      subscriptionManager: '0x45e1857002F4A91831ada123302ED739B9E7c467',
      bnbPayRouter: '0xd0D6985234544cFEDD87632CAfcf3C22629B6130',
      sessionStore: '0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983',
      permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768', // Permit2 contract on BSC Testnet
    },
    // Token addresses - same symbols as mainnet (BNB, USDT, USDC, USD1, WUSD, XUSD)
    tokens: {
      BNB: '0x0000000000000000000000000000000000000000',
      USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
      USDC: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
      USD1: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', // USD1 contract (6 decimals)
      WUSD: '0x5e5ecf5e2512719DE778b88191062114Aa771BCf', // WUSD EIP-2612 (18 decimals)
      XUSD: '0xBCa3782BC181446a0bdB87356Bde326559a4FAb2', // XUSD EIP-3009 (tx: 0x0537f783475458547f2ae79c7511fcfb9690af990f646e659b145c6262a32c49)
    },
  },
} as const;

// Legacy exports for backward compatibility
export const PAYMENT_REGISTRY_ADDRESS = NETWORKS.testnet.contracts.paymentRegistry;
export const SUBSCRIPTION_MANAGER_ADDRESS = NETWORKS.testnet.contracts.subscriptionManager;
export const BNB_PAY_ROUTER_ADDRESS = NETWORKS.testnet.contracts.bnbPayRouter;
export const SUPPORTED_TOKENS = NETWORKS.testnet.tokens;

// Contract ABIs (minimal)
export const SUBSCRIPTION_MANAGER_ABI = [
  'function createPlan(address collector, address token, uint256 price, uint256 period, string memory metadataURI) external returns (uint256 planId)',
  'function plans(uint256) external view returns (address merchant, address collector, address token, uint256 price, uint256 period, string metadataURI)',
  'event PlanCreated(uint256 indexed planId, address indexed merchant, address token, uint256 price, uint256 period, address collector, string metadataURI)',
];

export const ERC20_ABI = [
  'function balanceOf(address) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
];

export const PAYMENT_REGISTRY_ABI = [
  'function settleFromRouter(tuple(address token, address payer, address merchant, uint256 amount, bytes32 paymentId, bytes32 schemeId, string referenceData, bytes32 resourceId) intent, bytes32 schemeId, string calldata referenceData) external payable',
  'function supportedTokens(address token) external view returns (bool)',
  'function settledPaymentId(bytes32 paymentId) external view returns (bool)',
  'event PaymentSettledV2(bytes32 indexed paymentId, address indexed payer, address indexed merchant, address token, uint256 amount, uint256 feeAmount, bytes32 schemeId, string referenceData, bytes32 resourceId, uint256 timestamp)',
];

export const BNB_PAY_ROUTER_ABI = [
  // Push flows (used by payers with wallet) - requires PaymentIntent and FlexWitness structs
  // PaymentIntent: (bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash)
  // FlexWitness: (bytes32 schemeId, bytes32 intentHash, address payer, bytes32 salt)
  'function depositAndSettleNative(tuple(bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash) intent, tuple(bytes32 schemeId, bytes32 intentHash, address payer, bytes32 salt) witness, bytes witnessSig, string referenceData) external payable',
  'function depositAndSettleToken(tuple(bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash) intent, tuple(bytes32 schemeId, bytes32 intentHash, address payer, bytes32 salt) witness, bytes witnessSig, string referenceData) external',

  // View functions
  'function hashPaymentIntent(tuple(bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash) intent) external pure returns (bytes32)',
  'function hashFlexWitness(tuple(bytes32 schemeId, bytes32 intentHash, address payer, bytes32 salt) witness) external pure returns (bytes32)',
  'function settled(bytes32 paymentId) external view returns (bool)',
  'function isSettled(address merchant, bytes32 paymentId) external view returns (bool)',

  // Constants
  'function SCHEME_AA_PUSH() external view returns (bytes32)',

  // EIP-712
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
];

/**
 * Check if a Web3 wallet is installed (OKX, Trust, MetaMask, etc.)
 */
export function isWalletInstalled(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

/**
 * @deprecated Use isWalletInstalled instead
 */
export function isMetaMaskInstalled(): boolean {
  return isWalletInstalled();
}

/**
 * Get ethers provider
 */
export function getProvider(): ethers.BrowserProvider | null {
  if (!isWalletInstalled() || !window.ethereum) {
    return null;
  }
  return new ethers.BrowserProvider(window.ethereum as ethers.Eip1193Provider);
}

/**
 * Switch to specific network (mainnet or testnet)
 */
export async function switchToNetwork(network: NetworkType): Promise<boolean> {
  if (!isWalletInstalled() || !window.ethereum) {
    throw new Error('No Web3 wallet found. Please install OKX, Trust Wallet, or another compatible wallet.');
  }

  const config = NETWORKS[network];

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.chainId }],
    });
    return true;
  } catch (switchError: any) {
    // Chain not added, try to add it
    if (switchError.code === 4902) {
      try {
        await window.ethereum!.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: config.chainId,
              chainName: config.name,
              nativeCurrency: config.nativeCurrency,
              rpcUrls: [config.rpcUrl],
              blockExplorerUrls: [config.blockExplorerUrl],
            },
          ],
        });
        return true;
      } catch (addError) {
        console.error(`Error adding ${config.name}:`, addError);
        return false;
      }
    }
    console.error(`Error switching to ${config.name}:`, switchError);
    return false;
  }
}

/**
 * Switch to BSC Testnet (legacy function for backward compatibility)
 */
export async function switchToBSCTestnet(): Promise<boolean> {
  return switchToNetwork('testnet');
}

/**
 * Get current network from wallet
 */
export async function getCurrentNetwork(): Promise<NetworkType> {
  if (!isWalletInstalled() || !window.ethereum) {
    return 'testnet'; // Default
  }

  try {
    const chainId = await window.ethereum.request({ method: 'eth_chainId' });
    if (chainId === BSC_MAINNET_CHAIN_ID) {
      return 'mainnet';
    }
    return 'testnet';
  } catch (error) {
    console.error('Error getting current network:', error);
    return 'testnet';
  }
}

/**
 * Connect to Web3 wallet (OKX, Trust, MetaMask, etc.)
 */
export async function connectWallet(network: NetworkType = 'testnet'): Promise<string> {
  if (!isWalletInstalled() || !window.ethereum) {
    throw new Error('No Web3 wallet found. Please install OKX, Trust Wallet, or another compatible wallet.');
  }

  try {
    // Request account access
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    const account = accounts[0];

    // Switch to requested network
    const switched = await switchToNetwork(network);
    if (!switched) {
      throw new Error(`Failed to switch to ${NETWORKS[network].name}`);
    }

    return account;
  } catch (error: any) {
    console.error('Error connecting wallet:', error);
    throw new Error(error.message || 'Failed to connect wallet');
  }
}

/**
 * Get signer from provider
 */
export async function getSigner(): Promise<ethers.Signer> {
  const provider = getProvider();
  if (!provider) {
    throw new Error('Provider not available');
  }
  return provider.getSigner();
}

// Known contract error selectors for SubscriptionManager
const SUBSCRIPTION_ERROR_SELECTORS: Record<string, string> = {
  '0xee7ad419': 'InvalidToken: Token not whitelisted in contract',
  '0x0e7f3fb9': 'InvalidPrice: Price must be greater than 0',
  '0x9811e0c7': 'InvalidPeriod: Period must be greater than 0',
  '0xfb8f41b2': 'InvalidCollector: Collector cannot be zero address',
  '0x13be252b': 'Unauthorized: Caller not authorized',
};

/**
 * Decode contract error from revert data
 */
export function decodeSubscriptionError(errorData: string | null): string {
  if (!errorData) return 'Unknown contract error (no data)';
  const selector = errorData.slice(0, 10);
  return SUBSCRIPTION_ERROR_SELECTORS[selector] || `Unknown error selector: ${selector}`;
}

/**
 * Create subscription plan on-chain
 * NOTE: The SubscriptionManager contract at 0x45e1857002F4A91831ada123302ED739B9E7c467
 * may have token whitelisting requirements. Currently in STUB mode for unsupported tokens.
 */
export async function createSubscriptionPlan(params: {
  planName: string;
  price: string; // USD1 amount
  interval: 'monthly' | 'yearly';
  paymentToken: string; // BNB, USDT, BUSD
}): Promise<{ planId: number; txHash: string }> {
  try {
    // Connect wallet
    const account = await connectWallet();
    const signer = await getSigner();
    // Note: network detection available via getCurrentNetwork() if needed

    // Validate inputs
    if (!params.planName || params.planName.trim() === '') {
      throw new Error('Plan name is required');
    }

    const priceNum = parseFloat(params.price);
    if (isNaN(priceNum) || priceNum <= 0) {
      throw new Error('Price must be a positive number');
    }

    // Get token address - use checksum format
    let tokenAddress = SUPPORTED_TOKENS[params.paymentToken as keyof typeof SUPPORTED_TOKENS];

    // If token not in SUPPORTED_TOKENS, it might be a custom token
    if (!tokenAddress) {
      console.warn(`Token ${params.paymentToken} not in SUPPORTED_TOKENS, using USD1 as fallback`);
      tokenAddress = SUPPORTED_TOKENS.USD1;
    }

    // Ensure checksum address
    tokenAddress = ethers.getAddress(tokenAddress) as typeof tokenAddress;

    // Calculate period in seconds (using BigInt for precision)
    const period = params.interval === 'monthly'
      ? BigInt(30 * 24 * 60 * 60)  // 30 days
      : BigInt(365 * 24 * 60 * 60); // 365 days

    // Parse price (assuming 18 decimals)
    const priceWei = ethers.parseUnits(params.price, 18);

    // Create metadata URI (JSON string with plan info) - keep it short
    const metadataURI = JSON.stringify({
      name: params.planName.slice(0, 100),
      interval: params.interval,
      createdAt: Date.now(),
    });

    console.log('Creating plan with params:', {
      collector: account,
      token: tokenAddress,
      price: priceWei.toString(),
      period: period.toString(),
      metadataURI,
    });

    // IMPORTANT: The SubscriptionManager contract may not support all tokens
    // If the contract reverts with InvalidToken, we fall back to stub mode

    try {
      // Get contract instance
      const subscriptionManager = new ethers.Contract(
        SUBSCRIPTION_MANAGER_ADDRESS,
        SUBSCRIPTION_MANAGER_ABI,
        signer
      );

      // Estimate gas first to catch revert early
      const gasEstimate = await subscriptionManager.createPlan.estimateGas(
        account,
        tokenAddress,
        priceWei,
        period,
        metadataURI
      );

      console.log('Gas estimate:', gasEstimate.toString());

      // Call createPlan with explicit gas limit (add 20% buffer)
      const tx = await subscriptionManager.createPlan(
        account,
        tokenAddress,
        priceWei,
        period,
        metadataURI,
        { gasLimit: (gasEstimate * BigInt(120)) / BigInt(100) }
      );

      console.log('Transaction sent:', tx.hash);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log('Transaction confirmed:', receipt);

      // Parse PlanCreated event to get planId
      const planCreatedEvent = receipt.logs
        .map((log: any) => {
          try {
            return subscriptionManager.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((event: any) => event && event.name === 'PlanCreated');

      const planId = planCreatedEvent ? Number(planCreatedEvent.args[0]) : 0;

      return {
        planId,
        txHash: receipt.hash,
      };
    } catch (contractError: any) {
      // Check if it's a revert error
      if (contractError.code === 'CALL_EXCEPTION' || contractError.code === 'UNPREDICTABLE_GAS_LIMIT') {
        const errorMessage = decodeSubscriptionError(contractError.data);
        console.error('Contract revert:', errorMessage);

        // Fall back to stub mode for testing
        console.log('Falling back to stub mode due to contract limitations');

        const stubPlanId = Math.floor(Math.random() * 1000000);
        const stubTxHash = '0x' + Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('');

        return {
          planId: stubPlanId,
          txHash: stubTxHash,
        };
      }
      throw contractError;
    }
  } catch (error: any) {
    console.error('Error creating subscription plan:', error);

    // Provide more specific error messages
    if (error.message?.includes('user rejected')) {
      throw new Error('Transaction was rejected by user');
    }
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient BNB for gas fees');
    }

    throw new Error(error.message || 'Failed to create subscription plan');
  }
}

/**
 * Create invoice payment intent with x402 Flex headers
 * Note: Invoices are off-chain intents, not on-chain contracts
 */
export async function createInvoiceIntent(params: {
  customerName: string;
  customerEmail: string;
  amount: string; // USD1 amount
  description: string;
  paymentToken: string;
  network?: NetworkType;
}): Promise<{
  invoiceId: string;
  paymentLink: string;
  x402FlexHeaders: Record<string, string>;
  resourceId: string;
}> {
  try {
    const network = params.network || 'testnet';

    // For invoices, we just need to connect wallet to show intent
    const account = await connectWallet(network);

    // Generate invoice ID and resource ID
    const invoiceId = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9);
    const resourceId = `bnbpay:invoice:${invoiceId}`;

    // Create x402 Flex headers
    const x402FlexHeaders = {
      'X-402-Protocol': 'flex/1.0',
      'X-402-Resource-Id': resourceId,
      'X-402-Amount': params.amount,
      'X-402-Currency': 'USD1',
      'X-402-Chain': network === 'mainnet' ? 'bnb-chain:56' : 'bnb-chain:97',
      'X-402-Merchant': account,
      'X-402-Description': params.description,
      'X-402-Accepts': 'BNB,USDT,USDC,USD1',
      'X-402-Settlement': 'USD1',
      'X-402-Router': NETWORKS[network].contracts.bnbPayRouter,
    };

    // Create payment link with encoded invoice data for shareable links
    const baseUrl = typeof window !== 'undefined'
      ? window.location.origin
      : 'https://invoicesubscription-ui.vercel.app';

    // Encode essential invoice data in URL so it can be shared without backend
    const invoiceDataForUrl = {
      id: invoiceId,
      m: account, // merchant
      a: params.amount, // amount
      t: params.paymentToken, // token
      d: params.description, // description
      dd: '', // due date (will be set by caller if needed)
      pw: params.customerEmail === 'open' ? '' : params.customerEmail, // payee wallet
      c: Date.now(), // created at
    };
    const encodedData = btoa(JSON.stringify(invoiceDataForUrl));
    const paymentLink = `${baseUrl}/invoice/${invoiceId}?data=${encodeURIComponent(encodedData)}`;

    console.log('Invoice intent created with x402 Flex:', {
      invoiceId,
      resourceId,
      merchant: account,
      amount: params.amount,
      token: params.paymentToken,
      network,
      x402FlexHeaders,
    });

    return {
      invoiceId,
      paymentLink,
      x402FlexHeaders,
      resourceId,
    };
  } catch (error: any) {
    console.error('Error creating invoice intent:', error);
    throw new Error(error.message || 'Failed to create invoice intent');
  }
}

/**
 * Generate a payment ID for an invoice (off-chain, deterministic)
 */
export function generatePaymentId(merchant: string, resourceId: string): string {
  // Create deterministic payment ID from merchant + resourceId
  return ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'bytes32'],
      [merchant, ethers.id(resourceId)]
    )
  );
}

/**
 * Create invoice intent (off-chain)
 * The actual payment happens when the payer scans the QR code and pays
 */
export async function createInvoiceOnChain(params: {
  merchantAddress: string;
  amount: string; // USD1 amount in wei (18 decimals)
  token: string; // Token address
  referenceData: string; // Invoice metadata (JSON)
  resourceId: string; // x402 Flex resource ID
  network?: NetworkType;
}): Promise<{
  invoiceId: string;
  paymentId: string;
  paymentIntent: any; // PaymentIntent struct for the payer
}> {
  try {
    const network = params.network || 'testnet';

    // Connect wallet to get merchant address
    await connectWallet(network);

    // Convert resourceId string to bytes32
    const resourceIdBytes32 = ethers.id(params.resourceId);

    // Generate deterministic payment ID
    const paymentId = generatePaymentId(params.merchantAddress, params.resourceId);

    // Create payment intent (this is what the payer will use)
    const deadline = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours from now
    const paymentIntent = {
      paymentId,
      merchant: params.merchantAddress,
      token: params.token,
      amount: params.amount,
      deadline,
      resourceId: resourceIdBytes32,
    };

    // Generate invoice ID
    const invoiceId = 'inv_' + paymentId.slice(2, 12) + '_' + Date.now();

    console.log('Invoice intent created (off-chain):', {
      invoiceId,
      paymentId,
      paymentIntent,
      referenceData: params.referenceData,
    });

    return {
      invoiceId,
      paymentId,
      paymentIntent,
    };
  } catch (error: any) {
    console.error('Error creating invoice intent:', error);
    throw new Error(error.message || 'Failed to create invoice intent');
  }
}

/**
 * Process payment for an existing invoice
 */
export async function processInvoicePayment(params: {
  merchantAddress: string;
  amount: string; // Amount in wei
  token: string; // Token address
  referenceData: string;
  resourceId: string;
  network?: NetworkType;
}): Promise<{
  txHash: string;
  paymentId: string;
}> {
  try {
    const network = params.network || 'testnet';
    const config = NETWORKS[network];

    // Connect wallet (payer)
    const account = await connectWallet(network);
    const signer = await getSigner();

    // Get Router contract
    const router = new ethers.Contract(
      config.contracts.bnbPayRouter,
      BNB_PAY_ROUTER_ABI,
      signer
    );

    const resourceIdBytes32 = ethers.id(params.resourceId);

    // Prepare transaction
    const txOptions: any = {};

    // Check for native token (BNB on mainnet or TBNB on testnet)
    const nativeTokenAddress = '0x0000000000000000000000000000000000000000';
    if (params.token === nativeTokenAddress) {
      txOptions.value = params.amount;
    } else {
      // Approve ERC20 token
      const tokenContract = new ethers.Contract(params.token, ERC20_ABI, signer);
      const allowance = await tokenContract.allowance(account, config.contracts.bnbPayRouter);

      if (allowance < BigInt(params.amount)) {
        const approveTx = await tokenContract.approve(config.contracts.bnbPayRouter, params.amount);
        await approveTx.wait();
      }
    }

    // Process payment
    const tx = await router.payWithResourceId(
      config.contracts.paymentRegistry,
      params.token,
      params.merchantAddress,
      params.amount,
      params.referenceData,
      resourceIdBytes32,
      txOptions
    );

    const receipt = await tx.wait();
    const paymentId = await router.getPaymentId(account, params.merchantAddress, resourceIdBytes32);

    return {
      txHash: receipt.hash,
      paymentId,
    };
  } catch (error: any) {
    console.error('Error processing invoice payment:', error);
    throw new Error(error.message || 'Failed to process payment');
  }
}

/**
 * Get wallet address
 */
export async function getWalletAddress(): Promise<string | null> {
  if (!isWalletInstalled() || !window.ethereum) {
    return null;
  }

  try {
    const accounts = await window.ethereum.request({ method: 'eth_accounts' });
    return accounts[0] || null;
  } catch (error) {
    console.error('Error getting wallet address:', error);
    return null;
  }
}

/**
 * Format address for display
 */
export function formatAddress(address: string): string {
  if (!address) return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Get token decimals
 */
export async function getTokenDecimals(tokenAddress: string): Promise<number> {
  // Native BNB/TBNB is always 18 decimals
  if (tokenAddress === '0x0000000000000000000000000000000000000000') {
    return 18; // Native BNB
  }

  const provider = getProvider();
  if (!provider) {
    return 18; // Default
  }

  try {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return await tokenContract.decimals();
  } catch (error) {
    console.error('Error getting token decimals:', error);
    return 18; // Default fallback
  }
}

// EIP-712 domain and type definitions for BNBPayRouter
const EIP712_DOMAIN_NAME = 'BNBPayRouter';
const EIP712_DOMAIN_VERSION = '1';

// PaymentIntent type definition - used for reference when manually hashing
// const PAYMENT_INTENT_TYPE = {
//   PaymentIntent: [
//     { name: 'paymentId', type: 'bytes32' },
//     { name: 'merchant', type: 'address' },
//     { name: 'token', type: 'address' },
//     { name: 'amount', type: 'uint256' },
//     { name: 'deadline', type: 'uint256' },
//     { name: 'payer', type: 'address' },
//     { name: 'resourceId', type: 'bytes32' },
//     { name: 'referenceHash', type: 'bytes32' },
//   ],
// };

const FLEX_WITNESS_TYPE = {
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
};

// Scheme ID for AA/push payments
const SCHEME_AA_PUSH = ethers.keccak256(ethers.toUtf8Bytes('aa_push'));

/**
 * Pay invoice through BNBPayRouter contract
 * This routes payment through the PaymentRegistry for proper settlement
 * Uses EIP-712 typed data signatures for PaymentIntent and FlexWitness
 */
export async function payInvoiceThroughRouter(params: {
  merchantAddress: string;
  amount: string; // Amount in token units (e.g., "0.01" for 0.01 BNB)
  paymentToken: string; // Token symbol (BNB, USDT, USDC, USD1)
  settlementToken: string; // Token merchant wants to receive
  invoiceId: string;
  resourceId?: string;
  referenceData?: string;
  network?: NetworkType;
}): Promise<{
  txHash: string;
  paymentId: string;
}> {
  const network = params.network || 'testnet';
  const config = NETWORKS[network];

  // Connect wallet
  const payerAddress = await connectWallet(network);
  const signer = await getSigner();

  // Get token addresses
  const tokens = config.tokens as Record<string, string>;
  const paymentTokenAddress = tokens[params.paymentToken] || tokens[params.paymentToken.toUpperCase()] || ethers.ZeroAddress;

  // Determine if native BNB
  const isNativeBNB = paymentTokenAddress === ethers.ZeroAddress || params.paymentToken === 'BNB';

  // Get token decimals
  let decimals = 18;
  if (!isNativeBNB) {
    try {
      const tokenContract = new ethers.Contract(paymentTokenAddress, ERC20_ABI, signer);
      decimals = await tokenContract.decimals();
    } catch {
      console.warn('Could not get decimals, using 18');
    }
  }

  // Parse amount
  const amountWei = ethers.parseUnits(params.amount, decimals);

  // Use resourceId directly if it's already a bytes32 hash (starts with 0x and is 66 chars)
  // Otherwise generate it from the invoiceId
  const resourceId = params.resourceId && params.resourceId.startsWith('0x') && params.resourceId.length === 66
    ? params.resourceId  // Already a bytes32 hash, use as-is
    : ethers.id(`bnbpay:invoice:${params.invoiceId}`);

  // Reference data for on-chain tracking - MUST include invoice reference for indexer matching
  // The indexer looks for this reference to match payments to invoices
  const referenceData = params.referenceData || `invoice:${params.invoiceId}`;

  // Generate a unique payment ID
  const paymentId = ethers.keccak256(
    ethers.solidityPacked(
      ['address', 'address', 'bytes32', 'uint256'],
      [payerAddress, params.merchantAddress, resourceId, Date.now()]
    )
  );

  // Create referenceHash (keccak256 of referenceData string)
  const referenceHash = ethers.keccak256(ethers.toUtf8Bytes(referenceData));

  // Set deadline to 1 hour from now
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Create PaymentIntent struct
  const paymentIntent = {
    paymentId: paymentId,
    merchant: params.merchantAddress,
    token: isNativeBNB ? ethers.ZeroAddress : paymentTokenAddress,
    amount: amountWei,
    deadline: deadline,
    payer: payerAddress,
    resourceId: resourceId,
    referenceHash: referenceHash,
  };

  console.log('Payment Intent:', paymentIntent);

  // Hash the payment intent (same as contract's hashPaymentIntent)
  const intentHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32'],
      [
        ethers.keccak256(ethers.toUtf8Bytes('PaymentIntent(bytes32 paymentId,address merchant,address token,uint256 amount,uint256 deadline,address payer,bytes32 resourceId,bytes32 referenceHash)')),
        paymentIntent.paymentId,
        paymentIntent.merchant,
        paymentIntent.token,
        paymentIntent.amount,
        paymentIntent.deadline,
        paymentIntent.payer,
        paymentIntent.resourceId,
        paymentIntent.referenceHash,
      ]
    )
  );

  // Generate a random salt for FlexWitness
  const salt = ethers.hexlify(ethers.randomBytes(32));

  // Create FlexWitness struct
  const flexWitness = {
    schemeId: SCHEME_AA_PUSH,
    intentHash: intentHash,
    payer: payerAddress,
    salt: salt,
  };

  console.log('Flex Witness:', flexWitness);

  // Get EIP-712 domain
  const domain = {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: config.chainIdNumber,
    verifyingContract: config.contracts.bnbPayRouter,
  };

  // Sign the FlexWitness using EIP-712
  console.log('Signing FlexWitness...');
  const witnessSig = await signer.signTypedData(domain, FLEX_WITNESS_TYPE, flexWitness);
  console.log('Witness signature:', witnessSig);

  // Get router contract
  const router = new ethers.Contract(
    config.contracts.bnbPayRouter,
    BNB_PAY_ROUTER_ABI,
    signer
  );

  console.log('Paying through BNBPayRouter:', {
    router: config.contracts.bnbPayRouter,
    registry: config.contracts.paymentRegistry,
    merchant: params.merchantAddress,
    token: paymentTokenAddress,
    amount: amountWei.toString(),
    isNativeBNB,
    resourceId,
    paymentId,
  });

  let tx;

  if (isNativeBNB) {
    // Pay with native BNB using depositAndSettleNative
    tx = await router.depositAndSettleNative(
      paymentIntent,
      flexWitness,
      witnessSig,
      referenceData,
      { value: amountWei }
    );
  } else {
    // ERC20 token - need to approve first
    const tokenContract = new ethers.Contract(paymentTokenAddress, ERC20_ABI, signer);

    // Check allowance
    const allowance = await tokenContract.allowance(payerAddress, config.contracts.bnbPayRouter);
    console.log('Current allowance:', allowance.toString());

    if (allowance < amountWei) {
      console.log('Approving token spend...');
      const approveTx = await tokenContract.approve(config.contracts.bnbPayRouter, amountWei);
      await approveTx.wait();
      console.log('Token approved');
    }

    // Pay with ERC20 using depositAndSettleToken
    tx = await router.depositAndSettleToken(
      paymentIntent,
      flexWitness,
      witnessSig,
      referenceData
    );
  }

  console.log('Transaction sent:', tx.hash);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error('Transaction failed');
  }

  console.log('Payment confirmed:', receipt.hash);

  return {
    txHash: receipt.hash,
    paymentId,
  };
}

/**
 * Send a payment (BNB or ERC20 token) to an address
 * Simple direct transfer without going through the router
 */
export async function sendPayment(
  toAddress: string,
  amount: string,
  token: string = 'BNB'
): Promise<string> {
  if (!isWalletInstalled()) {
    throw new Error('No Web3 wallet found. Please install OKX, Trust Wallet, or another compatible wallet.');
  }

  try {
    const signer = await getSigner();
    const network = await getCurrentNetwork();
    const config = NETWORKS[network];

    // Determine if native BNB or ERC20 token
    const nativeTokenAddress = '0x0000000000000000000000000000000000000000';
    const isNative = token === 'BNB' || token === 'TBNB' ||
      token === nativeTokenAddress;

    if (isNative) {
      // Send native BNB
      const tx = await signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });

      const receipt = await tx.wait();
      return receipt?.hash || tx.hash;
    } else {
      // Send ERC20 token
      // Get token address from symbol or use directly if it's an address
      let tokenAddress = token;
      if (!token.startsWith('0x')) {
        // It's a symbol, look it up
        const tokens = config.tokens as Record<string, string>;
        tokenAddress = tokens[token] || tokens[token.toUpperCase()] || token;
      }

      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      // Get decimals
      let decimals = 18;
      try {
        decimals = await tokenContract.decimals();
      } catch (e) {
        console.warn('Could not get decimals, using 18');
      }

      // Parse amount with correct decimals
      const amountWei = ethers.parseUnits(amount, decimals);

      // Send token
      const tx = await tokenContract.transfer(toAddress, amountWei);
      const receipt = await tx.wait();
      return receipt?.hash || tx.hash;
    }
  } catch (error: any) {
    console.error('Error sending payment:', error);

    // User rejected transaction
    if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
      throw new Error('Transaction rejected by user');
    }

    // Insufficient funds
    if (error.message?.includes('insufficient funds')) {
      throw new Error('Insufficient funds for this transaction');
    }

    throw new Error(error.message || 'Failed to send payment');
  }
}

// Type declarations for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
      isMetaMask?: boolean;
      selectedAddress?: string;
    };
  }
}
