/**
 * Payment Debug Utilities
 * Run these in browser console to diagnose payment issues
 */

import { ethers } from 'ethers';

const USD1_ADDRESS = '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165';
const PERMIT2_ADDRESS = '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768';
const ROUTER_ADDRESS = '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B';

// All supported tokens on BNB Testnet
const SUPPORTED_TOKENS: Record<string, { address: string; decimals: number }> = {
  'USD1': { address: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', decimals: 6 },
  'USDC': { address: '0xED24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', decimals: 18 }, // BNB Testnet USDC
  'USDT': { address: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd', decimals: 18 }, // BNB Testnet USDT
  'BUSD': { address: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee', decimals: 18 }, // Same as USDC on testnet
  'DAI': { address: '0xEC5dCb5Dbf4B114C9d0F65BcCAb49EC54F6A0867', decimals: 18 },
};

/**
 * Check all requirements for gasless payment
 */
export async function debugGaslessPayment(amount: string = '1.0') {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  console.log('='.repeat(60));
  console.log('🔍 Gasless Payment Debug for:', address);
  console.log('='.repeat(60));

  // 1. Check USD1 balance
  console.log('\n📊 Step 1: Checking USD1 Balance...');
  const usd1 = new ethers.Contract(
    USD1_ADDRESS,
    [
      'function balanceOf(address) view returns (uint256)',
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
      'function name() view returns (string)',
    ],
    provider
  );

  try {
    const balance = await usd1.balanceOf(address);
    const decimals = await usd1.decimals();
    const symbol = await usd1.symbol();
    const name = await usd1.name();

    console.log(`   Token: ${name} (${symbol})`);
    console.log(`   Balance: ${ethers.formatUnits(balance, decimals)} ${symbol}`);
    console.log(`   Raw Balance: ${balance.toString()}`);

    const requiredAmount = ethers.parseUnits(amount, decimals);
    if (balance < requiredAmount) {
      console.log(`   ❌ Insufficient balance! Need ${amount} ${symbol}`);
      console.log(`   💡 Ask your senior dev for test tokens`);
      return { success: false, reason: 'insufficient_balance' };
    } else {
      console.log(`   ✅ Sufficient balance for ${amount} ${symbol}`);
    }
  } catch (error) {
    console.error('   ❌ Failed to check balance:', error);
    return { success: false, reason: 'balance_check_failed' };
  }

  // 2. Check EIP-2612 support
  console.log('\n🔐 Step 2: Checking EIP-2612 Support...');
  const usd1WithPermit = new ethers.Contract(
    USD1_ADDRESS,
    [
      'function DOMAIN_SEPARATOR() view returns (bytes32)',
      'function nonces(address) view returns (uint256)',
    ],
    provider
  );

  let supportsEIP2612 = false;
  try {
    const domainSeparator = await usd1WithPermit.DOMAIN_SEPARATOR();
    const nonce = await usd1WithPermit.nonces(address);
    console.log(`   ✅ Token supports EIP-2612`);
    console.log(`   Domain Separator: ${domainSeparator}`);
    console.log(`   Current Nonce: ${nonce.toString()}`);
    supportsEIP2612 = true;
  } catch (error) {
    console.log(`   ℹ️  Token does NOT support EIP-2612`);
  }

  // 3. Check Permit2 allowance
  console.log('\n🔓 Step 3: Checking Permit2 Allowance...');
  const usd1WithAllowance = new ethers.Contract(
    USD1_ADDRESS,
    ['function allowance(address,address) view returns (uint256)'],
    provider
  );

  try {
    const allowance = await usd1WithAllowance.allowance(address, PERMIT2_ADDRESS);
    console.log(`   Permit2 Allowance: ${ethers.formatUnits(allowance, 6)}`);

    if (allowance === 0n) {
      console.log(`   ⚠️  Permit2 NOT approved!`);
      console.log(`   💡 Need to approve Permit2 if using Permit2 flow`);
      console.log(`   💡 BUT if using EIP-2612, approval not needed`);
    } else if (allowance === ethers.MaxUint256) {
      console.log(`   ✅ Permit2 approved (MaxUint256)`);
    } else {
      console.log(`   ✅ Permit2 approved: ${ethers.formatUnits(allowance, 6)}`);
    }
  } catch (error) {
    console.error('   ❌ Failed to check allowance:', error);
  }

  // 4. Check Router allowance (for non-gasless)
  console.log('\n🔓 Step 4: Checking Router Allowance...');
  try {
    const routerAllowance = await usd1WithAllowance.allowance(address, ROUTER_ADDRESS);
    console.log(`   Router Allowance: ${ethers.formatUnits(routerAllowance, 6)}`);

    if (routerAllowance === 0n) {
      console.log(`   ℹ️  Router NOT approved (needed for standard payment)`);
    } else {
      console.log(`   ✅ Router approved`);
    }
  } catch (error) {
    console.error('   ❌ Failed to check router allowance:', error);
  }

  // 5. Check network
  console.log('\n🌐 Step 5: Checking Network...');
  const network = await provider.getNetwork();
  console.log(`   Chain ID: ${network.chainId}`);
  console.log(`   Chain Name: ${network.name}`);

  if (network.chainId !== 97n) {
    console.log(`   ⚠️  Wrong network! Should be BNB Testnet (97)`);
    return { success: false, reason: 'wrong_network' };
  } else {
    console.log(`   ✅ Correct network (BNB Testnet)`);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Summary:');
  console.log('='.repeat(60));

  if (supportsEIP2612) {
    console.log('✅ USE EIP-2612 FLOW (Native permit - no approval needed)');
    console.log('   Scheme: "eip2612"');
    console.log('   Endpoint: POST /relay/payment');
  } else {
    console.log('✅ USE PERMIT2 FLOW (Universal permit)');
    console.log('   Scheme: "permit2"');
    console.log('   Endpoint: POST /relay/payment OR /relay/permit2/bundle');
  }

  console.log('\n💡 To approve Permit2 (if needed):');
  console.log('   await approvePermit2ForUSD1()');

  console.log('\n💡 To approve Router (for standard payment):');
  console.log('   await approveRouterForUSD1()');

  return {
    success: true,
    balance: await usd1.balanceOf(address),
    supportsEIP2612,
    address,
  };
}

/**
 * Approve Permit2 to spend USD1
 */
export async function approvePermit2ForUSD1() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const usd1 = new ethers.Contract(
    USD1_ADDRESS,
    ['function approve(address spender, uint256 amount) returns (bool)'],
    signer
  );

  console.log('📝 Approving Permit2 to spend USD1...');
  console.log('   Token:', USD1_ADDRESS);
  console.log('   Spender (Permit2):', PERMIT2_ADDRESS);
  console.log('   Amount: MaxUint256');

  try {
    const tx = await usd1.approve(PERMIT2_ADDRESS, ethers.MaxUint256);
    console.log('   ⏳ Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('   ✅ Approved! Block:', receipt?.blockNumber);
    return receipt;
  } catch (error: any) {
    console.error('   ❌ Approval failed:', error.message);
    throw error;
  }
}

/**
 * Approve Router to spend USD1 (for standard non-gasless payment)
 */
export async function approveRouterForUSD1() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  const usd1 = new ethers.Contract(
    USD1_ADDRESS,
    ['function approve(address spender, uint256 amount) returns (bool)'],
    signer
  );

  console.log('📝 Approving Router to spend USD1...');
  console.log('   Token:', USD1_ADDRESS);
  console.log('   Spender (Router):', ROUTER_ADDRESS);
  console.log('   Amount: MaxUint256');

  try {
    const tx = await usd1.approve(ROUTER_ADDRESS, ethers.MaxUint256);
    console.log('   ⏳ Transaction sent:', tx.hash);
    const receipt = await tx.wait();
    console.log('   ✅ Approved! Block:', receipt?.blockNumber);
    return receipt;
  } catch (error: any) {
    console.error('   ❌ Approval failed:', error.message);
    throw error;
  }
}

/**
 * Decode custom error from contract
 */
export function decodeContractError(errorData: string): string {
  // Known error selectors
  const errors: Record<string, string> = {
    '0xee7ad419': 'PayerMismatch() - The payer in intent does not match witness/signature',
    '0xf4d678b8': 'InsufficientBalance() - Payer does not have enough tokens',
    '0x025dbdd4': 'InvalidPermit() - Permit signature is invalid',
    '0x1a15a3cc': 'ExpiredDeadline() - Permit or intent deadline has passed',
    '0x8baa579f': 'InvalidSignature() - Witness signature is invalid',
    '0x66b5d4f7': 'AlreadySettled() - Payment was already settled',
    '0x815e1d64': 'InvalidSigner() - Permit2 signature recovers to wrong address (witness type string mismatch?)',
    '0x756688fe': 'InvalidNonce() - Permit2 nonce already used or invalid',
    '0x3728b83d': 'InvalidContractSignature() - Contract signature verification failed',
  };

  const selector = errorData.slice(0, 10).toLowerCase();
  return errors[selector] || `Unknown error: ${selector}`;
}

/**
 * Check ALL token balances to see what you can pay with
 */
export async function checkAllBalances() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  console.log('='.repeat(60));
  console.log('💰 ALL TOKEN BALANCES for:', address);
  console.log('='.repeat(60));

  // Check BNB first
  const bnbBalance = await provider.getBalance(address);
  console.log(`\n🟡 BNB (Native): ${ethers.formatEther(bnbBalance)} BNB`);
  if (bnbBalance < ethers.parseEther('0.01')) {
    console.log('   ⚠️ Low! Get testnet BNB: https://testnet.bnbchain.org/faucet-smart');
  }

  // Check all ERC20 tokens
  const balances: Record<string, string> = { BNB: ethers.formatEther(bnbBalance) };

  for (const [symbol, info] of Object.entries(SUPPORTED_TOKENS)) {
    try {
      const token = new ethers.Contract(
        info.address,
        [
          'function balanceOf(address) view returns (uint256)',
          'function symbol() view returns (string)',
        ],
        provider
      );

      const balance = await token.balanceOf(address);
      const formatted = ethers.formatUnits(balance, info.decimals);
      balances[symbol] = formatted;

      const hasBalance = balance > 0n;
      const emoji = hasBalance ? '✅' : '❌';
      console.log(`\n${emoji} ${symbol}: ${formatted}`);
      console.log(`   Address: ${info.address}`);

      if (!hasBalance) {
        console.log(`   ⚠️ No ${symbol} tokens - cannot pay with this token`);
      }
    } catch (error: any) {
      console.log(`\n❌ ${symbol}: Error fetching balance`);
      console.log(`   Address: ${info.address}`);
      console.log(`   Error: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY - Tokens you CAN pay with:');
  console.log('='.repeat(60));

  for (const [symbol, balance] of Object.entries(balances)) {
    if (parseFloat(balance) > 0) {
      console.log(`   ✅ ${symbol}: ${balance}`);
    }
  }

  return balances;
}

/**
 * Check if account has test BNB for gas
 */
export async function checkBNBBalance() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();

  const balance = await provider.getBalance(address);
  console.log('💰 BNB Balance:', ethers.formatEther(balance), 'BNB');

  if (balance < ethers.parseEther('0.01')) {
    console.log('   ⚠️  Low BNB balance! Get testnet BNB from:');
    console.log('   🔗 https://testnet.bnbchain.org/faucet-smart');
  } else {
    console.log('   ✅ Sufficient BNB for gas');
  }

  return balance;
}

// FlexWitness EIP-712 types (standalone for router domain signing)
const FLEX_WITNESS_TYPES = {
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
};

// Permit2 EIP-712 types with NESTED FlexWitness
// CRITICAL: Permit2 constructs the type string as:
// "PermitWitnessTransferFrom(...)FlexWitness(...)TokenPermissions(...)"
// Using witness: 'FlexWitness' (not bytes32) ensures correct type string
const PERMIT2_WITNESS_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'FlexWitness' },  // Nested struct
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

/**
 * Compute witness struct hash for debugging purposes
 */
function computeWitnessStructHash(
  witness: {
    schemeId: string;
    intentHash: string;
    payer: string;
    salt: string;
  }
): string {
  const structHash = ethers.TypedDataEncoder.hashStruct('FlexWitness', FLEX_WITNESS_TYPES, witness);

  console.log('🔐 FlexWitness struct hash (for debug):');
  console.log('   Witness:', JSON.stringify(witness, null, 2));
  console.log('   Struct hash:', structHash);

  return structHash;
}

/**
 * Verify a Permit2 signature locally to prove frontend is correct
 * This recovers the signer from the signature and compares to expected
 *
 * CRITICAL: Permit2 expects witness as a NESTED FlexWitness struct.
 * The type string must include FlexWitness definition for correct type hash.
 */
export async function verifyPermit2Signature(
  permit2Signature: string,
  expectedSigner: string,
  message: {
    permitted: { token: string; amount: string };
    spender: string;
    nonce: string;
    deadline: number;
    witness: {
      schemeId: string;
      intentHash: string;
      payer: string;
      salt: string;
    };
  }
) {
  console.log('🔍 Verifying Permit2 signature locally...');
  console.log('   Witness:', JSON.stringify(message.witness, null, 2));

  // Debug: compute struct hash for logging
  const structHash = computeWitnessStructHash(message.witness);
  console.log('   Struct hash:', structHash);

  // Domain (without version - verified against contract)
  const permit2Domain = {
    name: 'Permit2',
    chainId: 97,
    verifyingContract: PERMIT2_ADDRESS,
  };

  // Build the message with NESTED FlexWitness
  const permit2Message = {
    permitted: message.permitted,
    spender: message.spender,
    nonce: message.nonce,
    deadline: message.deadline,
    witness: message.witness,  // Pass the actual struct - ethers.js hashes it
  };

  // Log the EIP-712 type string that will be generated
  const typeString = ethers.TypedDataEncoder.from(PERMIT2_WITNESS_TYPES).encodeType('PermitWitnessTransferFrom');
  console.log('   EIP-712 Type String:', typeString);

  // Compute the EIP-712 hash
  const typedDataHash = ethers.TypedDataEncoder.hash(permit2Domain, PERMIT2_WITNESS_TYPES, permit2Message);
  console.log('   EIP-712 hash:', typedDataHash);

  // Recover the signer
  const recoveredAddress = ethers.recoverAddress(typedDataHash, permit2Signature);
  console.log('   Recovered signer:', recoveredAddress);
  console.log('   Expected signer:', expectedSigner);

  const matches = recoveredAddress.toLowerCase() === expectedSigner.toLowerCase();
  if (matches) {
    console.log('✅ SIGNATURE VALID: Frontend signing is correct!');
    console.log('   The issue is on the BACKEND - it must be using different parameters.');
  } else {
    console.log('❌ SIGNATURE INVALID: Frontend signing has a bug!');
    console.log('   Recovered:', recoveredAddress);
    console.log('   Expected:', expectedSigner);
  }

  return { valid: matches, recoveredAddress, expectedSigner, typedDataHash, structHash };
}

/**
 * Compute the Permit2 witness type string and type hash
 * This must match what the backend passes to permitWitnessTransferFrom
 */
export function getPermit2WitnessTypeInfo() {
  // Get the type string that ethers.js generates with nested FlexWitness
  const typeString = ethers.TypedDataEncoder.from(PERMIT2_WITNESS_TYPES).encodeType('PermitWitnessTransferFrom');

  // The witness type string suffix that the backend passes to permitWitnessTransferFrom
  // This is everything after the stub in the full type string
  const witnessTypeString = 'FlexWitness witness)FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)TokenPermissions(address token,uint256 amount)';

  // Type hash
  const typeHash = ethers.keccak256(ethers.toUtf8Bytes(typeString));

  console.log('🔍 Permit2 Witness Type Info:');
  console.log('   ethers.js generated type string:', typeString);
  console.log('   Witness type string (backend passes to contract):', witnessTypeString);
  console.log('   Type hash:', typeHash);

  return { witnessTypeString, fullTypeString: typeString, typeHash };
}

/**
 * Debug the Permit2 domain separator to check if our domain matches the contract
 */
export async function debugPermit2DomainSeparator() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);

  console.log('🔍 Debugging Permit2 Domain Separator...');
  console.log('   Permit2 Address:', PERMIT2_ADDRESS);

  // Fetch actual domain separator from contract
  const permit2 = new ethers.Contract(
    PERMIT2_ADDRESS,
    ['function DOMAIN_SEPARATOR() external view returns (bytes32)'],
    provider
  );

  const actualDomainSeparator = await permit2.DOMAIN_SEPARATOR();
  console.log('   Actual from contract:', actualDomainSeparator);

  // Compute expected (without version - canonical Uniswap)
  const typeHashNoVersion = ethers.keccak256(
    ethers.toUtf8Bytes('EIP712Domain(string name,uint256 chainId,address verifyingContract)')
  );
  const nameHash = ethers.keccak256(ethers.toUtf8Bytes('Permit2'));

  const computedNoVersion = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'uint256', 'address'],
      [typeHashNoVersion, nameHash, 97, PERMIT2_ADDRESS]
    )
  );
  console.log('   Computed (NO version):', computedNoVersion);

  // Compute expected (with version - some custom deployments)
  const typeHashWithVersion = ethers.keccak256(
    ethers.toUtf8Bytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
  );
  const versionHash = ethers.keccak256(ethers.toUtf8Bytes('1'));

  const computedWithVersion = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'uint256', 'address'],
      [typeHashWithVersion, nameHash, versionHash, 97, PERMIT2_ADDRESS]
    )
  );
  console.log('   Computed (WITH version):', computedWithVersion);

  // Check which matches
  if (actualDomainSeparator.toLowerCase() === computedNoVersion.toLowerCase()) {
    console.log('✅ MATCH: Contract uses domain WITHOUT version (canonical Uniswap format)');
    return 'withoutVersion';
  } else if (actualDomainSeparator.toLowerCase() === computedWithVersion.toLowerCase()) {
    console.log('✅ MATCH: Contract uses domain WITH version');
    console.log('⚠️ You need to UPDATE the gasless-payments.ts to include version in the domain!');
    return 'withVersion';
  } else {
    console.log('❌ NO MATCH: Contract uses a different domain format!');
    console.log('   This could mean a different name or custom domain structure.');
    return 'none';
  }
}

/**
 * Quick test to verify the last Permit2 signature from console logs
 * Copy the values from the console output and paste them here
 */
export async function verifyLastPermit2Sig() {
  // Use values from the last payment attempt (copy from console)
  const lastSignature = '0xccede8317fb654fd36bd7fdc71e7077d3ce72b0eaf28306f9aa69ca5b035737d45867e513ae2297077ec3ec8f2703c53b117fbbab01f7026e2a18f17a2722f731b';
  const expectedSigner = '0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d';
  const message = {
    permitted: {
      token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
      amount: '10000000',
    },
    spender: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B',
    nonce: '1765768039602',
    deadline: 1765771636,
    witness: {
      schemeId: '0xc16f881b3dd0a1bf52965fa8de2adc6199cef183866d9a9b5b0ae9dc5897512f',
      intentHash: '0x9b0a9c1924567c617d1995ca0d504c7ed46b37c94c0e25bea923f05c1a3aafe1',
      payer: '0xA9ff06962668149CE4728a78ea93C8c7d0C88e0d',
      salt: '0x000000000000000000000000000000000000000000000000ee30203e18915e72',
    },
  };

  return verifyPermit2Signature(lastSignature, expectedSigner, message);
}

/**
 * Debug: Query router contract for its EIP-712 constants
 * This helps diagnose witnessDigest mismatch issues
 */
export async function debugRouterConstants() {
  if (!window.ethereum) {
    console.error('❌ No wallet connected');
    return;
  }

  const provider = new ethers.BrowserProvider(window.ethereum);

  console.log('='.repeat(70));
  console.log('🔧 ROUTER CONTRACT CONSTANTS DEBUG');
  console.log('='.repeat(70));
  console.log('Router address:', ROUTER_ADDRESS);

  const routerContract = new ethers.Contract(
    ROUTER_ADDRESS,
    [
      'function DOMAIN_SEPARATOR() external view returns (bytes32)',
      'function FLEX_WITNESS_TYPEHASH() external view returns (bytes32)',
      'function name() external view returns (string)',
      'function version() external view returns (string)',
    ],
    provider
  );

  // Try to get DOMAIN_SEPARATOR
  try {
    const domainSep = await routerContract.DOMAIN_SEPARATOR();
    console.log('\n🔐 Router DOMAIN_SEPARATOR (on-chain):', domainSep);

    // Compute what we expect
    const expectedDomainSep = ethers.TypedDataEncoder.hashDomain({
      name: 'BNBPayRouter',
      version: '1',
      chainId: 97,
      verifyingContract: ROUTER_ADDRESS,
    });
    console.log('   Our computed domain separator:', expectedDomainSep);
    console.log('   Match:', domainSep === expectedDomainSep ? '✅ YES' : '❌ NO - MISMATCH!');

    if (domainSep !== expectedDomainSep) {
      console.log('\n⚠️  Domain separator mismatch! Possible causes:');
      console.log('   - Router uses different name');
      console.log('   - Router uses different version');
      console.log('   - Router was deployed on different chain');
    }
  } catch (e: any) {
    console.log('\n⚠️  Could not fetch DOMAIN_SEPARATOR:', e.message);
    console.log('   Router may not expose this function publicly');
  }

  // Try to get FLEX_WITNESS_TYPEHASH
  try {
    const flexWitnessTypeHash = await routerContract.FLEX_WITNESS_TYPEHASH();
    console.log('\n🔐 Router FLEX_WITNESS_TYPEHASH (on-chain):', flexWitnessTypeHash);

    // Compute what we expect
    const expectedTypeHash = ethers.keccak256(ethers.toUtf8Bytes(
      'FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)'
    ));
    console.log('   Our computed type hash:', expectedTypeHash);
    console.log('   Match:', flexWitnessTypeHash === expectedTypeHash ? '✅ YES' : '❌ NO - MISMATCH!');

    if (flexWitnessTypeHash !== expectedTypeHash) {
      console.log('\n⚠️  Type hash mismatch! The router uses a different FlexWitness struct definition.');
      console.log('   We need to find out what fields/order the router expects.');
    }
  } catch (e: any) {
    console.log('\n⚠️  Could not fetch FLEX_WITNESS_TYPEHASH:', e.message);
    console.log('   Router may not expose this constant publicly');
  }

  // Try to get name and version
  try {
    const name = await routerContract.name();
    console.log('\n🔐 Router name():', name);
  } catch (e: any) {
    console.log('\n⚠️  Could not fetch name():', e.message);
  }

  try {
    const version = await routerContract.version();
    console.log('🔐 Router version():', version);
  } catch (e: any) {
    console.log('⚠️  Could not fetch version():', e.message);
  }

  console.log('\n' + '='.repeat(70));
}

/**
 * Compute and log what we think the witnessDigest should be
 */
export async function computeWitnessDigest(witness: {
  schemeId: string;
  intentHash: string;
  payer: string;
  salt: string;
}) {
  console.log('='.repeat(70));
  console.log('🔧 WITNESS DIGEST COMPUTATION');
  console.log('='.repeat(70));

  console.log('\nInput witness:', witness);

  // Our FLEX_WITNESS_TYPEHASH
  const FLEX_WITNESS_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
    'FlexWitness(bytes32 schemeId,bytes32 intentHash,address payer,bytes32 salt)'
  ));
  console.log('\nFLEX_WITNESS_TYPEHASH:', FLEX_WITNESS_TYPEHASH);

  // Compute struct hash
  const structHash = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32', 'bytes32', 'bytes32', 'address', 'bytes32'],
      [FLEX_WITNESS_TYPEHASH, witness.schemeId, witness.intentHash, witness.payer, witness.salt]
    )
  );
  console.log('Struct hash:', structHash);

  // Router domain
  const routerDomain = {
    name: 'BNBPayRouter',
    version: '1',
    chainId: 97,
    verifyingContract: ROUTER_ADDRESS,
  };

  const domainSeparator = ethers.TypedDataEncoder.hashDomain(routerDomain);
  console.log('Router domain separator:', domainSeparator);

  // Compute witnessDigest
  const witnessDigest = ethers.keccak256(
    ethers.solidityPacked(
      ['bytes2', 'bytes32', 'bytes32'],
      ['0x1901', domainSeparator, structHash]
    )
  );
  console.log('\n✅ Witness Digest:', witnessDigest);

  // Also compute using ethers TypedDataEncoder
  const witnessDigestEthers = ethers.TypedDataEncoder.hash(
    routerDomain,
    {
      FlexWitness: [
        { name: 'schemeId', type: 'bytes32' },
        { name: 'intentHash', type: 'bytes32' },
        { name: 'payer', type: 'address' },
        { name: 'salt', type: 'bytes32' },
      ],
    },
    witness
  );
  console.log('Witness Digest (ethers method):', witnessDigestEthers);
  console.log('Methods match:', witnessDigest === witnessDigestEthers ? '✅ YES' : '❌ NO');

  console.log('\n' + '='.repeat(70));
  return witnessDigest;
}

// Export for browser console
if (typeof window !== 'undefined') {
  (window as any).debugGaslessPayment = debugGaslessPayment;
  (window as any).approvePermit2ForUSD1 = approvePermit2ForUSD1;
  (window as any).approveRouterForUSD1 = approveRouterForUSD1;
  (window as any).decodeContractError = decodeContractError;
  (window as any).checkBNBBalance = checkBNBBalance;
  (window as any).checkAllBalances = checkAllBalances;
  (window as any).debugPermit2DomainSeparator = debugPermit2DomainSeparator;
  (window as any).getPermit2WitnessTypeInfo = getPermit2WitnessTypeInfo;
  (window as any).verifyPermit2Signature = verifyPermit2Signature;
  (window as any).verifyLastPermit2Sig = verifyLastPermit2Sig;
  (window as any).debugRouterConstants = debugRouterConstants;
  (window as any).computeWitnessDigest = computeWitnessDigest;

  console.log('🔧 Debug utilities loaded!');
  console.log('   Run: checkAllBalances() - ⭐ SEE ALL YOUR TOKEN BALANCES');
  console.log('   Run: checkBNBBalance()');
  console.log('   Run: debugGaslessPayment()');
  console.log('   Run: approvePermit2ForUSD1()');
  console.log('   Run: approveRouterForUSD1()');
  console.log('   Run: decodeContractError("0xee7ad419")');
  console.log('   Run: debugPermit2DomainSeparator()');
  console.log('   Run: getPermit2WitnessTypeInfo()');
  console.log('   Run: debugRouterConstants() - ⭐ CHECK ROUTER EIP-712 CONSTANTS');
  console.log('   Run: computeWitnessDigest({schemeId, intentHash, payer, salt})');
}
