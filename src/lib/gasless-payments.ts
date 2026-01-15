/**
 * Gasless Payment Utilities
 *
 * Implements gasless payments using Permit2 and EIP-2612 permits with relay infrastructure.
 * For ERC20 tokens only - native BNB always requires gas.
 */

import { ethers } from 'ethers';
import {
  relayPayment,
  relayPermit2Bundle,
  buildPaymentIntent,
  type RelayPaymentRequest,
  type Permit2BundleRequest,
  type BuildIntentRequest,
  type NetworkKey,
} from './bnbpay-api';
import { NETWORKS, type NetworkType } from './web3';

const DEBUG_LOGS = typeof window !== 'undefined' && window.localStorage?.getItem('bnbpay_debug') === '1';
const logDebug = (...args: unknown[]) => {
  if (DEBUG_LOGS) {
    console.log(...args);
  }
};
const logInfo = (...args: unknown[]) => {
  console.log(...args);
};

// Permit2 contract address - NOTE: This is the universal address but BNB Testnet uses a different one
// The actual address should come from NETWORKS config
export const PERMIT2_ADDRESS_UNIVERSAL = '0x000000000022D473030F116dDEE9F6B43aC78BA3';

// Legacy export for backward compatibility (defaults to testnet)
export const PERMIT2_ADDRESS = NETWORKS.testnet.contracts.permit2 || PERMIT2_ADDRESS_UNIVERSAL;

// Get Permit2 address for a specific network
export function getPermit2Address(network: NetworkType): string {
  const config = NETWORKS[network];
  // Use network-specific Permit2 if available, otherwise fall back to universal
  return (config.contracts as any).permit2 || PERMIT2_ADDRESS_UNIVERSAL;
}

// EIP-712 domain for Permit2
// NOTE: Different Permit2 deployments may have different domain configurations
// We try without version first (canonical Uniswap), then with version if that fails
const PERMIT2_DOMAIN_NAME = 'Permit2';

/**
 * Debug: Fetch the actual DOMAIN_SEPARATOR from the Permit2 contract
 * This helps diagnose domain mismatch issues
 */
export async function getPermit2DomainSeparator(
  provider: ethers.Provider,
  network: NetworkType = 'testnet'
): Promise<string> {
  const permit2Address = getPermit2Address(network);
  const permit2 = new ethers.Contract(
    permit2Address,
    ['function DOMAIN_SEPARATOR() external view returns (bytes32)'],
    provider
  );
  return await permit2.DOMAIN_SEPARATOR();
}

/**
 * Compute what we think the domain separator should be (without version)
 */
export function computePermit2DomainSeparator(chainId: number, permit2Address: string): string {
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
  );
  const nameHash = ethers.keccak256(ethers.toUtf8Bytes('Permit2'));

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'uint256', 'address'],
      [typeHash, nameHash, chainId, permit2Address]
    )
  );
}

/**
 * Compute domain separator WITH version (some custom deployments use this)
 */
export function computePermit2DomainSeparatorWithVersion(chainId: number, permit2Address: string): string {
  const typeHash = ethers.keccak256(
    ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
  );
  const nameHash = ethers.keccak256(ethers.toUtf8Bytes('Permit2'));
  const versionHash = ethers.keccak256(ethers.toUtf8Bytes('1'));

  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [typeHash, nameHash, versionHash, chainId, permit2Address]
    )
  );
}

/**
 * Debug: Check which domain separator format matches the contract
 */
export async function debugPermit2Domain(
  provider: ethers.Provider,
  network: NetworkType = 'testnet'
): Promise<{ actual: string; withoutVersion: string; withVersion: string; matches: 'none' | 'withoutVersion' | 'withVersion' }> {
  const permit2Address = getPermit2Address(network);
  const config = NETWORKS[network];
  const chainId = config.chainIdNumber;

  const actual = await getPermit2DomainSeparator(provider, network);
  const withoutVersion = computePermit2DomainSeparator(chainId, permit2Address);
  const withVersion = computePermit2DomainSeparatorWithVersion(chainId, permit2Address);

  let matches: 'none' | 'withoutVersion' | 'withVersion' = 'none';
  if (actual.toLowerCase() === withoutVersion.toLowerCase()) {
    matches = 'withoutVersion';
  } else if (actual.toLowerCase() === withVersion.toLowerCase()) {
    matches = 'withVersion';
  }

  logDebug('🔍 Permit2 Domain Separator Debug:');
  logDebug('   Contract address:', permit2Address);
  logDebug('   Chain ID:', chainId);
  logDebug('   Actual from contract:', actual);
  logDebug('   Computed (no version):', withoutVersion);
  logDebug('   Computed (with version):', withVersion);
  logDebug('   Matches:', matches);

  return { actual, withoutVersion, withVersion, matches };
}

// Permit2 EIP-712 types for standard PermitTransferFrom (without witness - NOT USED)
const PERMIT2_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
};

// FlexWitness EIP-712 types (standalone for router domain signing)
const FLEX_WITNESS_TYPES = {
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
};

// =============================================================================
// PERMIT2 TYPE HASHES - Must match exactly what Permit2 contract computes
// =============================================================================

// Permit2 computes the type hash as keccak256(stub + witnessTypeString).
// The witnessTypeString must be the tail that includes the witness param name and TokenPermissions definition.

const FLEX_WITNESS_TYPESTRING =
  'FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)';
const PERMIT2_WITNESS_TYPESTRING =
  'FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)';
const FLEX_WITNESS_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  FLEX_WITNESS_TYPESTRING
));

const TOKEN_PERMISSIONS_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'TokenPermissions(address token,uint256 amount)'
));

// Permit2 type hash uses a stub + witnessTypeString.
const PERMIT_WITNESS_TYPEHASH_STUB =
  'PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,';
const PERMIT2_TYPE_STRING_WITH_WITNESS = `${PERMIT_WITNESS_TYPEHASH_STUB}${PERMIT2_WITNESS_TYPESTRING}`;
const FULL_PERMIT2_TYPE_STRING_LEGACY =
  'PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,bytes32 witness)TokenPermissions(address token,uint256 amount)';

const PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_WITH_WITNESS = ethers.keccak256(
  ethers.toUtf8Bytes(PERMIT2_TYPE_STRING_WITH_WITNESS)
);
const PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_LEGACY = ethers.keccak256(
  ethers.toUtf8Bytes(FULL_PERMIT2_TYPE_STRING_LEGACY)
);

// EIP-2612 EIP-712 types (for tokens that support it)
const EIP2612_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

// EIP-3009 EIP-712 types (for tokens that support TransferWithAuthorization)
// EIP-3009 uses validAfter/validBefore instead of deadline, and authNonce instead of sequential nonce
const EIP3009_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
};

/**
 * Check if token supports EIP-2612 permit
 */
export async function supportsEIP2612(tokenAddress: string, provider: ethers.Provider): Promise<boolean> {
  try {
    const contract = new ethers.Contract(
      tokenAddress,
      ['function DOMAIN_SEPARATOR() external view returns (bytes32)'],
      provider
    );
    await contract.DOMAIN_SEPARATOR();
    return true;
  } catch {
    return false;
  }
}

/**
 * Get nonce for Permit2
 */
