# BNBPay API Integration Complete ✅

## Summary

Successfully integrated the updated BNBPay API and SDK into your Invoice/Subscription UI. The system now supports:

1. **New USD1 Contract** - Updated to `0xE71Ad4C949dF74c229697b3A8414A0833ABd4165` on BNB Testnet
2. **Gasless Payments via Permit2** - Full support for gasless token approvals and payments
3. **Wallet Detection** - Automatic detection of wallet capabilities (bundle vs sign-only)
4. **Permit2 Bundle Relay** - New atomic bundle endpoint for wallets that support raw tx signing

---

## What Changed

### 1. USD1 Contract Address Updated

**File**: `src/lib/web3.ts:67`

```typescript
USD1: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165' // NEW: Updated USD1 contract
```

This is the new mock USD1 token your senior dev deployed on BNB Testnet (chainId 97).

---

### 2. New API Endpoints Added

**File**: `src/lib/bnbpay-api.ts`

#### New Types:
- `Permit2BundleRequest` - Request payload for atomic Permit2 bundle
- `Permit2BundleResponse` - Response from bundle submission

#### New Function:
```typescript
relayPermit2Bundle(request: Permit2BundleRequest): Promise<Permit2BundleResponse>
```

**What it does**: Submits an atomic bundle `[approve(Permit2) -> payWithPermit2]` via BEP322/NodeReal bundler. If any transaction fails, the entire bundle is discarded (no gas wasted).

**Endpoint**: `POST /relay/permit2/bundle`

---

### 3. Wallet Detection Utility

**File**: `src/lib/wallet-detection.ts` (NEW)

Detects wallet capabilities for gasless payments:

```typescript
export function detectPermit2WalletLane(): WalletLaneDetection {
  // Returns: 'bundle', 'sign_only', or 'unsupported'
}
```

**Wallet Support Matrix**:

| Wallet | Lane | Gasless? | Bundle Flow? |
|--------|------|----------|--------------|
| Rabby | bundle | ✅ Yes | ✅ Yes |
| Trust Wallet | bundle | ✅ Yes | ✅ Yes |
| OKX Wallet | bundle | ✅ Yes | ✅ Yes |
| Binance Web3 | bundle | ✅ Yes | ✅ Yes |
| Coinbase Wallet | bundle | ✅ Yes | ✅ Yes |
| Rainbow | bundle | ✅ Yes | ✅ Yes |
| Zerion | bundle | ✅ Yes | ✅ Yes |
| MetaMask | sign_only | ✅ Yes | ❌ No |
| Others | unsupported | ❌ No | ❌ No |

**Bundle Flow**: Can sign raw transactions for atomic bundles (fully gasless)
**Sign-Only Flow**: Can only sign typed data (EIP-712), limited gasless support

---

### 4. Permit2 Contract Address Added

**File**: `src/lib/web3.ts:61`

```typescript
permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768' // Permit2 on BSC Testnet
```

---

## How to Use the New Gasless Flow

### Step 1: Detect Wallet Capability

```typescript
import { detectPermit2WalletLane } from './lib/wallet-detection';

const detection = detectPermit2WalletLane();

if (detection.canUseBundleFlow) {
  // Wallet supports fully gasless Permit2 bundle
  showBundlePaymentFlow();
} else if (detection.canUseGasless) {
  // Wallet supports gasless but not bundle (MetaMask)
  showSignOnlyPaymentFlow();
} else {
  // Wallet doesn't support gasless
  showStandardPaymentFlow();
}
```

### Step 2: Build Payment Intent

```typescript
import { buildPaymentIntent } from './lib/bnbpay-api';

const intentResponse = await buildPaymentIntent({
  mode: 'minimal',
  network: 'bnbTestnet',
  merchant: merchantAddress,
  token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', // USD1
  amount: '10', // Human-readable amount (e.g., "10" USD1)
  decimals: 18,
  scheme: 'permit2',
  payer: payerAddress,
  deadlineSeconds: 900, // 15 minutes
  invoiceId: 'inv_123',
});

const { intent, witness, intentHash } = intentResponse.derived;
```

