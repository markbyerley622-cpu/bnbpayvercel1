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

  console.log('🔍 Permit2 Domain Separator Debug:');
  console.log('   Contract address:', permit2Address);
  console.log('   Chain ID:', chainId);
  console.log('   Actual from contract:', actual);
  console.log('   Computed (no version):', withoutVersion);
  console.log('   Computed (with version):', withVersion);
  console.log('   Matches:', matches);

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

// The router passes this witnessTypeString to Permit2:
// "FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)"
//
// Permit2 constructs the FULL type string by prepending its stub:
// "PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)"
//
// CRITICAL: Permit2 uses the FlexWitness TYPE STRING but encodes the witness as raw bytes32!
// This is non-standard EIP-712 behavior that ethers.js signTypedData cannot handle.
// We must manually compute the hash.

const FLEX_WITNESS_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)'
));

const TOKEN_PERMISSIONS_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  'TokenPermissions(address token,uint256 amount)'
));

// This MUST match what Permit2 computes
// CRITICAL: Permit2 expects "bytes32 witness" NOT "FlexWitness witness"
// The FlexWitness type definition is appended separately but the field type is bytes32
// Correct type hash: 0xf258281914ea0c81436e968596df9b9d8ad0d63c784c7fb7d3fd7fd073d70cdf
const FULL_PERMIT2_TYPE_STRING = 'PermitWitnessTransferFrom(TokenPermissions permitted,address spender,uint256 nonce,uint256 deadline,bytes32 witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)';

const PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(FULL_PERMIT2_TYPE_STRING));

// Log these at module load for debugging
console.log('🔐 Permit2 Type String Constants:');
console.log('   Full type string:', FULL_PERMIT2_TYPE_STRING);
console.log('   Type hash:', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH);
console.log('   Expected type hash: 0xf258281914ea0c81436e968596df9b9d8ad0d63c784c7fb7d3fd7fd073d70cdf');
console.log('   Type hash matches:', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH === '0xf258281914ea0c81436e968596df9b9d8ad0d63c784c7fb7d3fd7fd073d70cdf' ? '✅ YES' : '❌ NO');

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
  try {
    const permit2Address = getPermit2Address(network);
    const permit2 = new ethers.Contract(
      permit2Address,
      ['function nonces(address owner) external view returns (uint256)'],
      provider
    );
    const nonce = await permit2.nonces(owner);
    return nonce.toString();
  } catch (error) {
    console.error('Failed to get Permit2 nonce (contract may not be deployed on this network):', error);
    // Permit2 uses a deterministic nonce based on the token and amount
    // For the first use, nonce is typically 0, but we'll use a random value
    // The nonce is part of the Permit2 signature and prevents replays
    const randomNonce = ethers.toBigInt(ethers.randomBytes(32));
    console.log('Using random nonce:', randomNonce.toString());
    return randomNonce.toString();
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

  console.log('🔐 Witness Struct Hash (for debug):');
  console.log('   Witness:', JSON.stringify(witness, null, 2));
  console.log('   Struct hash:', structHash);

  return structHash;
}

/**
 * Sign Permit2 PermitWitnessTransferFrom for BNBPayRouter
 *
 * Per senior dev guidance:
 * - Permit2 typed data must use witness: bytes32 (NOT FlexWitness)
 * - witness value must be the router EIP-712 digest (witnessDigest)
 * - witnessDigest = hashTypedDataV4(routerDomain, FlexWitnessTypes, witness)
 *
 * Hash computation:
 * 1. Compute witnessDigest using router domain + FlexWitness struct
 * 2. Sign Permit2 typed data with witness: witnessDigest (bytes32)
 */