export async function getPermit2Nonce(
  owner: string,
  provider: ethers.Provider,
  network: NetworkType = 'testnet'
): Promise<string> {
  const permit2Address = getPermit2Address(network);
  const permit2 = new ethers.Contract(
    permit2Address,
    ['function nonceBitmap(address owner, uint256 word) external view returns (uint256)'],
    provider
  );

  const maxWordsToScan = 4; // 4 * 256 = 1024 nonces before we extend the scan
  try {
    for (let word = 0; word < maxWordsToScan; word += 1) {
      const bitmap: bigint = await permit2.nonceBitmap(owner, word);
      if (bitmap !== ethers.MaxUint256) {
        for (let bit = 0; bit < 256; bit += 1) {
          const mask = 1n << BigInt(bit);
          if ((bitmap & mask) === 0n) {
            const nonce = (BigInt(word) << 8n) | BigInt(bit);
            return nonce.toString();
          }
        }
      }
    }
  } catch (error) {
    console.error('Failed to read Permit2 nonce bitmap:', error);
    throw new Error('Permit2 nonce bitmap query failed; check Permit2 address and RPC');
  }

  throw new Error('Permit2 nonce bitmap exhausted; increase scan range');
}

async function permit2SupportsWitnessTypeString(
  provider: ethers.Provider,
  permit2Address: string
): Promise<boolean> {
  const code = await provider.getCode(permit2Address);
  if (!code || code === '0x') {
    throw new Error('Permit2 contract code not found');
  }
  // selector for permitWitnessTransferFrom with witnessTypeString
  const selector = '137c29fe';
  if (!code.toLowerCase().includes(selector)) {
    return false;
  }

  // Probe the function with a safe eth_call; non-empty revert data indicates support.
  const iface = new ethers.Interface([
    'function permitWitnessTransferFrom(((address token,uint256 amount) permitted,uint256 nonce,uint256 deadline),(address to,uint256 requestedAmount),address owner,bytes32 witness,string witnessTypeString,bytes signature)',
  ]);
  const data = iface.encodeFunctionData('permitWitnessTransferFrom', [
    { permitted: { token: ethers.ZeroAddress, amount: 0n }, nonce: 0n, deadline: 0n },
    { to: ethers.ZeroAddress, requestedAmount: 0n },
    ethers.ZeroAddress,
    ethers.ZeroHash,
    FLEX_WITNESS_TYPESTRING,
    '0x',
  ]);

  try {
    await provider.call({ to: permit2Address, data });
    return true;
  } catch (err: any) {
    const revertData = err?.data ?? err?.info?.error?.data ?? err?.error?.data;
    return Boolean(revertData && revertData !== '0x');
  }
}

/**
 * Get nonce for EIP-2612
 */
export async function getEIP2612Nonce(
  tokenAddress: string,
  owner: string,
  provider: ethers.Provider
): Promise<bigint> {
  const contract = new ethers.Contract(
    tokenAddress,
    ['function nonces(address owner) external view returns (uint256)'],
    provider
  );
  return await contract.nonces(owner);
}

/**
 * Sign Permit2 permit for gasless token transfer (standard - without witness)
 * NOTE: This is NOT used by BNBPayRouter - use signPermit2WithWitness instead
 */
export async function signPermit2(params: {
  tokenAddress: string;
  amount: bigint;
  spender: string;
  deadline: number;
  nonce: string;
  chainId: number;
  permit2Address: string; // Network-specific Permit2 address
  signer: ethers.Signer;
}): Promise<string> {
  // CRITICAL: Permit2 domain does NOT include version
  // Domain separator: EIP712Domain(string name,uint256 chainId,address verifyingContract)
  const domain = {
    name: PERMIT2_DOMAIN_NAME,
    chainId: params.chainId,
    verifyingContract: params.permit2Address,
  };

  const message = {
    permitted: {
      token: params.tokenAddress,
      amount: params.amount.toString(),
    },
    spender: params.spender,
    nonce: params.nonce,
    deadline: params.deadline,
  };

  return await params.signer.signTypedData(domain, PERMIT2_TYPES, message);
}

/**
 * Compute witness hash using ethers.js TypedDataEncoder
 * This is for debugging/logging only - the actual hashing is done by ethers.js
 * when signing with nested types
 */
export function computeWitnessStructHash(
  witness: {
    schemeId: string;
    intentHash: string;
    payer: string;
    salt: string;
  }
): string {
  // Compute just the struct hash (not full EIP-712 hash)
  // This is what ethers.js computes internally when using nested types
  const structHash = ethers.TypedDataEncoder.hashStruct('FlexWitness', FLEX_WITNESS_TYPES, witness);

  logDebug('🔐 Witness Struct Hash (for debug):');
  logDebug('   Witness:', JSON.stringify(witness, null, 2));
  logDebug('   Struct hash:', structHash);

  return structHash;
}

/**
 * Sign Permit2 PermitWitnessTransferFrom for BNBPayRouter
 *
 * Per senior dev guidance:
 * - Permit2 typed data must bind the FlexWitness struct hash
 * - witness value = hashFlexWitness(witness) (struct hash)
 *
 * Hash computation:
 * 1. Compute FlexWitness struct hash
 * 2. Sign Permit2 typed data with witness: struct hash (bytes32)
 */