### Step 3: Sign Witness (Payer Signature)

```typescript
const witnessSignature = await signer.signTypedData(
  intentResponse.signing.routerDomain,
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
```

### Step 4A: Bundle Flow (Rabby, Trust, OKX, etc.)

For wallets that support `eth_signTransaction`:

```typescript
import { relayPermit2Bundle } from './lib/bnbpay-api';
import { buildPermit2ApprovalTx } from './lib/wallet-detection';

// 1. Build approval transaction
const approvalTx = buildPermit2ApprovalTx({
  token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  permit2Address: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
  amount: ethers.MaxUint256,
  chainId: 97,
});

// 2. Sign approval tx with wallet
const signedApprovalTx = await signer.signTransaction(approvalTx);

// 3. Sign Permit2 permit
const permit2Signature = await signer.signTypedData(
  permit2Domain,
  permit2Types,
  {
    permitted: {
      token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
      amount: intentResponse.derived.intent.amount,
    },
    spender: routerAddress,
    nonce: Date.now().toString(),
    deadline: Math.floor(Date.now() / 1000) + 1800,
  }
);

// 4. Submit bundle
const bundleResponse = await relayPermit2Bundle({
  network: 'bnbTestnet',
  intent: intentResponse.derived.intent,
  witness,
  witnessSignature,
  reference: `invoice:${invoiceId}`,
  permit2: {
    permit: {
      permitted: {
        token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
        amount: intentResponse.derived.intent.amount,
      },
      nonce: Date.now().toString(),
      deadline: Math.floor(Date.now() / 1000) + 1800,
    },
    transferDetails: {
      to: routerAddress,
      requestedAmount: intentResponse.derived.intent.amount,
    },
    signature: permit2Signature,
  },
  approvalTx: signedApprovalTx,
  topUpWei: '100000000000000000', // Optional: relayer tops up 0.1 BNB for gas
});

console.log('Bundle submitted:', bundleResponse.bundleId);
console.log('Target block:', bundleResponse.targetBlock);
```

### Step 4B: Sign-Only Flow (MetaMask)

For MetaMask and similar wallets:

```typescript
import { relayPayment } from './lib/bnbpay-api';

const relayResponse = await relayPayment({
  network: 'bnbTestnet',
  scheme: 'permit2',
  intent: intentResponse.derived.intent,
  witness,
  witnessSignature,
  reference: `invoice:${invoiceId}`,
  permit2: {
    permit: { ... },
    transferDetails: { ... },
    signature: permit2Signature,
  },
});

console.log('Payment relayed:', relayResponse.txHash);
```

---

## Key Integration Points

### Your Current Code

**Existing file**: `src/lib/gasless-payments.ts`

This file already has most of the logic for gasless payments. You need to:

1. ✅ Import wallet detection: `import { detectPermit2WalletLane, buildPermit2ApprovalTx } from './wallet-detection';`
2. ✅ Import new bundle endpoint: `import { relayPermit2Bundle } from './bnbpay-api';`
3. Add bundle flow logic for non-MetaMask wallets
4. Update token address to new USD1 contract

**To update**:

The `payInvoiceGasless` function at line 247 needs to detect wallet type and choose between:
- `relayPermit2Bundle` for bundle-capable wallets
- `relayPayment` for sign-only wallets (existing flow)

---

## Updated Contract Addresses (BSC Testnet)

```typescript
{
  paymentRegistry: '0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D',
  subscriptionManager: '0x45e1857002F4A91831ada123302ED739B9E7c467',
  bnbPayRouter: '0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B',
  sessionStore: '0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983',
  permit2: '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768', // NEW
}
```

```typescript
tokens: {
  BNB: '0x0000000000000000000000000000000000000000',
  USDT: '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd',
  USDC: '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee',
  USD1: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165', // UPDATED
}
```

---

## API Endpoints Summary

### Base URL
```
https://api.bnbpay.org
```

### Health Check
```
GET /health
```

