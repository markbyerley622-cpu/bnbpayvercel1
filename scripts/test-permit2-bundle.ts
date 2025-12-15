#!/usr/bin/env npx ts-node
/**
 * Permit2 Bundle Test Script
 *
 * This script generates a valid Permit2 bundle payload for testing the
 * /relay/permit2/bundle endpoint on BNB Testnet.
 *
 * Usage:
 *   npx ts-node scripts/test-permit2-bundle.ts
 *
 * To actually submit a bundle, you need:
 *   1. A funded payer wallet on BNB Testnet with USD1 tokens
 *   2. A wallet that supports eth_signTransaction (Rabby, Trust, OKX, etc.)
 *   3. Real signatures from that wallet
 */

import { ethers } from 'ethers';

// ============================================================================
// CONFIGURATION
// ============================================================================

const BNB_TESTNET = {
  chainId: 97,
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/',
  contracts: {
    permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
    bnbPayRouter: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B',
    paymentRegistry: '0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D',
    sessionStore: '0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983',
  },
  tokens: {
    USD1: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', // 6 decimals
    WUSD: '0x5e5ecf5e2512719DE778b88191062114Aa771BCf', // 18 decimals, EIP-2612
    XUSD: '0xBCa3782BC181446a0bdB87356Bde326559a4FAb2', // EIP-3009
  },
};

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function generateBundlePayload() {
  console.log('='.repeat(80));
  console.log('PERMIT2 BUNDLE PAYLOAD GENERATOR');
  console.log('BNB Testnet (chainId: 97)');
  console.log('='.repeat(80));
  console.log('');

  // Connect to BSC Testnet
  const provider = new ethers.JsonRpcProvider(BNB_TESTNET.rpcUrl);

  // Test values - replace with your actual funded wallet
  const merchantAddress = BNB_TESTNET.contracts.bnbPayRouter; // Using router as merchant for testing
  const payerAddress = '0xdD2FD4581271e230360230F9337D5c0430Bf44C0'; // Replace with funded wallet
  const tokenAddress = BNB_TESTNET.tokens.USD1;
  const amount = '1000000'; // 1 USD1 (6 decimals)
  const reference = 'test-payment-' + Date.now();

  // Compute derived values
  const referenceHash = ethers.keccak256(ethers.toUtf8Bytes(reference));
  const resourceId = ethers.keccak256(ethers.toUtf8Bytes(reference));
  const salt = ethers.hexlify(ethers.randomBytes(32));
  const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
  const nonce = Math.floor(Date.now() / 1000).toString();

  // Compute paymentId
  const paymentIdEncoded = ethers.solidityPacked(
    ['address', 'address', 'address', 'uint256', 'uint256', 'bytes32'],
    [merchantAddress, payerAddress, tokenAddress, amount, deadline, salt]
  );
  const paymentId = ethers.keccak256(paymentIdEncoded);

  // Build intent struct
  const intent = {
    paymentId,
    merchant: merchantAddress,
    token: tokenAddress,
    amount,
    deadline,
    payer: payerAddress,
    resourceId,
    referenceHash,
  };

  console.log('1. PAYMENT INTENT');
  console.log('-'.repeat(40));
  console.log(JSON.stringify(intent, null, 2));
  console.log('');

  // Call contract to get correct intentHash
  console.log('2. COMPUTING INTENT HASH (on-chain)');
  console.log('-'.repeat(40));

  const routerAbi = [
    'function hashPaymentIntent(tuple(bytes32 paymentId, address merchant, address token, uint256 amount, uint256 deadline, address payer, bytes32 resourceId, bytes32 referenceHash) intent) external pure returns (bytes32)',
  ];
  const router = new ethers.Contract(BNB_TESTNET.contracts.bnbPayRouter, routerAbi, provider);
  const intentHash = await router.hashPaymentIntent(intent);
  console.log('intentHash:', intentHash);
  console.log('');

  // Build witness
  const schemeId = ethers.keccak256(ethers.toUtf8Bytes('permit2'));
  const witness = {
    schemeId,
    intentHash,
    payer: payerAddress,
    salt,
  };

  console.log('3. FLEX WITNESS');
  console.log('-'.repeat(40));
  console.log(JSON.stringify(witness, null, 2));
  console.log('');

  // Placeholder signatures (for testing schema only)
  // Replace with real signatures from wallet
  const placeholderSig = '0x' + 'a'.repeat(128) + '1b';

  // Build approval tx data
  const approveIface = new ethers.Interface(['function approve(address spender, uint256 amount)']);
  const approveData = approveIface.encodeFunctionData('approve', [
    BNB_TESTNET.contracts.permit2,
    ethers.MaxUint256,
  ]);

  // Build placeholder signed approval tx (Type 2 / EIP-1559)
  const approvalTx =
    '0x02f8b06101827530830186a0830186a094' +
    tokenAddress.slice(2).toLowerCase() +
    '80b844095ea7b3000000000000000000000000' +
    BNB_TESTNET.contracts.permit2.slice(2).toLowerCase() +
    'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffc001a0' +
    'a'.repeat(64) +
    'a0' +
    'b'.repeat(64);

  // Build complete request
  const request = {
    network: 'bnbTestnet',
    intent: {
      paymentId: intent.paymentId,
      merchant: intent.merchant,
      token: intent.token,
      amount: intent.amount,
      deadline: intent.deadline,
      resourceId: intent.resourceId,
      payer: intent.payer,
    },
    witness,
    witnessSignature: placeholderSig,
    reference,
    permit2: {
      permit: {
        permitted: {
          token: tokenAddress,
          amount,
        },
        nonce,
        deadline,
      },
      transferDetails: {
        to: BNB_TESTNET.contracts.bnbPayRouter,
        requestedAmount: amount,
      },
      signature: placeholderSig,
    },
    approvalTx,
  };

  console.log('4. COMPLETE BUNDLE REQUEST');
  console.log('-'.repeat(40));
  console.log(JSON.stringify(request, null, 2));
  console.log('');

  console.log('5. CURL COMMAND');
  console.log('-'.repeat(40));
  console.log(`curl -X POST https://api.bnbpay.org/relay/permit2/bundle \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(request)}'`);
  console.log('');

  console.log('='.repeat(80));
  console.log('NEXT STEPS:');
  console.log('-'.repeat(80));
  console.log('1. Replace placeholderSig with real signatures from your wallet');
  console.log('2. Replace approvalTx with a real signed approval transaction');
  console.log('3. Ensure your payer wallet has USD1 tokens on BNB Testnet');
  console.log('4. Use a wallet that supports eth_signTransaction (Rabby, Trust, OKX)');
  console.log('');
  console.log('SIGNATURE GENERATION REQUIREMENTS:');
  console.log('- witnessSignature: Sign FlexWitness with EIP-712 (domain: BNBPayRouter)');
  console.log('- permit2.signature: Sign PermitWitnessTransferFrom with EIP-712 (domain: Permit2)');
  console.log('- approvalTx: Sign ERC20.approve(Permit2, MaxUint256) with eth_signTransaction');
  console.log('='.repeat(80));
}

// Run
generateBundlePayload().catch(console.error);