export async function signPermit2WithWitness(params: {
  tokenAddress: string;
  amount: bigint;
  spender: string; // Router address
  deadline: number;
  nonce: string;
  chainId: number;
  permit2Address: string; // Network-specific Permit2 address
  permit2WitnessTypeString?: string;
  witness: {
    schemeId: string;
    intentHash: string;
    payer: string;
    salt: string;
  };
  signer: ethers.Signer;
}): Promise<string> {
  const signerAddress = await params.signer.getAddress();

  // ==========================================================================
  // DEBUG: Print raw witness values
  // ==========================================================================
  logDebug('🔐 Raw Witness Values:');
  logDebug('   schemeId:', params.witness.schemeId);
  logDebug('   intentHash:', params.witness.intentHash);
  logDebug('   payer:', params.witness.payer);
  logDebug('   salt:', params.witness.salt);

  // Ensure bytes32 values are properly padded
  const schemeId = ethers.zeroPadValue(params.witness.schemeId, 32);
  const intentHash = ethers.zeroPadValue(params.witness.intentHash, 32);
  const salt = ethers.zeroPadValue(params.witness.salt, 32);
  const payer = ethers.getAddress(params.witness.payer); // Normalize address

  logDebug('🔐 Normalized Witness Values:');
  logDebug('   schemeId:', schemeId);
  logDebug('   intentHash:', intentHash);
  logDebug('   payer:', payer);
  logDebug('   salt:', salt);

  // Create normalized witness object
  const normalizedWitness = { schemeId, intentHash, payer, salt };

  // ==========================================================================
  // STEP 1: Compute FlexWitness struct hash (Permit2 witness)
  // Compare ethers hashStruct vs manual ABI encoding
  // ==========================================================================

  // Method A: Using ethers TypedDataEncoder.hashStruct with normalized values
  const witnessStructHashEthers = ethers.TypedDataEncoder.hashStruct('FlexWitness', FLEX_WITNESS_TYPES, normalizedWitness);

  // Method B: Manual ABI encoding with normalized values
  const witnessStructHashManual = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
      [FLEX_WITNESS_TYPEHASH, schemeId, intentHash, payer, salt]
    )
  );

  logDebug('🔐 FlexWitness Struct Hash Comparison:');
  logDebug('   ethers hashStruct:', witnessStructHashEthers);
  logDebug('   manual ABI encode:', witnessStructHashManual);
  logDebug('   Match:', witnessStructHashEthers === witnessStructHashManual ? '✅ YES' : '❌ NO');

  // If they don't match, log detailed encoding
  if (witnessStructHashEthers !== witnessStructHashManual) {
    logDebug('🔍 DEBUG: Struct hash mismatch - checking type hash...');
    // Get ethers internal type hash for comparison
    const encoder = ethers.TypedDataEncoder.from(FLEX_WITNESS_TYPES);
    // Log the encoded types
    logDebug('   ethers encodeType:', encoder.encodeType('FlexWitness'));
  }

  logDebug('   our FLEX_WITNESS_TYPEHASH:', FLEX_WITNESS_TYPEHASH);

  // Use whichever is correct (prefer ethers as it's the standard)
  const witnessStructHash = witnessStructHashEthers;

  // ==========================================================================
  // STEP 2: Compute Permit2 witness hash (FlexWitness struct hash)
  // ==========================================================================
  const witnessHash = witnessStructHash;
  logDebug('🔐 Permit2 witness hash:', witnessHash);

  // ==========================================================================
  // STEP 4: Compute Permit2 domain separator (NO VERSION!)
  // ==========================================================================
  const permit2DomainSeparator = computePermit2DomainSeparator(params.chainId, params.permit2Address);
  const permit2DomainSeparatorWithVersion = computePermit2DomainSeparatorWithVersion(params.chainId, params.permit2Address);

  logDebug('🔐 Permit2 Domain Separator:');
  logDebug('   computed (no version):', permit2DomainSeparator);
  logDebug('   computed (with version):', permit2DomainSeparatorWithVersion);

  // Try to get the actual domain separator from the contract for verification
  try {
    const provider = params.signer.provider;
    if (provider) {
      const permit2 = new ethers.Contract(
        params.permit2Address,
        ['function DOMAIN_SEPARATOR() external view returns (bytes32)'],
        provider
      );
      const onChainDomainSep = await permit2.DOMAIN_SEPARATOR();
      logDebug('   on-chain:', onChainDomainSep);
      logDebug('   matches (no version):', onChainDomainSep === permit2DomainSeparator ? '✅ YES' : '❌ NO');
      logDebug('   matches (with version):', onChainDomainSep === permit2DomainSeparatorWithVersion ? '✅ YES' : '❌ NO');

      // If neither matches, this is a critical error
      if (onChainDomainSep !== permit2DomainSeparator && onChainDomainSep !== permit2DomainSeparatorWithVersion) {
        console.error('❌ CRITICAL: Permit2 domain separator does not match any computed value!');
      }
    }
  } catch (e: any) {
    console.warn('   Could not fetch on-chain domain separator:', e.message);
  }

  // ==========================================================================
  // STEP 5: Compute TokenPermissions struct hash
  // ==========================================================================
  const tokenPermissionsHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'address', 'uint256'],
      [TOKEN_PERMISSIONS_TYPEHASH, params.tokenAddress, params.amount]
    )
  );
  logDebug('🔐 TokenPermissions hash:', tokenPermissionsHash);

  // ==========================================================================
  // STEP 6: Compute PermitWitnessTransferFrom struct hash
  // CRITICAL: Uses the full type hash (with or without witnessTypeString support)
  // and encodes witness as raw bytes32 (witnessHash)
  // ==========================================================================
  const provider = params.signer.provider;
  if (!provider) {
    throw new Error('Permit2 signing requires a provider');
  }

  let supportsWitnessTypeString = false;
  try {
    supportsWitnessTypeString = await permit2SupportsWitnessTypeString(provider, params.permit2Address);
  } catch (e: any) {
    console.warn('Could not detect Permit2 witnessTypeString support:', e?.message ?? e);
  }

  const permit2WitnessTypeString = params.permit2WitnessTypeString ?? PERMIT2_WITNESS_TYPESTRING;
  const permit2TypeStringWithWitness = `${PERMIT_WITNESS_TYPEHASH_STUB}${permit2WitnessTypeString}`;
  const permit2TypeHashWithWitness =
    permit2WitnessTypeString === PERMIT2_WITNESS_TYPESTRING
      ? PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_WITH_WITNESS
      : ethers.keccak256(ethers.toUtf8Bytes(permit2TypeStringWithWitness));

  const permit2TypeString = supportsWitnessTypeString
    ? permit2TypeStringWithWitness
    : FULL_PERMIT2_TYPE_STRING_LEGACY;
  const permit2TypeHash = supportsWitnessTypeString
    ? permit2TypeHashWithWitness
    : PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_LEGACY;

  logInfo(
    `Permit2 type: ${supportsWitnessTypeString ? 'modern' : 'legacy'} | typeHash: ${permit2TypeHash}`
  );
  logDebug('🔐 Message Struct Hash Encoding:');
  logDebug('   Permit2 supports witnessTypeString:', supportsWitnessTypeString ? '✅ YES' : '❌ NO');
  logDebug('   witnessTypeString:', permit2WitnessTypeString);
  logDebug('   Full type string:', permit2TypeString);
  logDebug('   PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH:', permit2TypeHash);
  logDebug('   tokenPermissionsHash:', tokenPermissionsHash);
  logDebug('   spender:', params.spender);
  logDebug('   nonce:', params.nonce, '(type:', typeof params.nonce, ')');
  logDebug('   deadline:', params.deadline, '(type:', typeof params.deadline, ')');
  logDebug('   witnessHash:', witnessHash);

  // Debug: Show exact values being encoded
  const encodedValues = [
    permit2TypeHash,
    tokenPermissionsHash,
    params.spender,
    params.nonce,
    params.deadline,
    witnessHash,
  ];
  logDebug('   Values array:', encodedValues);

  const messageStructHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'address', 'uint256', 'uint256', 'bytes32'],
      encodedValues
    )
  );
  logDebug('🔐 Message struct hash:', messageStructHash);

  // ==========================================================================
  // STEP 7: Compute final EIP-712 digest (what we need to sign)
  // Try both with and without version to find the correct one
  // ==========================================================================
  const digestNoVersion = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', permit2DomainSeparator, messageStructHash]
    )
  );
  const digestWithVersion = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', permit2DomainSeparatorWithVersion, messageStructHash]
    )
  );

  logDebug('🔐 Final EIP-712 Digest:');
  logDebug('   using domain (no version):', digestNoVersion);
  logDebug('   using domain (with version):', digestWithVersion);

  // Determine which domain separator is correct based on on-chain verification
  let digest = digestNoVersion; // Default
  let useVersionedDomain = false;

  try {
    const provider = params.signer.provider;
    if (provider) {
      const permit2 = new ethers.Contract(
        params.permit2Address,
        ['function DOMAIN_SEPARATOR() external view returns (bytes32)'],
        provider
      );
      const onChainDomainSep = await permit2.DOMAIN_SEPARATOR();

      if (onChainDomainSep === permit2DomainSeparatorWithVersion) {
        logDebug('   ✅ Using versioned domain separator (matches on-chain)');
        digest = digestWithVersion;
        useVersionedDomain = true;
      } else if (onChainDomainSep === permit2DomainSeparator) {
        logDebug('   ✅ Using non-versioned domain separator (matches on-chain)');
        digest = digestNoVersion;
      } else {
        console.error('   ❌ WARNING: Neither domain separator matches on-chain! Using default (no version)');
      }
    }
  } catch (e: any) {
    console.warn('   Could not verify domain separator, using default (no version):', e.message);
  }

  logDebug('   Final digest to sign:', digest);

  // ==========================================================================
  // STEP 8: Sign Permit2 digest using eth_sign (raw EIP-712 digest)
  // ==========================================================================
  logDebug('🔐 Permit2 Signing Details:');
  logDebug('   Signer address:', signerAddress);
  logDebug('   Token:', params.tokenAddress);
  logDebug('   Amount:', params.amount.toString());
  logDebug('   Spender:', params.spender);
  logDebug('   Nonce:', params.nonce);
  logDebug('   Deadline:', params.deadline);
  logDebug('   Witness hash:', witnessHash);
  logDebug('   Type hash (PERMIT_WITNESS_TRANSFER_FROM):', permit2TypeHash);

  let signature: string;

  if (typeof (provider as any).send !== 'function') {
    throw new Error('Permit2 signing requires a provider that supports eth_sign');
  }

  try {
    signature = await (provider as any).send('eth_sign', [signerAddress, digest]);
  } catch (signError: any) {
    console.error('eth_sign failed:', signError?.message ?? signError);
    throw new Error(`Cannot sign Permit2 digest: ${signError?.message ?? 'eth_sign failed'}`);
  }

  // Normalize v to 27/28 for on-chain ECDSA compatibility.
  const normalizedSignature = ethers.Signature.from(signature).serialized;
  if (normalizedSignature !== signature) {
    logDebug('Normalized Permit2 signature v-value');
    signature = normalizedSignature;
  }

  // Verify the signature locally
  const recoveredAddress = ethers.recoverAddress(digest, signature);
  logDebug('🔍 LOCAL SIGNATURE VERIFICATION:');
  logDebug('   Recovered signer:', recoveredAddress);
  logDebug('   Expected signer:', signerAddress);
  if (recoveredAddress.toLowerCase() === signerAddress.toLowerCase()) {
    logDebug('   ✅ SIGNATURE VALID locally');
  } else {
    console.error('   ❌ SIGNATURE MISMATCH locally');
    throw new Error('Permit2 signature does not match signer');
  }

  return signature;
}

