/**
 * Permit2 Bundle Test Utility for BNBPay Relay
 *
 * This file provides utilities to generate valid Permit2 bundle payloads
 * for testing the /relay/permit2/bundle endpoint on BNB Testnet.
 *
 * Usage:
 *   npx ts-node src/lib/permit2-bundle-test.ts
 *   or import functions in tests
 */

import { ethers } from 'ethers';

// ============================================================================
// 1. BUNDLE TRANSACTION SEQUENCE
// ============================================================================
/**
 * The Permit2 bundle executes atomically via eth_sendBundle (BEP-322/NodeReal):
 *
 * Transaction Order:
 * 1. [Optional] Top-up: Relayer sends BNB to payer for gas (if topUpWei specified)
 * 2. [Required] Approval TX: ERC20.approve(Permit2Address, MaxUint256)
 *    - Signed by payer using eth_signTransaction
 *    - Allows Permit2 to pull tokens
 * 3. [Required] Payment TX: Router.payWithPermit2(...)
 *    - Built by relayer from permit2 + witness data
 *    - Permit2 pulls tokens from payer to router
 *    - Router settles payment to merchant
 *
 * Bundle Atomicity:
 * - If ANY transaction reverts, NONE are included
 * - No gas spent on failed bundles
 * - Prevents partial execution states
 */

// ============================================================================
// 2. NETWORK CONFIGURATION (BNB Testnet - chainId 97)
// ============================================================================

export const BNB_TESTNET_CONFIG = {
  chainId: 97,
  chainIdHex: '0x61',
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',

  // Contract Addresses
  contracts: {
    permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
    bnbPayRouter: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B',
    paymentRegistry: '0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D',
    sessionStore: '0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983',
  },

  // Token Addresses
  tokens: {
    USD1: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', // 6 decimals
    WUSD: '0x5e5ecf5e2512719DE778b88191062114Aa771BCf', // 18 decimals, EIP-2612
    XUSD: '0xBCa3782BC181446a0bdB87356Bde326559a4FAb2', // EIP-3009
    USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
    USDC: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
  },
};

// ============================================================================
// 3. TYPE DEFINITIONS
// ============================================================================

/**
 * Payment Intent - identifies the payment on-chain
 * Hashed to create intentHash for witness
 */
export interface PaymentIntent {
  paymentId: string;    // bytes32 - unique payment identifier
  merchant: string;     // address - receives payment
  token: string;        // address - ERC20 token
  amount: string;       // uint256 - wei amount
  deadline: number;     // uint256 - unix timestamp
  payer: string;        // address - who pays
  resourceId: string;   // bytes32 - external reference
  referenceHash: string; // bytes32 - keccak256 of reference string
}

/**
 * FlexWitness - signed by payer to authorize payment
 * Binds Permit2 to specific payment intent
 */
export interface FlexWitness {
  schemeId: string;     // bytes32 - keccak256("permit2")
  intentHash: string;   // bytes32 - hash of PaymentIntent
  payer: string;        // address - must match intent.payer
  salt: string;         // bytes32 - unique per payment
}

/**
 * Permit2 data for token transfer
 */
export interface Permit2Data {
  permit: {
    permitted: {
      token: string;      // address - must match intent.token
      amount: string;     // uint256 - must be >= intent.amount
    };
    nonce: string;        // uint256 - unique per payer/token
    deadline: number;     // uint256 - signature expiry
  };
  transferDetails: {
    to: string;           // address - router address
    requestedAmount: string; // uint256 - same as permit amount
  };
  signature: string;      // bytes - Permit2 signature with witness
}

/**
 * Session data (optional) for agent-based payments
 */
export interface SessionData {
  sessionId: string;     // bytes32 - from SessionStore
  agent: string;         // address - authorized agent
}

export interface SessionAuth {
  sessionId: string;     // bytes32
  intentHash: string;    // bytes32
  schemeId: string;      // bytes32
  spendNonce: string;    // uint256
  expiresAt: number;     // uint256
}

/**
 * Complete bundle request
 */