export async function signPermit2WithWitness(params: {
  tokenAddress: string;
  amount: bigint;
  spender: string; // Router address
  deadline: number;
  nonce: string;
  chainId: number;
  permit2Address: string; // Network-specific Permit2 address
  routerAddress: string; // Router address for computing witnessDigest
  routerDomain?: {  // Optional: API-provided router domain (preferred over hardcoded)
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
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
  console.log('🔐 Raw Witness Values:');
  console.log('   schemeId:', params.witness.schemeId);
  console.log('   intentHash:', params.witness.intentHash);
  console.log('   payer:', params.witness.payer);
  console.log('   salt:', params.witness.salt);

  // Ensure bytes32 values are properly padded
  const schemeId = ethers.zeroPadValue(params.witness.schemeId, 32);
  const intentHash = ethers.zeroPadValue(params.witness.intentHash, 32);
  const salt = ethers.zeroPadValue(params.witness.salt, 32);
  const payer = ethers.getAddress(params.witness.payer); // Normalize address

  console.log('🔐 Normalized Witness Values:');
  console.log('   schemeId:', schemeId);
  console.log('   intentHash:', intentHash);
  console.log('   payer:', payer);
  console.log('   salt:', salt);

  // Create normalized witness object
  const normalizedWitness = { schemeId, intentHash, payer, salt };

  // ==========================================================================
  // STEP 1: Compute FlexWitness struct hash (for router domain)
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

  console.log('🔐 FlexWitness Struct Hash Comparison:');
  console.log('   ethers hashStruct:', witnessStructHashEthers);
  console.log('   manual ABI encode:', witnessStructHashManual);
  console.log('   Match:', witnessStructHashEthers === witnessStructHashManual ? '✅ YES' : '❌ NO');

  // If they don't match, log detailed encoding
  if (witnessStructHashEthers !== witnessStructHashManual) {
    console.log('🔍 DEBUG: Struct hash mismatch - checking type hash...');
    // Get ethers internal type hash for comparison
    const encoder = ethers.TypedDataEncoder.from(FLEX_WITNESS_TYPES);
    // Log the encoded types
    console.log('   ethers encodeType:', encoder.encodeType('FlexWitness'));
  }

  console.log('   our FLEX_WITNESS_TYPEHASH:', FLEX_WITNESS_TYPEHASH);

  // Use whichever is correct (prefer ethers as it's the standard)
  const witnessStructHash = witnessStructHashEthers;

  // ==========================================================================
  // STEP 2: Compute router domain separator
  // CRITICAL: Use API-provided domain if available, otherwise fall back to defaults
  // ==========================================================================

  // Use API-provided domain if available (PREFERRED!)
  const routerDomainName = params.routerDomain?.name || 'BNBPayRouter';
  const routerDomainVersion = params.routerDomain?.version || '1';
  const routerDomainChainId = params.routerDomain?.chainId || params.chainId;
  const routerDomainContract = params.routerDomain?.verifyingContract || params.routerAddress;

  console.log('🔐 Router Domain Configuration:');
  console.log('   Source:', params.routerDomain ? '✅ FROM API' : '⚠️ HARDCODED DEFAULTS');
  console.log('   name:', routerDomainName);
  console.log('   version:', routerDomainVersion);
  console.log('   chainId:', routerDomainChainId);
  console.log('   verifyingContract:', routerDomainContract);

  // Method A: Using ethers TypedDataEncoder
  const routerDomainForSep = {
    name: routerDomainName,
    version: routerDomainVersion,
    chainId: routerDomainChainId,
    verifyingContract: routerDomainContract,
  };
  const routerDomainSeparatorEthers = ethers.TypedDataEncoder.hashDomain(routerDomainForSep);

  // Method B: Manual computation
  const routerDomainSeparator = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [
        ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
        ethers.keccak256(ethers.toUtf8Bytes(routerDomainName)),
        ethers.keccak256(ethers.toUtf8Bytes(routerDomainVersion)),
        routerDomainChainId,
        routerDomainContract,
      ]
    )
  );

  console.log('🔐 Router domain separator (ethers):', routerDomainSeparatorEthers);
  console.log('🔐 Router domain separator (manual):', routerDomainSeparator);
  console.log('🔐 Router domain separators match:', routerDomainSeparatorEthers === routerDomainSeparator ? '✅ YES' : '❌ NO');

  // ==========================================================================
  // CRITICAL: Query router contract for its actual domain separator and type hash
  // ==========================================================================
  try {
    const provider = params.signer.provider;
    if (provider) {
      const routerContract = new ethers.Contract(
        params.routerAddress,
        [
          'function DOMAIN_SEPARATOR() external view returns (bytes32)',
          'function FLEX_WITNESS_TYPEHASH() external view returns (bytes32)',
        ],
        provider
      );

      try {
        const onChainRouterDomainSep = await routerContract.DOMAIN_SEPARATOR();
        console.log('🔐 Router DOMAIN_SEPARATOR (on-chain):', onChainRouterDomainSep);
        console.log('🔐 Router domain separator matches on-chain:', onChainRouterDomainSep === routerDomainSeparatorEthers ? '✅ YES' : '❌ NO - THIS IS THE PROBLEM!');
      } catch (e: any) {
        console.warn('   Could not fetch router DOMAIN_SEPARATOR:', e.message);
      }

      try {
        const onChainFlexWitnessTypeHash = await routerContract.FLEX_WITNESS_TYPEHASH();
        console.log('🔐 Router FLEX_WITNESS_TYPEHASH (on-chain):', onChainFlexWitnessTypeHash);
        console.log('🔐 Our FLEX_WITNESS_TYPEHASH:', FLEX_WITNESS_TYPEHASH);
        console.log('🔐 FLEX_WITNESS_TYPEHASH matches:', onChainFlexWitnessTypeHash === FLEX_WITNESS_TYPEHASH ? '✅ YES' : '❌ NO - THIS IS THE PROBLEM!');
      } catch (e: any) {
        console.warn('   Could not fetch router FLEX_WITNESS_TYPEHASH:', e.message);
      }
    }
  } catch (e: any) {
    console.warn('   Could not query router contract:', e.message);
  }

  // ==========================================================================
  // STEP 3: Compute witnessDigest (router's EIP-712 hash of FlexWitness)
  // This is what the router passes to Permit2 as the witness bytes32
  // ==========================================================================

  // Method A: Using ethers TypedDataEncoder (should match router exactly)
  // Use the same domain values as computed in STEP 2
  const routerDomain = routerDomainForSep;
  const witnessDigestEthers = ethers.TypedDataEncoder.hash(routerDomain, FLEX_WITNESS_TYPES, normalizedWitness);

  // Method B: Manual computation using ethers struct hash + ethers domain separator
  const witnessDigestManualWithEthers = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', routerDomainSeparatorEthers, witnessStructHash]
    )
  );

  // Method C: Fully manual computation
  const witnessDigestManual = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', routerDomainSeparator, witnessStructHashManual]
    )
  );

  console.log('🔐 Witness Digest Comparison:');
  console.log('   ethers TypedDataEncoder.hash:', witnessDigestEthers);
  console.log('   manual with ethers hashes:', witnessDigestManualWithEthers);
  console.log('   fully manual:', witnessDigestManual);
  console.log('   ethers vs manualWithEthers:', witnessDigestEthers === witnessDigestManualWithEthers ? '✅ YES' : '❌ NO');
  console.log('   ethers vs fullyManual:', witnessDigestEthers === witnessDigestManual ? '✅ YES' : '❌ NO');

  // Use ethers method as it's the standard
  const witnessDigest = witnessDigestEthers;

  // ==========================================================================
  // STEP 4: Compute Permit2 domain separator (NO VERSION!)
  // ==========================================================================
  const permit2DomainSeparator = computePermit2DomainSeparator(params.chainId, params.permit2Address);
  const permit2DomainSeparatorWithVersion = computePermit2DomainSeparatorWithVersion(params.chainId, params.permit2Address);

  console.log('🔐 Permit2 Domain Separator:');
  console.log('   computed (no version):', permit2DomainSeparator);
  console.log('   computed (with version):', permit2DomainSeparatorWithVersion);

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
      console.log('   on-chain:', onChainDomainSep);
      console.log('   matches (no version):', onChainDomainSep === permit2DomainSeparator ? '✅ YES' : '❌ NO');
      console.log('   matches (with version):', onChainDomainSep === permit2DomainSeparatorWithVersion ? '✅ YES' : '❌ NO');

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
  console.log('🔐 TokenPermissions hash:', tokenPermissionsHash);

  // ==========================================================================
  // STEP 6: Compute PermitWitnessTransferFrom struct hash
  // CRITICAL: Uses PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH which includes FlexWitness
  // but witness is encoded as raw bytes32 (witnessDigest)
  // ==========================================================================
  console.log('🔐 Message Struct Hash Encoding:');
  console.log('   PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH:', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH);
  console.log('   tokenPermissionsHash:', tokenPermissionsHash);
  console.log('   spender:', params.spender);
  console.log('   nonce:', params.nonce, '(type:', typeof params.nonce, ')');
  console.log('   deadline:', params.deadline, '(type:', typeof params.deadline, ')');
  console.log('   witnessDigest:', witnessDigest);

  // Debug: Show exact values being encoded
  const encodedValues = [
    PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH,
    tokenPermissionsHash,
    params.spender,
    params.nonce,
    params.deadline,
    witnessDigest,
  ];
  console.log('   Values array:', encodedValues);

  const messageStructHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'address', 'uint256', 'uint256', 'bytes32'],
      encodedValues
    )
  );
  console.log('🔐 Message struct hash:', messageStructHash);

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

  console.log('🔐 Final EIP-712 Digest:');
  console.log('   using domain (no version):', digestNoVersion);
  console.log('   using domain (with version):', digestWithVersion);

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
        console.log('   ✅ Using versioned domain separator (matches on-chain)');
        digest = digestWithVersion;
        useVersionedDomain = true;
      } else if (onChainDomainSep === permit2DomainSeparator) {
        console.log('   ✅ Using non-versioned domain separator (matches on-chain)');
        digest = digestNoVersion;
      } else {
        console.error('   ❌ WARNING: Neither domain separator matches on-chain! Using default (no version)');
      }
    }
  } catch (e: any) {
    console.warn('   Could not verify domain separator, using default (no version):', e.message);
  }

  console.log('   Final digest to sign:', digest);

  // ==========================================================================
  // STEP 8: Sign using signTypedData (preferred) or eth_sign (fallback)
  // ==========================================================================
  console.log('🔐 Permit2 Signing Details:');
  console.log('   Signer address:', signerAddress);
  console.log('   Token:', params.tokenAddress);
  console.log('   Amount:', params.amount.toString());
  console.log('   Spender:', params.spender);
  console.log('   Nonce:', params.nonce);
  console.log('   Deadline:', params.deadline);
  console.log('   Witness digest:', witnessDigest);
  console.log('   Type hash (PERMIT_WITNESS_TRANSFER_FROM):', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH);

  let signature: string;

  // Per senior dev: use signTypedData with witness: bytes32
  // The Permit2 domain may or may not have version depending on deployment
  const permit2Domain = useVersionedDomain
    ? {
        name: PERMIT2_DOMAIN_NAME,
        version: '1',
        chainId: params.chainId,
        verifyingContract: params.permit2Address,
      }
    : {
        name: PERMIT2_DOMAIN_NAME,
        chainId: params.chainId,
        verifyingContract: params.permit2Address,
      };

  console.log('🔐 Using Permit2 domain:', permit2Domain);

  // Types for signTypedData - use NESTED FlexWitness struct
  // ethers will hash the nested struct internally, which is what Permit2 expects
  const permit2Types = {
    PermitWitnessTransferFrom: [
      { name: 'permitted', type: 'TokenPermissions' },
      { name: 'spender', type: 'address' },
      { name: 'nonce', type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
      { name: 'witness', type: 'FlexWitness' },
    ],
    TokenPermissions: [
      { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    FlexWitness: [
      { name: 'schemeId', type: 'bytes32' },
      { name: 'intentHash', type: 'bytes32' },
      { name: 'payer', type: 'address' },
      { name: 'salt', type: 'bytes32' },
    ],
  };

  const permit2Message = {
    permitted: {
      token: params.tokenAddress,
      amount: params.amount.toString(),
    },
    spender: params.spender,
    nonce: params.nonce,
    deadline: params.deadline,
    witness: normalizedWitness, // Pass the actual struct, not the digest
  };

  console.log('📝 Signing with signTypedData (nested FlexWitness)...');
  console.log('   Domain:', JSON.stringify(permit2Domain));
  console.log('   Types:', JSON.stringify(permit2Types));
  console.log('   Message:', JSON.stringify(permit2Message));

  // Log the type string ethers will generate
  const ethersTypeString = ethers.TypedDataEncoder.from(permit2Types).encodeType('PermitWitnessTransferFrom');
  console.log('   ethers type string:', ethersTypeString);
  const ethersTypeHash = ethers.keccak256(ethers.toUtf8Bytes(ethersTypeString));
  console.log('   ethers type hash:', ethersTypeHash);

  try {
    signature = await params.signer.signTypedData(permit2Domain, permit2Types, permit2Message);
    console.log('   Signature:', signature);

    // Verify the signature locally
    const ethersDigest = ethers.TypedDataEncoder.hash(permit2Domain, permit2Types, permit2Message);
    console.log('   ethers computed digest:', ethersDigest);

    // Recover signer
    const recoveredAddress = ethers.recoverAddress(ethersDigest, signature);
    console.log('🔍 LOCAL SIGNATURE VERIFICATION:');
    console.log('   Recovered signer:', recoveredAddress);
    console.log('   Expected signer:', signerAddress);
    if (recoveredAddress.toLowerCase() === signerAddress.toLowerCase()) {
      console.log('   ✅ SIGNATURE VALID locally');
    } else {
      console.error('   ❌ SIGNATURE MISMATCH locally');
    }
  } catch (signError: any) {
    console.error('signTypedData failed:', signError.message);
    throw new Error(`Cannot sign Permit2: ${signError.message}`);
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
      console.log(`Token ${tokenAddress} supports EIP-3009 (transferWithAuthorization found in bytecode)`);
    } else {
      console.log(`Token ${tokenAddress} does not support EIP-3009 (no transferWithAuthorization)`);
    }

    return hasTransferWithAuth;
  } catch (error) {
    console.log(`Token ${tokenAddress} EIP-3009 check failed:`, error);
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

  console.log('Signing EIP-3009 TransferWithAuthorization:', message);

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

  console.log('Building gasless payment intent...');
  console.log('Build request:', {
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

  console.log('Payment intent built successfully');
  console.log('Full response:', intentResponse);
  console.log('Payment ID:', intentResponse.derived.paymentId);
  console.log('Resource ID:', intentResponse.derived.resourceId);
  console.log('Input payer:', intentResponse.input.payer);
  console.log('Derived intent payer:', intentResponse.derived.intent.payer);
  console.log('Intent object:', intentResponse.derived.intent);

  // Log signing hints - the API may provide pre-computed values we should use
  console.log('\n🔐 API Signing Hints:');
  console.log('   signing object:', intentResponse.signing);
  console.log('   hints object:', intentResponse.hints);
  if (intentResponse.signing) {
    console.log('   signing.witnessDigest:', (intentResponse.signing as any).witnessDigest);
    console.log('   signing.domainSeparator:', (intentResponse.signing as any).domainSeparator);
    console.log('   signing.schemeId:', (intentResponse.signing as any).schemeId);
  }
  if (intentResponse.derived) {
    console.log('   derived.intentHash:', intentResponse.derived.intentHash);
    console.log('   derived.witness:', (intentResponse.derived as any).witness);
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
    console.log('🔐 Using router domain FROM API:');
    console.log('   name:', apiRouterDomain.name);
    console.log('   version:', apiRouterDomain.version);
    console.log('   chainId:', apiRouterDomain.chainId);
    console.log('   verifyingContract:', apiRouterDomain.verifyingContract);
  } else {
    console.warn('⚠️  API did not return router domain - using defaults');
  }

  // Build witness object from API response
  // The API doesn't return witness directly - we need to construct it
  // Witness = FlexWitness { schemeId, intentHash, payer, salt }
  const schemeIdHash = ethers.keccak256(ethers.toUtf8Bytes(intentResponse.input.scheme)); // Hash of scheme name

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

  console.log('Constructed witness:', normalizedWitness);

  // Set deadline (1 hour from now)
  const deadline = Math.floor(Date.now() / 1000) + 3600;

  // Check token capabilities in order of preference: EIP-3009 > EIP-2612 > Permit2
  const hasEIP3009 = await supportsEIP3009(params.tokenAddress, params.provider);
  const hasEIP2612 = await supportsEIP2612(params.tokenAddress, params.provider);
  console.log(`Token ${params.paymentToken} supports EIP-3009:`, hasEIP3009);
  console.log(`Token ${params.paymentToken} supports EIP-2612:`, hasEIP2612);

  let relayRequest: RelayPaymentRequest;

  if (hasEIP3009) {
    // Use EIP-3009 TransferWithAuthorization (most efficient - direct transfer)
    console.log('Using EIP-3009 TransferWithAuthorization for gasless payment...');

    // EIP-3009 uses validAfter/validBefore instead of deadline
    const validAfter = 0; // Valid immediately
    const validBefore = Math.floor(Date.now() / 1000) + 3600; // Valid for 1 hour

    // Generate random nonce for EIP-3009
    const authNonce = generateEIP3009Nonce();

    const eip3009Sig = await signEIP3009({
      tokenAddress: params.tokenAddress,
      to: config.contracts.bnbPayRouter,
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
        verifyingContract: config.contracts.bnbPayRouter,
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
  } else if (hasEIP2612) {
    // Use EIP-2612 permit (native token permit)
    console.log('Using EIP-2612 permit for gasless payment...');

    const nonce = await getEIP2612Nonce(params.tokenAddress, payerAddress, params.provider);

    const permitSig = await signEIP2612({
      tokenAddress: params.tokenAddress,
      amount: apiAmountBigInt, // Use API amount for consistency
      spender: config.contracts.bnbPayRouter,
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
        verifyingContract: config.contracts.bnbPayRouter,
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
    console.log('Using Permit2 for gasless payment...');

    // Get network-specific Permit2 address
    const permit2Address = getPermit2Address(params.network);
    console.log('Using Permit2 address:', permit2Address);

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
    console.log('Permit2 already approved:', hasPermit2Approval);

    // Use a simple incrementing nonce or random value
    // Permit2 contract may not be deployed on BNB testnet at the universal address
    const nonce = Date.now().toString(); // Use timestamp as nonce for testing

    // Sign Permit2 WITH witness - BNBPayRouter uses permitWitnessTransferFrom
    // CRITICAL: witness must be bytes32 (router EIP-712 digest of FlexWitness)
    const permit2Sig = await signPermit2WithWitness({
      tokenAddress: params.tokenAddress,
      amount: apiAmountBigInt, // Use API amount for consistency
      spender: config.contracts.bnbPayRouter,
      deadline,
      nonce,
      chainId: config.chainIdNumber,
      permit2Address, // Use network-specific Permit2 address
      routerAddress: config.contracts.bnbPayRouter, // For computing witnessDigest
      routerDomain: apiRouterDomain, // Use API-provided domain (CRITICAL!)
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
      verifyingContract: config.contracts.bnbPayRouter,
    };
    console.log('🔐 Witness signature domain:', witnessSignatureDomain);

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
        to: config.contracts.bnbPayRouter, // Router address, not merchant
        requestedAmount: apiAmountWei, // Use API amount for consistency
      },
      signature: permit2Sig,
    };

    if (!hasPermit2Approval) {
      // Permit2 not approved - need to check if user has gas for first-time approval
      console.log('⚠️ Permit2 not approved for this token. Checking options...');

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
      console.log('🔄 Using Permit2 bundle flow (approve + pay)...');
      console.log('   User BNB balance:', ethers.formatEther(bnbBalance));

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

      console.log('Signing approval transaction...');
      let signedApproveTx: string;
      try {
        signedApproveTx = await params.signer.signTransaction(approveTx);
        console.log('Approval tx signed:', signedApproveTx.slice(0, 66) + '...');
      } catch (signError: any) {
        // MetaMask and some wallets don't support eth_signTransaction
        // Fall back to asking user to approve manually
        console.error('❌ Wallet does not support eth_signTransaction');
        console.error('   This is common with MetaMask. Falling back to manual approval...');

        // Try to do the approval as a regular transaction
        console.log('📝 Requesting manual Permit2 approval...');
        const erc20 = new ethers.Contract(
          params.tokenAddress,
          ['function approve(address spender, uint256 amount) external returns (bool)'],
          params.signer
        );

        try {
          const approveTxResponse = await erc20.approve(permit2Address, ethers.MaxUint256);
          console.log('⏳ Waiting for approval confirmation...');
          await approveTxResponse.wait();
          console.log('✅ Permit2 approved! Now proceeding with gasless payment...');

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
          console.log('Submitting gasless payment to relay...');
          console.log('Scheme:', relayRequest.scheme);
          console.log('Payment ID:', relayRequest.intent.paymentId);

          const relayResponse = await relayPayment(relayRequest);

          console.log('✅ Gasless payment relayed successfully');
          console.log('Transaction Hash:', relayResponse.txHash);
          console.log('Payment ID:', relayResponse.paymentId);

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

      console.log('Submitting Permit2 bundle to relay...');
      console.log('Bundle request:', {
        ...bundleRequest,
        approvalTx: bundleRequest.approvalTx.slice(0, 66) + '...',
        witnessSignature: bundleRequest.witnessSignature.slice(0, 66) + '...',
      });

      // Submit bundle
      let bundleResponse;
      try {
        bundleResponse = await relayPermit2Bundle(bundleRequest);

        console.log('✅ Permit2 bundle accepted');
        console.log('Bundle ID:', bundleResponse.bundleId);
        console.log('Target Block:', bundleResponse.targetBlock);
        console.log('Payment ID:', bundleResponse.paymentId);

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
          console.log('📝 Bundle RPC not available, falling back to manual approval flow...');

          // Broadcast the signed approval transaction directly
          console.log('⏳ Broadcasting approval transaction...');
          try {
            const txResponse = await params.provider.broadcastTransaction(signedApproveTx);
            console.log('📤 Approval tx broadcast:', txResponse.hash);

            console.log('⏳ Waiting for approval confirmation...');
            const receipt = await txResponse.wait();
            console.log('✅ Permit2 approved! Tx:', receipt?.hash);

            // Now proceed with regular gasless relay
            console.log('🚀 Proceeding with gasless payment via relay...');

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

            console.log('✅ Gasless payment relayed successfully');
            console.log('Transaction Hash:', relayResponse.txHash);
            console.log('Payment ID:', relayResponse.paymentId);

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
      console.log('✓ Permit2 already approved, using regular relay...');

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
    console.log('\n' + '='.repeat(70));
    console.log('🔧 BACKEND DEBUG: Values for Permit2.permitWitnessTransferFrom()');
    console.log('='.repeat(70));

    // Compute the witness struct hash
    const witnessStructHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
        [FLEX_WITNESS_TYPEHASH, normalizedWitness.schemeId, normalizedWitness.intentHash, normalizedWitness.payer, normalizedWitness.salt]
      )
    );

    // Compute router domain separator
    const routerDomainSeparator = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
        [
          ethers.keccak256(ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')),
          ethers.keccak256(ethers.toUtf8Bytes('BNBPayRouter')),
          ethers.keccak256(ethers.toUtf8Bytes('1')),
          config.chainIdNumber,
          config.contracts.bnbPayRouter,
        ]
      )
    );

    // Compute witnessDigest (router's EIP-712 hash of FlexWitness)
    const witnessDigest = ethers.keccak256(
      ethers.solidityPacked(
        ['bytes2', 'bytes32', 'bytes32'],
        ['0x1901', routerDomainSeparator, witnessStructHash]
      )
    );

    // The witnessTypeString the router passes to Permit2
    // NOTE: This is just "FlexWitness(...)" - the router appends this to Permit2's stub
    const routerWitnessTypeString = 'FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)';

    // The full type string - CRITICAL: uses "bytes32 witness" NOT "FlexWitness witness"
    const fullTypeString = FULL_PERMIT2_TYPE_STRING;

    console.log('\n📋 Permit2 Call Parameters:');
    console.log('   permit.permitted.token:', params.tokenAddress);
    console.log('   permit.permitted.amount:', apiAmountWei);
    console.log('   permit.nonce:', nonce);
    console.log('   permit.deadline:', deadline);
    console.log('   transferDetails.to:', config.contracts.bnbPayRouter);
    console.log('   transferDetails.requestedAmount:', apiAmountWei);
    console.log('   owner:', normalizedPayer);

    console.log('\n🔐 Witness Parameters:');
    console.log('   witness (bytes32 - router EIP-712 digest):', witnessDigest);
    console.log('   witnessTypeString:', routerWitnessTypeString);

    console.log('\n📝 FlexWitness Data:');
    console.log('   schemeId:', normalizedWitness.schemeId);
    console.log('   intentHash:', normalizedWitness.intentHash);
    console.log('   payer:', normalizedWitness.payer);
    console.log('   salt:', normalizedWitness.salt);
    console.log('   struct hash:', witnessStructHash);

    console.log('\n🔍 Type Hashes:');
    console.log('   Full type string:', fullTypeString);
    console.log('   Type hash (PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH):', PERMIT_WITNESS_TRANSFER_FROM_TYPEHASH);
    console.log('   FlexWitness type hash:', FLEX_WITNESS_TYPEHASH);
    console.log('   TokenPermissions type hash:', TOKEN_PERMISSIONS_TYPEHASH);

    console.log('\n🔧 Domain Separators:');
    console.log('   Router domain separator:', routerDomainSeparator);
    console.log('   Permit2 domain separator:', computePermit2DomainSeparator(config.chainIdNumber, permit2Address));

    console.log('\n' + '='.repeat(70));
    console.log('⚠️  Frontend signs with witnessDigest (bytes32), NOT FlexWitness struct');
    console.log('='.repeat(70) + '\n');
  }

  console.log('Submitting gasless payment to relay...');
  console.log('Scheme:', relayRequest.scheme);
  console.log('Payment ID:', relayRequest.intent.paymentId);
  console.log('Full relay request:', relayRequest);

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

  console.log('✅ Gasless payment relayed successfully');
  console.log('Transaction Hash:', relayResponse.txHash);
  console.log('Payment ID:', relayResponse.paymentId);

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