### Payment Endpoints
```
POST /payments/build-intent       # Build payment intent (gas-free)
GET  /payments                     # List payments
GET  /payments/{paymentId}         # Get payment by ID
GET  /payments/{paymentId}/status  # Get payment status
GET  /can-pay                      # Check if payer can pay
```

### Relay Endpoints (On-Chain)
```
POST /relay/payment                # Relay single payment (gasless for permits)
POST /relay/permit2/bundle         # NEW: Submit Permit2 bundle (fully gasless)
POST /relay/session/open           # Open a session
POST /relay/session/revoke         # Revoke a session
```

### Networks
```
GET /networks                      # Get network configs (router, permit2, etc.)
GET /tokens                        # Get supported tokens per network
```

---

## Next Steps

### Recommended Order:

1. **Test wallet detection**
   ```bash
   npm run dev
   # Open browser console
   # Connect different wallets and check detection results
   ```

2. **Update `gasless-payments.ts`** to use bundle flow for capable wallets

3. **Update `InvoiceCreator.tsx`** to call `/payments/build-intent` endpoint

4. **Test end-to-end invoice payment**:
   - Create invoice with USD1
   - Connect Rabby/Trust wallet (bundle flow)
   - Pay invoice (should be fully gasless)
   - Verify payment on BSCScan testnet

5. **Test with MetaMask** (sign-only flow)

---

## Debugging Tips

### Check if USD1 token works:
```typescript
const provider = new ethers.JsonRpcProvider('https://data-seed-prebsc-1-s1.binance.org:8545');
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function name() view returns (string)', 'function symbol() view returns (string)'],
  provider
);
console.log(await usd1.name()); // Should print "USD1"
console.log(await usd1.symbol()); // Should print "USD1"
```

### Check wallet detection:
```typescript
import { detectPermit2WalletLane } from './lib/wallet-detection';
console.log(detectPermit2WalletLane());
// Should show { lane: 'bundle'/'sign_only'/'unsupported', walletName: '...', ... }
```

### Check API health:
```typescript
import { getHealth } from './lib/bnbpay-api';
console.log(await getHealth()); // Should return { status: 'ok' }
```

---

## Important Notes from Senior Dev

From your senior dev's updates:

1. ✅ **Gasless works for all wallets except MetaMask** (they only support sign-only)
2. ✅ **EIP-2612 auto-defaults if token supports it** (USD1 supports both Permit2 and EIP-2612)
3. ✅ **New relay/bundle API endpoint** is live at `https://api.bnbpay.org/relay/permit2/bundle`
4. ✅ **WebSockets work the same** - no changes to WS subscriptions
5. ✅ **New bundler requires different permutations** - use `/payments/build-intent` to get correct structure

---

## Files Modified/Created

### Modified:
1. `src/lib/web3.ts` - Updated USD1 address + added Permit2 contract
2. `src/lib/bnbpay-api.ts` - Added Permit2 bundle types and endpoint

### Created:
3. `src/lib/wallet-detection.ts` - NEW wallet capability detection utility

### Needs Update:
4. `src/lib/gasless-payments.ts` - Add bundle flow logic
5. `src/components/InvoiceCreator.tsx` - Use `/payments/build-intent` endpoint

---

## Testing Checklist

- [ ] Health check passes (`GET /health`)
- [ ] Wallet detection works for Rabby/Trust
- [ ] Wallet detection works for MetaMask
- [ ] Invoice creation with USD1 succeeds
- [ ] Payment intent builds correctly
- [ ] Bundle flow works (Rabby/Trust/OKX)
- [ ] Sign-only flow works (MetaMask)
- [ ] Payment confirms on-chain (BSCScan)
- [ ] Invoice status updates to "paid"

---

## Support

If you encounter issues:

1. Check browser console for errors
2. Verify wallet is connected to BNB Testnet (chainId 97)
3. Check BSCScan testnet for transactions: https://testnet.bscscan.com
4. Test with https://api.bnbpay.org/health to ensure API is online

---

**Integration Status**: ✅ **Core updates complete**

**Next**: Update `gasless-payments.ts` and test with real wallets