export interface Permit2BundleRequest {
  network: 'bnbTestnet' | 'bnb';
  intent: PaymentIntent;
  witness: FlexWitness;
  witnessSignature: string;    // bytes - EIP-712 signature of FlexWitness
  reference?: string;          // string - human-readable reference
  session?: SessionData;       // optional - for agent payments
  sessionAuth?: SessionAuth;   // optional - for agent payments
  sessionAuthSignature?: string; // optional - signature of sessionAuth
  permit2: Permit2Data;
  approvalTx: string;          // hex - signed raw transaction
  targetBlock?: number;        // optional - specific target block
  maxBlockNumber?: number;     // optional - bundle expiry block
  minTimestamp?: number;       // optional - minimum timestamp
  maxTimestamp?: number;       // optional - maximum timestamp
  topUpWei?: string;           // optional - relayer funding amount
  topUpTo?: string;            // optional - override funding recipient
  revertingTxHashes?: string[]; // optional - allow specific reverts
}

// ============================================================================
// 4. FIELD-BY-FIELD BREAKDOWN
// ============================================================================

/**
 * FIELD BREAKDOWN TABLE:
 *
 * | Field                | Who Signs       | EIP Standard | Verifying Contract | Encoding                    |
 * |---------------------|-----------------|--------------|-------------------|------------------------------|
 * | intent.paymentId    | N/A (derived)   | -            | PaymentRegistry   | bytes32 (keccak256)          |
 * | intent.merchant     | N/A             | -            | Router            | address (20 bytes)           |
 * | intent.token        | N/A             | -            | Permit2           | address (20 bytes)           |
 * | intent.amount       | N/A             | -            | Permit2/Registry  | uint256 string               |
 * | intent.deadline     | N/A             | -            | Router            | unix timestamp               |
 * | intent.resourceId   | N/A (derived)   | -            | PaymentRegistry   | bytes32                      |
 * | witness             | Payer           | EIP-712      | BNBPayRouter      | struct hash                  |
 * | witnessSignature    | Payer           | EIP-712      | BNBPayRouter      | 65-byte ECDSA                |
 * | permit2.signature   | Payer           | EIP-712      | Permit2           | 65-byte ECDSA                |
 * | approvalTx          | Payer           | EIP-1559     | ERC20 Token       | RLP-encoded signed tx        |
 * | sessionAuth         | Agent           | EIP-712      | SessionStore      | struct hash                  |
 * | sessionAuthSignature| Agent           | EIP-712      | SessionStore      | 65-byte ECDSA                |
 */

// ============================================================================
// 5. EIP-712 TYPE DEFINITIONS
// ============================================================================

// Permit2 domain (for permit2 signature)
// CRITICAL: Canonical Permit2 does NOT include version in domain!
// Domain separator: EIP712Domain(string name,uint256 chainId,address verifyingContract)
export const PERMIT2_DOMAIN = {
  name: 'Permit2',
  // NO VERSION - Permit2 omits version from EIP-712 domain
  chainId: 97,
  verifyingContract: BNB_TESTNET_CONFIG.contracts.permit2,
};

// Router domain (for witness signature)
export const ROUTER_DOMAIN = {
  name: 'BNBPayRouter',
  version: '1',
  chainId: 97,
  verifyingContract: BNB_TESTNET_CONFIG.contracts.bnbPayRouter,
};

// FlexWitness EIP-712 types
export const FLEX_WITNESS_TYPES = {
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
};

// Permit2 with witness EIP-712 types
// CRITICAL FIX: The router passes witness as bytes32 (EIP-712 digest of FlexWitness),
// NOT as a nested struct. We must:
// 1. Compute witnessDigest = hashTypedDataV4(routerDomain, FlexWitnessTypes, witness)
// 2. Sign Permit2 with witness: witnessDigest (bytes32)
//
// The witnessTypeString the router uses is:
// "FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)"
export const PERMIT2_WITNESS_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'bytes32' },  // FIXED: bytes32 (router EIP-712 digest), not FlexWitness
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
};

// PaymentIntent EIP-712 types (for intentHash computation)
export const PAYMENT_INTENT_TYPES = {
  PaymentIntent: [
    { name: 'paymentId', type: 'bytes32' },
    { name: 'merchant', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'payer', type: 'address' },
    { name: 'resourceId', type: 'bytes32' },
    { name: 'referenceHash', type: 'bytes32' },
  ],
};