/**
 * Sign EIP-2612 permit for gasless token approval
 */
export async function signEIP2612(params: {
  tokenAddress: string;
  amount: bigint;
  spender: string;
  deadline: number;
  nonce: bigint;
  chainId: number;
  tokenName: string;
  signer: ethers.Signer;
}): Promise<{ v: number; r: string; s: string }> {
  const domain = {
    name: params.tokenName,
    version: '1',
    chainId: params.chainId,
    verifyingContract: params.tokenAddress,
  };

  const message = {
    owner: await params.signer.getAddress(),
    spender: params.spender,
    value: params.amount.toString(),
    nonce: params.nonce.toString(),
    deadline: params.deadline,
  };

  const signature = await params.signer.signTypedData(domain, EIP2612_TYPES, message);

  // Split signature into v, r, s
  const sig = ethers.Signature.from(signature);
  return {
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

/**
 * Check if token supports EIP-3009 (TransferWithAuthorization)
 * EIP-3009 tokens have transferWithAuthorization function
 * We check bytecode for the function selector since not all implementations have authorizationState
 */
export async function supportsEIP3009(tokenAddress: string, provider: ethers.Provider): Promise<boolean> {
  try {
    // Check bytecode for transferWithAuthorization function selector
    // Selector: 0xe3ee160e for transferWithAuthorization(address,address,uint256,uint256,uint256,bytes32,uint8,bytes32,bytes32)
    const code = await provider.getCode(tokenAddress);
    const selector = 'e3ee160e'; // transferWithAuthorization

    const hasTransferWithAuth = code.toLowerCase().includes(selector);

    if (hasTransferWithAuth) {
      logDebug(`Token ${tokenAddress} supports EIP-3009 (transferWithAuthorization found in bytecode)`);
    } else {
      logDebug(`Token ${tokenAddress} does not support EIP-3009 (no transferWithAuthorization)`);
    }

    return hasTransferWithAuth;
  } catch (error) {
    logDebug(`Token ${tokenAddress} EIP-3009 check failed:`, error);
    return false;
  }
}

/**
 * Generate a random nonce for EIP-3009
 * Unlike EIP-2612, EIP-3009 uses a random bytes32 nonce to prevent replay attacks
 */
export function generateEIP3009Nonce(): string {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Check if an EIP-3009 authorization nonce has been used
 */
export async function isEIP3009NonceUsed(
  tokenAddress: string,
  authorizer: string,
  nonce: string,
  provider: ethers.Provider
): Promise<boolean> {
  try {
    const contract = new ethers.Contract(
      tokenAddress,
      ['function authorizationState(address authorizer, bytes32 nonce) external view returns (bool)'],
      provider
    );
    return await contract.authorizationState(authorizer, nonce);
  } catch {
    // If function doesn't exist, assume nonce not used
    return false;
  }
}

/**
 * Sign EIP-3009 TransferWithAuthorization for gasless token transfer
 * EIP-3009 allows a direct transfer authorization without separate approve step
 */
export async function signEIP3009(params: {
  tokenAddress: string;
  to: string; // Recipient (usually the router)
  amount: bigint;
  validAfter: number; // Unix timestamp when authorization becomes valid
  validBefore: number; // Unix timestamp when authorization expires
  nonce: string; // Random bytes32 nonce
  chainId: number;
  tokenName: string;
  signer: ethers.Signer;
}): Promise<{ v: number; r: string; s: string }> {
  const domain = {
    name: params.tokenName,
    version: '1',
    chainId: params.chainId,
    verifyingContract: params.tokenAddress,
  };

  const from = await params.signer.getAddress();

  const message = {
    from,
    to: params.to,
    value: params.amount.toString(),
    validAfter: params.validAfter,
    validBefore: params.validBefore,
    nonce: params.nonce,
  };

  logDebug('Signing EIP-3009 TransferWithAuthorization:', message);

  const signature = await params.signer.signTypedData(domain, EIP3009_TYPES, message);

  // Split signature into v, r, s
  const sig = ethers.Signature.from(signature);
  return {
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

/**
 * Pay invoice using gasless relay (EIP-3009, EIP-2612, or Permit2)
 * Priority: EIP-3009 > EIP-2612 > Permit2
 * Only works for ERC20 tokens, not native BNB
 */
export async function payInvoiceGasless(params: {
  merchantAddress: string;
  amount: string; // Amount in token units
  paymentToken: string; // Token symbol (USDT, USDC, USD1)
  tokenAddress: string; // Token contract address
  invoiceId: string;
  resourceId?: string;
  network: NetworkType;
  signer: ethers.Signer;
  provider: ethers.Provider;
}): Promise<{
  txHash: string;
  paymentId: string;
}> {
  const networkKey = params.network === 'mainnet' ? 'bnb' : 'bnbTestnet';
  const config = NETWORKS[params.network];

  // Get payer address
  const payerAddress = await params.signer.getAddress();

  // Get token decimals
  const tokenContract = new ethers.Contract(
    params.tokenAddress,
    [
      'function decimals() external view returns (uint8)',
      'function name() external view returns (string)',
    ],
    params.provider
  );
  const decimals = await tokenContract.decimals();
  const tokenName = await tokenContract.name();

  // Explicitly convert decimals to number (ethers may return BigInt)
  const decimalsNum = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);

  // Parse amount
  const amountWei = ethers.parseUnits(params.amount, decimals);

  // Build payment intent using API
  // Use 'minimal' mode with human-readable amount
  // For invoices, use the invoiceId field which automatically creates canonical reference
  const buildRequest: BuildIntentRequest = {
    mode: 'minimal',
    network: networkKey as NetworkKey,
    merchant: params.merchantAddress,
    token: params.tokenAddress,
    amount: params.amount, // Human-readable amount (e.g., "0.01")
    decimals: decimalsNum, // Ensure it's a plain number, not BigInt
    scheme: 'permit2', // Permit2 scheme for gasless
    payer: payerAddress,
    deadlineSeconds: 3600, // 1 hour
    invoiceId: params.invoiceId, // Use invoiceId for canonical invoice reference
    // Don't pass referenceId/baseReference when using invoiceId
    // Don't pass sessionId - it's for session-based payments only
  };

  logDebug('Building gasless payment intent...');
  logDebug('Build request:', {
    mode: buildRequest.mode,
    network: buildRequest.network,
    merchant: buildRequest.merchant,
    token: buildRequest.token,  // Show full token address
    amount: buildRequest.amount,
    decimals: buildRequest.decimals,
    scheme: buildRequest.scheme,
    payer: buildRequest.payer,
    invoiceId: buildRequest.invoiceId,
  });

  // Build intent from API
  let intentResponse;
  try {
    intentResponse = await buildPaymentIntent(buildRequest);
  } catch (error: any) {
    console.error('❌ Failed to build payment intent:', error);
    console.error('Error details:', error.details || error.message);
    throw new Error(`Failed to build payment intent: ${error.message}`);
  }

  logDebug('Payment intent built successfully');
  logDebug('Full response:', intentResponse);
  logDebug('Payment ID:', intentResponse.derived.paymentId);
  logDebug('Resource ID:', intentResponse.derived.resourceId);
  logDebug('Input payer:', intentResponse.input.payer);
  logDebug('Derived intent payer:', intentResponse.derived.intent.payer);
  logDebug('Intent object:', intentResponse.derived.intent);

  // Log signing hints - the API may provide pre-computed values we should use
  logDebug('\n🔐 API Signing Hints:');
  logDebug('   signing object:', intentResponse.signing);
  logDebug('   hints object:', intentResponse.hints);
  if (intentResponse.signing) {
    logDebug('   signing.witnessDigest:', (intentResponse.signing as any).witnessDigest);
    logDebug('   signing.domainSeparator:', (intentResponse.signing as any).domainSeparator);
    logDebug('   signing.schemeId:', (intentResponse.signing as any).schemeId);
  }
  if (intentResponse.derived) {
    logDebug('   derived.intentHash:', intentResponse.derived.intentHash);
    logDebug('   derived.witness:', (intentResponse.derived as any).witness);
  }

  const selectedScheme = (intentResponse.hints?.schemeSelected ??
    intentResponse.input.scheme ??
    intentResponse.input.schemeRequested ??
    'permit2') as 'permit2' | 'eip2612' | 'eip3009' | 'aa_push';
  logInfo('Selected scheme (API):', selectedScheme);
  if (selectedScheme === 'aa_push') {
    throw new Error('Gasless flow requires permit-based schemes (permit2/eip2612/eip3009)');
  }

  // Use the API's amount as the canonical source of truth
  // This ensures consistency between intent and signatures
  const apiAmountWei = intentResponse.derived.intent.amount;
  const apiAmountBigInt = BigInt(apiAmountWei);

  // Verify amounts match (for debugging)
  const localAmountWei = amountWei.toString();
  if (apiAmountWei !== localAmountWei) {
    console.warn('⚠️ Amount mismatch between local and API:');
    console.warn('   Local:', localAmountWei, `(${decimalsNum} decimals)`);
    console.warn('   API:', apiAmountWei);
    console.warn('   Using API amount for consistency.');
  }

  // Canonical reference for invoice payments (matches API server format)
  const canonicalReference = `invoice:${params.invoiceId}`;

  // ==========================================================================
  // CRITICAL: Use router domain from API response, not hardcoded values!
  // ==========================================================================
  const apiRouterDomain = intentResponse.signing?.routerDomain;
  if (apiRouterDomain) {
    logDebug('🔐 Using router domain FROM API:');
    logDebug('   name:', apiRouterDomain.name);
    logDebug('   version:', apiRouterDomain.version);
    logDebug('   chainId:', apiRouterDomain.chainId);
    logDebug('   verifyingContract:', apiRouterDomain.verifyingContract);
  } else {
    console.warn('⚠️  API did not return router domain - using defaults');
  }

  const routerAddress = apiRouterDomain?.verifyingContract ?? config.contracts.bnbPayRouter;

  const apiPermit2WitnessTypeString = intentResponse.signing?.permit2WitnessTypeString;
  const apiPermit2WitnessMode = intentResponse.signing?.permit2WitnessMode;
  if (apiPermit2WitnessMode && apiPermit2WitnessMode !== 'struct_hash') {
    throw new Error(`Unsupported Permit2 witness mode: ${apiPermit2WitnessMode}`);
  }
  if (apiPermit2WitnessTypeString) {
    logDebug('🔐 Using Permit2 witnessTypeString FROM API:');
    logDebug('   witnessTypeString:', apiPermit2WitnessTypeString);
  } else {
    console.warn('⚠️  API did not return Permit2 witnessTypeString - using defaults');
  }

  // Build witness object from API response
  // The API doesn't return witness directly - we need to construct it
  // Witness = FlexWitness { schemeId, intentHash, payer, salt }
  const schemeIdHash = ethers.keccak256(ethers.toUtf8Bytes(selectedScheme)); // Hash of scheme name

  // Pad salt to 32 bytes if needed (API may return shorter salt)
  const saltPadded = ethers.zeroPadValue(intentResponse.input.salt, 32);

  // Verify payer consistency
  if (intentResponse.input.payer.toLowerCase() !== payerAddress.toLowerCase()) {
    console.error('❌ CRITICAL: Payer mismatch!');
    console.error('   API payer:', intentResponse.input.payer);
    console.error('   Signer address:', payerAddress);
    throw new Error(`Payer mismatch: API returned ${intentResponse.input.payer} but signer is ${payerAddress}`);
  }

  // Use checksummed payer address for consistency
  const normalizedPayer = ethers.getAddress(payerAddress);

  const normalizedWitness = {
    schemeId: schemeIdHash,
    intentHash: intentResponse.derived.intentHash,
    payer: normalizedPayer, // Use normalized payer address
    salt: saltPadded,
  };

  logDebug('Constructed witness:', normalizedWitness);

  // Set deadline (1 hour from now)
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Check token capabilities for diagnostics (API already selected the scheme)
  const hasEIP3009 = await supportsEIP3009(params.tokenAddress, params.provider);
  const hasEIP2612 = await supportsEIP2612(params.tokenAddress, params.provider);
  logDebug(`Token ${params.paymentToken} supports EIP-3009:`, hasEIP3009);
  logDebug(`Token ${params.paymentToken} supports EIP-2612:`, hasEIP2612);
  if (selectedScheme === 'eip3009' && !hasEIP3009) {
    console.warn('⚠️ API selected eip3009 but token check failed locally.');
  }
  if (selectedScheme === 'eip2612' && !hasEIP2612) {
    console.warn('⚠️ API selected eip2612 but token check failed locally.');
  }

  let relayRequest: RelayPaymentRequest;

  if (selectedScheme === 'eip3009') {
    // Use EIP-3009 TransferWithAuthorization (most efficient - direct transfer)
    logInfo('Using EIP-3009 TransferWithAuthorization for gasless payment...');

    // EIP-3009 uses validAfter/validBefore instead of deadline
    const validAfter = 0; // Valid immediately
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour

    // Generate random nonce for EIP-3009
    const authNonce = generateEIP3009Nonce();

    const eip3009Sig = await signEIP3009({
      tokenAddress: params.tokenAddress,
      to: routerAddress,
      amount: apiAmountBigInt,
      validAfter,
      validBefore,
      nonce: authNonce,
      chainId: config.chainIdNumber,
      tokenName,
      signer: params.signer,
    });

    // Build witness signature using normalized witness
    const witnessSignature = await params.signer.signTypedData(
      {
        name: 'BNBPayRouter',
        version: '1',
        chainId: config.chainIdNumber,
        verifyingContract: routerAddress,
      },
      {
        FlexWitness: [
          { name: 'schemeId', type: 'bytes32' },
          { name: 'intentHash', type: 'bytes32' },
          { name: 'payer', type: 'address' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      normalizedWitness
    );

    // Build relay intent for EIP-3009 payment
    const relayIntent = {
      paymentId: intentResponse.derived.intent.paymentId,
      merchant: intentResponse.derived.intent.merchant,
      token: intentResponse.derived.intent.token,
      amount: intentResponse.derived.intent.amount,
      deadline: intentResponse.derived.intent.deadline,
      resourceId: intentResponse.derived.intent.resourceId,
      payer: normalizedPayer,
    };

    relayRequest = {
      network: networkKey as NetworkKey,
      scheme: 'eip3009',
      intent: relayIntent,
      witness: normalizedWitness,
      witnessSignature,
      reference: canonicalReference,
      eip3009: {
        validAfter,
        validBefore,
        authNonce,
        v: eip3009Sig.v,
        r: eip3009Sig.r,
        s: eip3009Sig.s,
      },
    };
  } else if (selectedScheme === 'eip2612') {
    // Use EIP-2612 permit (native token permit)
    logInfo('Using EIP-2612 permit for gasless payment...');

    const nonce = await getEIP2612Nonce(params.tokenAddress, payerAddress, params.provider);

    const permitSig = await signEIP2612({
      tokenAddress: params.tokenAddress,
      amount: apiAmountBigInt, // Use API amount for consistency
      spender: routerAddress,
      deadline,
      nonce,
      chainId: config.chainIdNumber,
      tokenName,
      signer: params.signer,
    });

    // Build witness signature using normalized witness (no BigInt)
    const witnessSignature = await params.signer.signTypedData(
      {
        name: 'BNBPayRouter',
        version: '1',
        chainId: config.chainIdNumber,
        verifyingContract: routerAddress,
      },
      {
        FlexWitness: [
          { name: 'schemeId', type: 'bytes32' },
          { name: 'intentHash', type: 'bytes32' },
          { name: 'payer', type: 'address' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      normalizedWitness
    );

    // Build relay intent for EIP-2612 payment
    // CRITICAL: Must include payer to prevent server from defaulting to ZeroAddress
    // Server validation schema allows payer (optional), and uses it if provided
    const relayIntent = {
      paymentId: intentResponse.derived.intent.paymentId,
      merchant: intentResponse.derived.intent.merchant,
      token: intentResponse.derived.intent.token,
      amount: intentResponse.derived.intent.amount,
      deadline: intentResponse.derived.intent.deadline,
      resourceId: intentResponse.derived.intent.resourceId,
      payer: normalizedPayer, // MUST match witness.payer
      // referenceHash omitted - computed by server from reference string
    };

    relayRequest = {
      network: networkKey as NetworkKey,
      scheme: 'eip2612',
      intent: relayIntent,
      witness: normalizedWitness,
      witnessSignature,
      reference: canonicalReference,
      eip2612: {
        deadline,
        v: permitSig.v,
        r: permitSig.r,
        s: permitSig.s,
      },
    };
  } else {
    // Use Permit2 (universal ERC20 permit)
    logInfo('Using Permit2 for gasless payment...');

    // Get network-specific Permit2 address
    const permit2Address = getPermit2Address(params.network);
    logInfo('Using Permit2 address:', permit2Address);

    // DEBUG: Check which domain format the Permit2 contract uses
    try {
      const domainDebug = await debugPermit2Domain(params.provider, params.network);
      if (domainDebug.matches === 'none') {
        console.error('⚠️ WARNING: Domain separator mismatch! The Permit2 contract uses a different domain format than expected.');
      }
    } catch (e) {
      console.warn('Could not debug Permit2 domain:', e);
    }

    // Check if Permit2 is already approved for this token
    const hasPermit2Approval = await isPermit2Approved(
      params.tokenAddress,
      payerAddress,
      params.provider,
      params.network
    );
    logInfo('Permit2 already approved:', hasPermit2Approval);

    const nonce = await getPermit2Nonce(payerAddress, params.provider, params.network);

    // Sign Permit2 WITH witness - BNBPayRouter uses permitWitnessTransferFrom
    // CRITICAL: witness must be bytes32 (FlexWitness struct hash)
    const permit2Sig = await signPermit2WithWitness({
      tokenAddress: params.tokenAddress,
      amount: apiAmountBigInt, // Use API amount for consistency
      spender: routerAddress,
      deadline,
      nonce,
      chainId: config.chainIdNumber,
      permit2Address, // Use network-specific Permit2 address
      permit2WitnessTypeString: apiPermit2WitnessTypeString,
      witness: normalizedWitness,
      signer: params.signer,
    });

    // Build witness signature using normalized witness (no BigInt)
    // This is separate from the Permit2 signature - it signs the witness for the router
    // CRITICAL: Use API-provided domain if available!
    const witnessSignatureDomain = apiRouterDomain || {
      name: 'BNBPayRouter',
      version: '1',
      chainId: config.chainIdNumber,
      verifyingContract: routerAddress,
    };
    logDebug('🔐 Witness signature domain:', witnessSignatureDomain);

    const witnessSignature = await params.signer.signTypedData(
      witnessSignatureDomain,
      {
        FlexWitness: [
          { name: 'schemeId', type: 'bytes32' },
          { name: 'intentHash', type: 'bytes32' },
          { name: 'payer', type: 'address' },
          { name: 'salt', type: 'bytes32' },
        ],
      },
      normalizedWitness
    );

    // Build relay intent for Permit2 payment
    // CRITICAL: Must include payer to prevent server from defaulting to ZeroAddress
    // Server validation schema allows payer (optional), and uses it if provided
    const relayIntent = {
      paymentId: intentResponse.derived.intent.paymentId,
      merchant: intentResponse.derived.intent.merchant,
      token: intentResponse.derived.intent.token,
      amount: intentResponse.derived.intent.amount,
      deadline: intentResponse.derived.intent.deadline,
      resourceId: intentResponse.derived.intent.resourceId,
      payer: normalizedPayer, // MUST match witness.payer
      // referenceHash omitted - computed by server from reference string
    };

    const permit2Data = {
      permit: {
        permitted: {
          token: params.tokenAddress,
          amount: apiAmountWei, // Use API amount for consistency
        },
        nonce,
        deadline,
      },
      transferDetails: {
        to: routerAddress, // Router address, not merchant
        requestedAmount: apiAmountWei, // Use API amount for consistency
      },
      signature: permit2Sig,
    };

    if (!hasPermit2Approval) {
      // Permit2 not approved - need to check if user has gas for first-time approval
      logInfo('⚠️ Permit2 not approved for this token. Checking options...');

      // Check user's BNB balance
      const bnbBalance = await params.provider.getBalance(payerAddress);
      const minGasRequired = ethers.parseEther('0.001'); // ~0.001 BNB for approval tx

      if (bnbBalance < minGasRequired) {
        // User has no gas - cannot do Permit2 bundle flow
        // The bundle requires signing a raw transaction which needs gas estimation
        console.error('❌ Cannot use Permit2 gasless: No BNB for first-time approval');
        console.error('   BNB Balance:', ethers.formatEther(bnbBalance));
        console.error('   Required: ~0.001 BNB for one-time Permit2 approval');

        throw new Error(
          `First-time Permit2 setup requires ~0.001 BNB for the approval transaction. ` +
          `After this one-time approval, all future ${params.paymentToken} payments will be truly gasless. ` +
          `Get testnet BNB from: https://testnet.bnbchain.org/faucet-smart`
        );
      }

      // User has gas - proceed with bundle flow
      logInfo('🔄 Using Permit2 bundle flow (approve + pay)...');
      logDebug('   User BNB balance:', ethers.formatEther(bnbBalance));

      // Create and sign the approval transaction
      const erc20Interface = new ethers.Interface([
        'function approve(address spender, uint256 amount) external returns (bool)',
      ]);
      const approveData = erc20Interface.encodeFunctionData('approve', [
        permit2Address,
        ethers.MaxUint256,
      ]);

      // Get current nonce and gas price for the approval tx
      const txNonce = await params.provider.getTransactionCount(payerAddress, 'pending');
      const feeData = await params.provider.getFeeData();

      // Build the approval transaction
      const approveTx = {
        to: params.tokenAddress,
        data: approveData,
        nonce: txNonce,
        chainId: config.chainIdNumber,
        gasLimit: 100000n, // Standard approve gas
        maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits('5', 'gwei'),
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'),
        type: 2, // EIP-1559
      };

      logDebug('Signing approval transaction...');
      let signedApproveTx: string;
      try {
        signedApproveTx = await params.signer.signTransaction(approveTx);
        logDebug('Approval tx signed:', signedApproveTx.slice(0, 66) + '...');
      } catch (signError: any) {
        // MetaMask and some wallets don't support eth_signTransaction
        // Fall back to asking user to approve manually
        console.error('❌ Wallet does not support eth_signTransaction');
        console.error('   This is common with MetaMask. Falling back to manual approval...');

        // Try to do the approval as a regular transaction
        logInfo('📝 Requesting manual Permit2 approval...');
        const erc20 = new ethers.Contract(
          params.tokenAddress,
          ['function approve(address spender, uint256 amount) external returns (bool)'],
          params.signer
        );

        try {
          const approveTxResponse = await erc20.approve(permit2Address, ethers.MaxUint256);
          logInfo('⏳ Waiting for approval confirmation...');
          await approveTxResponse.wait();
          logInfo('✅ Permit2 approved! Now proceeding with gasless payment...');

          // After approval, use the regular relay flow
          relayRequest = {
            network: networkKey as NetworkKey,
            scheme: 'permit2',
            intent: relayIntent,
            witness: normalizedWitness,
            witnessSignature,
            reference: canonicalReference,
            permit2: permit2Data,
          };

          // Skip to the relay submission below
          logInfo('Submitting gasless payment to relay...');
          logInfo('Scheme:', relayRequest.scheme);
          logInfo('Payment ID:', relayRequest.intent.paymentId);

          const relayResponse = await relayPayment(relayRequest);

          logInfo('✅ Gasless payment relayed successfully');
          logInfo('Transaction Hash:', relayResponse.txHash);
          logInfo('Payment ID:', relayResponse.paymentId);

          return {
            txHash: relayResponse.txHash,
            paymentId: relayResponse.paymentId,
          };
        } catch (approveError: any) {
          console.error('❌ Manual approval failed:', approveError.message);
          throw new Error(
            `Permit2 approval failed: ${approveError.message}. ` +
            `You need ~0.001 BNB for this one-time approval.`
          );
        }
      }

      // Get current block for targeting
      const currentBlock = await params.provider.getBlockNumber();

      // Build bundle request
      const bundleRequest: Permit2BundleRequest = {
        network: networkKey as NetworkKey,
        intent: relayIntent,
        witness: normalizedWitness,
        witnessSignature,
        reference: canonicalReference,
        permit2: permit2Data,
        approvalTx: signedApproveTx,
        targetBlock: currentBlock + 2, // Target 2 blocks ahead
        maxBlockNumber: currentBlock + 10, // Valid for next 10 blocks
        minTimestamp: Math.floor(Date.now() / 1000),
        maxTimestamp: Math.floor(Date.now() / 1000) + 600, // 10 minutes
      };

      logInfo('Submitting Permit2 bundle to relay...');
      logDebug('Bundle request:', {
        ...bundleRequest,
        approvalTx: bundleRequest.approvalTx.slice(0, 66) + '...',
        witnessSignature: bundleRequest.witnessSignature.slice(0, 66) + '...',
      });

      // Submit bundle
      let bundleResponse;
      try {
        bundleResponse = await relayPermit2Bundle(bundleRequest);

        logInfo('✅ Permit2 bundle accepted');
        logInfo('Bundle ID:', bundleResponse.bundleId);
        logInfo('Target Block:', bundleResponse.targetBlock);
        logInfo('Payment ID:', bundleResponse.paymentId);

        // Note: Bundle may take a few blocks to be included
        // Return bundleId as txHash for now - caller should poll for confirmation
        return {
          txHash: bundleResponse.bundleId, // Bundle ID until tx is mined
          paymentId: bundleResponse.paymentId,
        };
      } catch (error: any) {
        console.error('❌ Permit2 bundle relay failed:', error);
        console.error('Error details:', error.details);

        // Check if bundle RPC isn't configured - fall back to manual approval flow
        const errorMessage = error.details?.error || error.message || '';
        if (errorMessage.includes('bundleRpc not configured') || errorMessage.includes('not supported')) {
          logInfo('📝 Bundle RPC not available, falling back to manual approval flow...');

          // Broadcast the signed approval transaction directly
          logInfo('⏳ Broadcasting approval transaction...');
          try {
            const txResponse = await params.provider.broadcastTransaction(signedApproveTx);
            logInfo('📤 Approval tx broadcast:', txResponse.hash);

            logInfo('⏳ Waiting for approval confirmation...');
            const receipt = await txResponse.wait();
            logInfo('✅ Permit2 approved! Tx:', receipt?.hash);

            // Now proceed with regular gasless relay
            logInfo('🚀 Proceeding with gasless payment via relay...');

            relayRequest = {
              network: networkKey as NetworkKey,
              scheme: 'permit2',
              intent: relayIntent,
              witness: normalizedWitness,
              witnessSignature,
              reference: canonicalReference,
              permit2: permit2Data,
            };

            const relayResponse = await relayPayment(relayRequest);

            logInfo('✅ Gasless payment relayed successfully');
            logInfo('Transaction Hash:', relayResponse.txHash);
            logInfo('Payment ID:', relayResponse.paymentId);

            return {
              txHash: relayResponse.txHash,
              paymentId: relayResponse.paymentId,
            };
          } catch (broadcastError: any) {
            console.error('❌ Failed to broadcast approval:', broadcastError);
            throw new Error(`Approval failed: ${broadcastError.message}`);
          }
        }

        // Other error - rethrow
        throw error;
      }
    } else {
      // Use regular relay endpoint (Permit2 already approved)
      logInfo('✓ Permit2 already approved, using regular relay...');

      relayRequest = {
        network: networkKey as NetworkKey,
        scheme: 'permit2',
        intent: relayIntent,
        witness: normalizedWitness,
        witnessSignature,
        reference: canonicalReference,
        permit2: permit2Data,
      };
    }

    // ========== COMPREHENSIVE BACKEND DEBUG ==========
    logDebug('\n' + '='.repeat(70));
    logDebug('🔧 BACKEND DEBUG: Values for Permit2.permitWitnessTransferFrom()');
    logDebug('='.repeat(70));

    // Compute the witness struct hash
    const witnessStructHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
        [FLEX_WITNESS_TYPEHASH, normalizedWitness.schemeId, normalizedWitness.intentHash, normalizedWitness.payer, normalizedWitness.salt]
      )
    );

    const permit2WitnessTypeString = apiPermit2WitnessTypeString ?? PERMIT2_WITNESS_TYPESTRING;
    const fullTypeStringWithWitness = `${PERMIT_WITNESS_TYPEHASH_STUB}${permit2WitnessTypeString}`;
    const typeHashWithWitness =
      permit2WitnessTypeString === PERMIT2_WITNESS_TYPESTRING
        ? PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_WITH_WITNESS
        : ethers.keccak256(ethers.toUtf8Bytes(fullTypeStringWithWitness));
    const fullTypeStringLegacy = FULL_PERMIT2_TYPE_STRING_LEGACY;

    logDebug('\n📋 Permit2 Call Parameters:');
    logDebug('   permit.permitted.token:', params.tokenAddress);
    logDebug('   permit.permitted.amount:', apiAmountWei);
    logDebug('   permit.nonce:', nonce);
    logDebug('   permit.deadline:', deadline);
    logDebug('   transferDetails.to:', routerAddress);
    logDebug('   transferDetails.requestedAmount:', apiAmountWei);
    logDebug('   owner:', normalizedPayer);

    logDebug('\n🔐 Witness Parameters:');
    logDebug('   witness (bytes32 - FlexWitness struct hash):', witnessStructHash);
    logDebug('   witnessTypeString:', permit2WitnessTypeString);

    logDebug('\n📝 FlexWitness Data:');
    logDebug('   schemeId:', normalizedWitness.schemeId);
    logDebug('   intentHash:', normalizedWitness.intentHash);
    logDebug('   payer:', normalizedWitness.payer);
    logDebug('   salt:', normalizedWitness.salt);
    logDebug('   struct hash:', witnessStructHash);

    logDebug('\n🔍 Type Hashes:');
    logDebug('   Type string used for hash (with witnessTypeString):', fullTypeStringWithWitness);
    logDebug('   Type hash (with witnessTypeString):', typeHashWithWitness);
    logDebug('   Full type string (legacy):', fullTypeStringLegacy);
    logDebug('   Type hash (legacy):', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH_LEGACY);
    logDebug('   FlexWitness type hash:', FLEX_WITNESS_TYPEHASH);
    logDebug('   TokenPermissions type hash:', TOKEN_PERMISSIONS_TYPEHASH);

    logDebug('\n🔧 Domain Separators:');
    logDebug('   Permit2 domain separator:', computePermit2DomainSeparator(config.chainIdNumber, permit2Address));

    logDebug('\n' + '='.repeat(70));
    logDebug('⚠️  Frontend signs Permit2 with FlexWitness struct hash (bytes32)');
    logDebug('='.repeat(70) + '\n');
  }

  logInfo('Submitting gasless payment to relay...');
  logInfo('Scheme:', relayRequest.scheme);
  logInfo('Payment ID:', relayRequest.intent.paymentId);
  logDebug('Full relay request:', relayRequest);

  // Submit to relay
  let relayResponse;
  try {
    relayResponse = await relayPayment(relayRequest);
  } catch (error: any) {
    console.error('❌ Relay payment failed:', error);
    console.error('Error details:', error.details);
    console.error('Full error:', JSON.stringify(error, null, 2));
    throw error;
  }

  logInfo('✅ Gasless payment relayed successfully');
  logInfo('Transaction Hash:', relayResponse.txHash);
  logInfo('Payment ID:', relayResponse.paymentId);

  return {
    txHash: relayResponse.txHash,
    paymentId: relayResponse.paymentId,
  };
}

/**
 * Check if Permit2 is approved for a token
 */
export async function isPermit2Approved(
  tokenAddress: string,
  owner: string,
  provider: ethers.Provider,
  network: NetworkType = 'testnet'
): Promise<boolean> {
  try {
    const permit2Address = getPermit2Address(network);
    const erc20 = new ethers.Contract(
      tokenAddress,
      ['function allowance(address owner, address spender) external view returns (uint256)'],
      provider
    );
    const allowance = await erc20.allowance(owner, permit2Address);
    // Consider approved if allowance is at least 1 token (could be max uint256)
    return allowance > 0n;
  } catch {
    return false;
  }
}

/**
 * Approve Permit2 for a token (one-time setup per token)
 */
export async function approvePermit2(
  tokenAddress: string,
  signer: ethers.Signer,
  network: NetworkType = 'testnet'
): Promise<string> {
  const permit2Address = getPermit2Address(network);
  const erc20 = new ethers.Contract(
    tokenAddress,
    ['function approve(address spender, uint256 amount) external returns (bool)'],
    signer
  );

  // Approve max uint256 for convenience (standard practice with Permit2)
  const maxApproval = ethers.MaxUint256;
  const tx = await erc20.approve(permit2Address, maxApproval);
  await tx.wait();

  return tx.hash;
}
