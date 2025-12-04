/**
 * Payment Debug Utilities
 * Run these in browser console to diagnose payment issues
 */

import { ethers } from 'ethers';

const USD1_ADDRESS = '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165';
const PERMIT2_ADDRESS = '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768';
const ROUTER_ADDRESS = '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B';

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
  };

  const selector = errorData.slice(0, 10).toLowerCase();
  return errors[selector] || `Unknown error: ${selector}`;
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

// Export for browser console
if (typeof window !== 'undefined') {
  (window as any).debugGaslessPayment = debugGaslessPayment;
  (window as any).approvePermit2ForUSD1 = approvePermit2ForUSD1;
  (window as any).approveRouterForUSD1 = approveRouterForUSD1;
  (window as any).decodeContractError = decodeContractError;
  (window as any).checkBNBBalance = checkBNBBalance;

  console.log('🔧 Debug utilities loaded!');
  console.log('   Run: debugGaslessPayment()');
  console.log('   Run: checkBNBBalance()');
  console.log('   Run: approvePermit2ForUSD1()');
  console.log('   Run: approveRouterForUSD1()');
  console.log('   Run: decodeContractError("0xee7ad419")');
}