// ============================================================================
// 6. HASH COMPUTATION HELPERS
// ============================================================================

/**
 * Compute schemeId for "permit2" scheme
 */
export function getPermit2SchemeId(): string {
  return ethers.keccak256(ethers.toUtf8Bytes('permit2'));
}

/**
 * Compute paymentId from components
 * paymentId = keccak256(abi.encodePacked(merchant, payer, token, amount, deadline, salt))
 */
export function computePaymentId(params: {
  merchant: string;
  payer: string;
  token: string;
  amount: string;
  deadline: number;
  salt: string;
}): string {
  const encoded = ethers.solidityPacked(
    ['address', 'address', 'address', 'uint256', 'uint256', 'bytes32'],
    [params.merchant, params.payer, params.token, params.amount, params.deadline, params.salt]
  );
  return ethers.keccak256(encoded);
}

/**
 * Compute resourceId from reference string
 * resourceId = keccak256(referenceData)
 */
export function computeResourceId(referenceData: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(referenceData));
}

/**
 * Compute referenceHash from reference string
 */
export function computeReferenceHash(referenceData: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(referenceData));
}

/**
 * Compute intentHash by calling the BNBPayRouter contract on-chain
 * This is the ONLY reliable way to get the correct intentHash
 */
export async function computeIntentHashOnChain(
  intent: PaymentIntent,
  provider: ethers.Provider
): Promise<string> {
  const router = new ethers.Contract(
    BNB_TESTNET_CONFIG.contracts.bnbPayRouter,
    [
      'function hashPaymentIntent(tuple(bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash) intent) external pure returns (bytes32)',
    ],
    provider
  );

  return await router.hashPaymentIntent(intent);
}

/**
 * Compute intentHash locally using EIP-712 struct hashing
 * NOTE: This should match the on-chain computation, but use computeIntentHashOnChain for production
 */
export function computeIntentHashLocal(intent: PaymentIntent): string {
  // TypeHash for PaymentIntent
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes(
      'PaymentIntent(bytes32 paymentId,address merchant,address token,uint256 amount,uint256 deadline,address payer,bytes32 resourceId,bytes32 referenceHash)'
    )
  );

  // Encode struct values
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['bytes32', 'bytes32', 'address', 'address', 'uint256', 'uint256', 'address', 'bytes32', 'bytes32'],
    [
      typeHash,
      intent.paymentId,
      intent.merchant,
      intent.token,
      intent.amount,
      intent.deadline,
      intent.payer,
      intent.resourceId,
      intent.referenceHash,
    ]
  );

  return ethers.keccak256(encoded);
}

// ============================================================================
// 7. SIGNATURE GENERATION
// ============================================================================

/**
 * Sign FlexWitness for BNBPayRouter
 * @param witness - The witness struct
 * @param signer - ethers Signer (payer)
 */
export async function signWitness(
  witness: FlexWitness,
  signer: ethers.Signer
): Promise<string> {
  return await signer.signTypedData(ROUTER_DOMAIN, FLEX_WITNESS_TYPES, witness);
}

/**
 * Compute witness struct hash for debugging purposes
 * The actual hashing is done automatically by ethers.js when using nested types
 */
export function computeWitnessStructHash(witness: FlexWitness): string {
  const structHash = ethers.TypedDataEncoder.hashStruct('FlexWitness', FLEX_WITNESS_TYPES, witness);

  console.log('🔐 FlexWitness struct hash (for debug):');
  console.log('   Witness:', JSON.stringify(witness, null, 2));
  console.log('   Struct hash:', structHash);

  return structHash;
}

/**
 * Sign Permit2 PermitWitnessTransferFrom
 *
 * CRITICAL FIX: The router passes witness as bytes32 (EIP-712 digest of FlexWitness),
 * NOT as a nested struct. We must:
 * 1. Compute witnessDigest = hashTypedDataV4(routerDomain, FlexWitnessTypes, witness)
 * 2. Sign Permit2 with witness: witnessDigest (bytes32)
 *
 * @param params - Permit parameters including FlexWitness
 * @param signer - ethers Signer (payer)
 */
export async function signPermit2WithWitness(params: {
  token: string;
  amount: string;
  spender: string; // Router address
  nonce: string;
  deadline: number;
  witness: FlexWitness;
  signer: ethers.Signer;
}): Promise<string> {
  // Debug: compute struct hash for logging
  const structHash = computeWitnessStructHash(params.witness);
  console.log('🔐 FlexWitness struct hash:', structHash);

  // Step 1: Compute witnessDigest using the ROUTER domain (not Permit2 domain)
  // This is _hashTypedDataV4(hashFlexWitness(witness)) in the router
  const witnessDigest = ethers.TypedDataEncoder.hash(ROUTER_DOMAIN, FLEX_WITNESS_TYPES, params.witness);
  console.log('🔐 Witness Digest (router EIP-712 hash):', witnessDigest);

  // Step 2: Build Permit2 message with witness as bytes32 (the witnessDigest)
  const message = {
    permitted: {
      token: params.token,
      amount: params.amount,
    },
    spender: params.spender,
    nonce: params.nonce,
    deadline: params.deadline,
    witness: witnessDigest, // FIXED: Pass bytes32 witnessDigest, not FlexWitness struct
  };

  console.log('🔐 Permit2 Signing Details:');
  console.log('   Router Domain:', JSON.stringify(ROUTER_DOMAIN, null, 2));
  console.log('   Message (with bytes32 witness):', JSON.stringify(message, null, 2));

  // Log the EIP-712 type string that will be generated
  const typeString = ethers.TypedDataEncoder.from(PERMIT2_WITNESS_TYPES).encodeType('PermitWitnessTransferFrom');
  console.log('   EIP-712 Type String:', typeString);

  console.log('🔧 BACKEND DEBUG - Values for Permit2.permitWitnessTransferFrom():');
  console.log('   witness (bytes32 - router EIP-712 digest):', witnessDigest);
  console.log('   FlexWitness struct hash:', structHash);

  return await params.signer.signTypedData(PERMIT2_DOMAIN, PERMIT2_WITNESS_TYPES, message);
}

// ============================================================================
// 8. APPROVAL TX GENERATION
// ============================================================================

/**
 * Build and optionally sign the ERC20 approval transaction
 *
 * This is a Type 2 (EIP-1559) transaction:
 * - to: token address
 * - data: approve(permit2Address, MaxUint256)
 * - value: 0
 */
export function buildApprovalTxData(_tokenAddress: string): string {
  const iface = new ethers.Interface(['function approve(address spender, uint256 amount)']);
  return iface.encodeFunctionData('approve', [
    BNB_TESTNET_CONFIG.contracts.permit2,
    ethers.MaxUint256,
  ]);
}

/**
 * Build unsigned approval transaction
 */
export async function buildUnsignedApprovalTx(params: {
  tokenAddress: string;
  payerAddress: string;
  provider: ethers.Provider;
}): Promise<ethers.TransactionRequest> {
  const nonce = await params.provider.getTransactionCount(params.payerAddress);
  const feeData = await params.provider.getFeeData();

  return {
    to: params.tokenAddress,
    data: buildApprovalTxData(params.tokenAddress),
    value: 0n,
    chainId: BNB_TESTNET_CONFIG.chainId,
    nonce,
    gasLimit: 60000n, // Standard ERC20 approve
    maxFeePerGas: feeData.maxFeePerGas ?? ethers.parseUnits('5', 'gwei'),
    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei'),
    type: 2, // EIP-1559
  };
}

/**
 * Sign approval transaction using eth_signTransaction
 * NOTE: Requires wallet that supports eth_signTransaction (Rabby, Trust, OKX, etc.)
 * MetaMask does NOT support this.
 */
export async function signApprovalTx(
  tx: ethers.TransactionRequest,
  signer: ethers.Signer
): Promise<string> {
  // For wallets that support signTransaction
  const signedTx = await signer.signTransaction(tx as ethers.TransactionLike);
  return signedTx;
}

// ============================================================================
// 9. COMPLETE PAYLOAD BUILDER
// ============================================================================

export interface BuildBundleParams {
  merchantAddress: string;
  payerAddress: string;
  tokenAddress: string;
  amount: string; // Wei amount
  reference: string; // e.g., "invoice:INV-001"
  deadline?: number; // Unix timestamp (default: 1 hour from now)
  signer: ethers.Signer;
  provider: ethers.Provider;
}

/**
 * Build a complete Permit2 bundle request
 * This generates all required hashes and signatures
 */
export async function buildPermit2BundleRequest(
  params: BuildBundleParams
): Promise<Permit2BundleRequest> {
  const deadline = params.deadline ?? Math.floor(Date.now() / 1000) + 3600;
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const nonce = Date.now().toString(); // Simple nonce for testing

  // Compute derived values
  const referenceHash = computeReferenceHash(params.reference);
  const resourceId = computeResourceId(params.reference);
  const paymentId = computePaymentId({
    merchant: params.merchantAddress,
    payer: params.payerAddress,
    token: params.tokenAddress,
    amount: params.amount,
    deadline,
    salt,
  });

  // Build intent
  const intent: PaymentIntent = {
    paymentId,
    merchant: ethers.getAddress(params.merchantAddress),
    token: ethers.getAddress(params.tokenAddress),
    amount: params.amount,
    deadline,
    payer: ethers.getAddress(params.payerAddress),
    resourceId,
    referenceHash,
  };

  // Compute intentHash
  const intentHash = computeIntentHashLocal(intent);

  // Build witness
  const witness: FlexWitness = {
    schemeId: getPermit2SchemeId(),
    intentHash,
    payer: ethers.getAddress(params.payerAddress),
    salt,
  };

  // Sign witness
  const witnessSignature = await signWitness(witness, params.signer);

  // Sign Permit2
  const permit2Signature = await signPermit2WithWitness({
    token: params.tokenAddress,
    amount: params.amount,
    spender: BNB_TESTNET_CONFIG.contracts.bnbPayRouter,
    nonce,
    deadline,
    witness,
    signer: params.signer,
  });

  // Build and sign approval tx
  const unsignedApprovalTx = await buildUnsignedApprovalTx({
    tokenAddress: params.tokenAddress,
    payerAddress: params.payerAddress,
    provider: params.provider,
  });
  const signedApprovalTx = await signApprovalTx(unsignedApprovalTx, params.signer);

  return {
    network: 'bnbTestnet',
    intent,
    witness,
    witnessSignature,
    reference: params.reference,
    permit2: {
      permit: {
        permitted: {
          token: params.tokenAddress,
          amount: params.amount,
        },
        nonce,
        deadline,
      },
      transferDetails: {
        to: BNB_TESTNET_CONFIG.contracts.bnbPayRouter,
        requestedAmount: params.amount,
      },
      signature: permit2Signature,
    },
    approvalTx: signedApprovalTx,
  };
}

// ============================================================================
// 10. EXAMPLE PAYLOAD (FOR TESTING SCHEMA)
// ============================================================================

/**
 * Generate a REALISTIC example payload that passes schema validation
 * NOTE: This will fail signature verification but is useful for schema testing
 */
export function generateExamplePayload(): Permit2BundleRequest {
  const now = Math.floor(Date.now() / 1000);
  const deadline = now + 3600;

  // Use real addresses from testnet
  const merchantAddress = '0x742d35Cc6634C0532925a3b844Bc9e7595f5bF91';
  const payerAddress = '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199';
  const tokenAddress = BNB_TESTNET_CONFIG.tokens.USD1;
  const routerAddress = BNB_TESTNET_CONFIG.contracts.bnbPayRouter;

  // Generate deterministic but valid-looking hashes
  const salt = '0x' + '1'.repeat(64);
  const reference = 'invoice:TEST-001';
  const referenceHash = computeReferenceHash(reference);
  const resourceId = computeResourceId(reference);

  // Compute paymentId
  const paymentId = computePaymentId({
    merchant: merchantAddress,
    payer: payerAddress,
    token: tokenAddress,
    amount: '1000000', // 1 USD1 (6 decimals)
    deadline,
    salt,
  });

  // Build intent
  const intent: PaymentIntent = {
    paymentId,
    merchant: merchantAddress,
    token: tokenAddress,
    amount: '1000000',
    deadline,
    payer: payerAddress,
    resourceId,
    referenceHash,
  };

  // Compute intentHash
  const intentHash = computeIntentHashLocal(intent);

  // Build witness
  const witness: FlexWitness = {
    schemeId: getPermit2SchemeId(),
    intentHash,
    payer: payerAddress,
    salt,
  };

  // Generate placeholder signatures (65 bytes = 130 hex chars + 0x)
  const placeholderSig = '0x' + 'a'.repeat(128) + '1b'; // v=27

  // This is a placeholder signed tx - real one would be from eth_signTransaction
  // Format: RLP encoded EIP-1559 transaction
  const exampleApprovalTx = '0x02f8b0610182753083030d4083030d409' +
    tokenAddress.slice(2).toLowerCase() +
    '80b844095ea7b3000000000000000000000000' +
    BNB_TESTNET_CONFIG.contracts.permit2.slice(2).toLowerCase() +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' +
    'c001a0' + 'a'.repeat(64) + 'a0' + 'b'.repeat(64);

  return {
    network: 'bnbTestnet',
    intent,
    witness,
    witnessSignature: placeholderSig,
    reference,
    permit2: {
      permit: {
        permitted: {
          token: tokenAddress,
          amount: '1000000',
        },
        nonce: now.toString(),
        deadline,
      },
      transferDetails: {
        to: routerAddress,
        requestedAmount: '1000000',
      },
      signature: placeholderSig,
    },
    approvalTx: exampleApprovalTx,
  };
}

// ============================================================================
// 11. API TESTING
// ============================================================================

const API_BASE_URL = 'https://api.bnbpay.org';

/**
 * Submit bundle to relay
 */
export async function submitBundle(request: Permit2BundleRequest): Promise<{
  bundleId: string;
  method: string;
  targetBlock: number;
  network: string;
  paymentId: string;
}> {
  const response = await fetch(`${API_BASE_URL}/relay/permit2/bundle`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Bundle submission failed: ${error}`);
  }

  return response.json();
}

/**
 * Build payment intent using API (recommended)
 * This ensures intentHash matches server expectations
 */
export async function buildIntentViaAPI(params: {
  merchant: string;
  token: string;
  amount: string;
  decimals: number;
  payer: string;
  invoiceId?: string;
  reference?: string;
}): Promise<any> {
  const response = await fetch(`${API_BASE_URL}/payments/build-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'minimal',
      network: 'bnbTestnet',
      merchant: params.merchant,
      token: params.token,
      amount: params.amount,
      decimals: params.decimals,
      scheme: 'permit2',
      payer: params.payer,
      deadlineSeconds: 3600,
      invoiceId: params.invoiceId,
      referenceId: params.reference,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Build intent failed: ${error}`);
  }

  return response.json();
}

// ============================================================================
// 12. CURL COMMAND GENERATOR
// ============================================================================

/**
 * Generate curl command for testing
 */
export function generateCurlCommand(request: Permit2BundleRequest): string {
  const json = JSON.stringify(request, null, 2);

  return `curl -X POST ${API_BASE_URL}/relay/permit2/bundle \\
  -H "Content-Type: application/json" \\
  -d '${json}'`;
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  BNB_TESTNET_CONFIG,
  PERMIT2_DOMAIN,
  ROUTER_DOMAIN,
  FLEX_WITNESS_TYPES,
  PERMIT2_WITNESS_TYPES,
  getPermit2SchemeId,
  computePaymentId,
  computeResourceId,
  computeReferenceHash,
  computeIntentHashLocal,
  computeIntentHashOnChain,
  computeWitnessStructHash,
  signWitness,
  signPermit2WithWitness,
  buildApprovalTxData,
  buildUnsignedApprovalTx,
  signApprovalTx,
  buildPermit2BundleRequest,
  generateExamplePayload,
  submitBundle,
  buildIntentViaAPI,
  generateCurlCommand,
};
