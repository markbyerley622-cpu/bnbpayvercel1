# Debug Error 0xee7ad419 - Gasless Payment Failed

## Error Summary

**Error Code**: `0xee7ad419`
**Error Type**: Custom contract revert (execution reverted)
**Contract**: BNBPayRouter at `0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B`

## Probable Causes

### 1. **Insufficient Token Balance** ⚠️
The payer doesn't have enough USD1 tokens to pay the invoice.

**Check**:
```javascript
const provider = new ethers.BrowserProvider(window.ethereum);
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function balanceOf(address) view returns (uint256)'],
  provider
);
const balance = await usd1.balanceOf('0xc671de9012fb37122fbcefc9f0ac8b99abb2f556'); // Your payer address
console.log('USD1 Balance:', ethers.formatUnits(balance, 18));
```

### 2. **Permit2 Not Approved** ⚠️
The payer hasn't approved Permit2 contract to spend their USD1 tokens.

**Check**:
```javascript
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function allowance(address,address) view returns (uint256)'],
  provider
);
const allowance = await usd1.allowance(
  '0xc671de9012fb37122fbcefc9f0ac8b99abb2f556', // payer
  '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768'  // Permit2
);
console.log('Permit2 Allowance:', ethers.formatUnits(allowance, 18));
```

**Fix**: Approve Permit2 first:
```javascript
const signer = await provider.getSigner();
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function approve(address,uint256) returns (bool)'],
  signer
);
const tx = await usd1.approve(
  '0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768',
  ethers.MaxUint256
);
await tx.wait();
console.log('Approved!');
```

### 3. **Permit2 Signature Issue** ⚠️
The Permit2 signature might be invalid or using wrong witness structure.

**Issue**: Your code is calling `signPermit2WithWitness` which might not match what the router expects.

**From your logs**:
```
✨ USD1 supports gasless payments! EIP-2612 permit enabled.
Gasless ready: Permit2 approved
```

But the error suggests the signature verification is failing.

### 4. **Wrong Scheme Selection** ⚠️
Your senior dev said: "if the token supports 2662 it will default regardless of Permit2"

USD1 supports **BOTH** EIP-2612 and Permit2. The router might be expecting EIP-2612 but you're sending Permit2.

## Solution Steps

### Step 1: Check Token Balance & Get Test Tokens

```bash
# In browser console after connecting wallet
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const address = await signer.getAddress();

const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function balanceOf(address) view returns (uint256)', 'function decimals() view returns (uint8)'],
  provider
);

const balance = await usd1.balanceOf(address);
console.log('Your USD1 Balance:', ethers.formatUnits(balance, 18));
```

**If balance is 0**, you need testnet USD1 tokens. Ask your senior dev for the faucet or minting function.

### Step 2: Use EIP-2612 Instead of Permit2

Since USD1 supports EIP-2612 natively, and your senior dev said it auto-defaults, you should use EIP-2612 flow instead of Permit2.

**File**: `src/lib/gasless-payments.ts:358`

The code checks `supportsEIP2612` and should use that path. But the check might be failing.

**Debug**:
```javascript
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ['function DOMAIN_SEPARATOR() view returns (bytes32)'],
  provider
);
try {
  const sep = await usd1.DOMAIN_SEPARATOR();
  console.log('USD1 supports EIP-2612:', sep);
} catch (e) {
  console.log('USD1 does NOT support EIP-2612');
}
```

### Step 3: Force EIP-2612 Flow

Update `gasless-payments.ts` to explicitly use EIP-2612 for USD1:

```typescript
// Around line 358 in gasless-payments.ts
const hasEIP2612 = await supportsEIP2612(params.tokenAddress, params.provider);

// Force EIP-2612 for USD1 token
const forceEIP2612 = params.tokenAddress.toLowerCase() === '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165'.toLowerCase();

if (hasEIP2612 || forceEIP2612) {
  console.log('Using EIP-2612 permit for gasless payment (native token permit)...');
  // ... rest of EIP-2612 code
}
```

### Step 4: Check Relay Endpoint Response

The error shows it's coming from the relayer trying to execute the transaction. The relayer is doing a dry-run first and it's failing.

**Possible issues**:
1. Payer doesn't have tokens
2. Permit signature is invalid
3. Intent hash mismatch
4. Deadline expired

### Step 5: Use `/payments/build-intent` Endpoint

Your code is manually building the intent. Use the API endpoint instead:

```typescript
// Replace manual intent building with API call
const intentResponse = await buildPaymentIntent({
  mode: 'minimal',
  network: 'bnbTestnet',
  merchant: params.merchantAddress,
  token: params.tokenAddress,
  amount: params.amount, // Human-readable like "10"
  decimals: 18,
  scheme: 'eip2612', // <-- Use eip2612 for USD1
  payer: payerAddress,
  deadlineSeconds: 900,
  invoiceId: params.invoiceId,
});

// The API returns correctly formatted intent, witness, and hashes
const { intent, witness, intentHash } = intentResponse.derived;
```

This ensures the intent structure matches what the relayer expects.

### Step 6: Verify Intent Structure

The intent being sent might have wrong structure. Check console logs:

```
Full relay request: { ... }
```

Verify:
- `intent.payer` is set (not undefined or zero address)
- `intent.amount` is a string (not BigInt)
- `intent.deadline` is unix timestamp (not too small or expired)
- `witness.payer` matches `intent.payer`
- `witnessSignature` is 132 chars (0x + 130 hex chars)

## Quick Fix: Use Standard (Non-Gasless) Payment First

To unblock yourself, use standard payment with gas:

1. Connect MetaMask to BNB Testnet
2. Get test BNB from https://testnet.bnbchain.org/faucet-smart
3. Get test USD1 tokens (ask your senior dev)
4. Approve USD1 for Router: `approve(router, amount)`
5. Call `depositAndSettleToken()` directly on router

Once that works, you can debug the gasless flow separately.

## Contract Error Decoder

The error `0xee7ad419` might correspond to one of these:

```solidity
// Possible contract errors
error InsufficientBalance();        // 0x...
error InvalidPermit();              // 0x...
error ExpiredDeadline();            // 0x...
error InvalidSignature();           // 0x...
error PayerMismatch();              // 0xee7ad419 <-- LIKELY THIS ONE
error AlreadySettled();             // 0x...
```

**PayerMismatch** means the payer in the intent doesn't match the payer in the witness or the signature signer.

## Immediate Actions

1. **Check USD1 balance**: Do you have any USD1 tokens?
   ```bash
   # Get balance
   cast call 0xE71Ad4C949dF74c229697b3A8414A0833ABd4165 \
     "balanceOf(address)(uint256)" \
     0xc671de9012fb37122fbcefc9f0ac8b99abb2f556 \
     --rpc-url https://data-seed-prebsc-1-s1.binance.org:8545
   ```

2. **Approve Permit2** (if using Permit2 flow):
   ```javascript
   // In browser console
   const signer = await (new ethers.BrowserProvider(window.ethereum)).getSigner();
   const usd1 = new ethers.Contract(
     '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
     ['function approve(address,uint256) returns (bool)'],
     signer
   );
   const tx = await usd1.approve('0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768', ethers.MaxUint256);
   await tx.wait();
   ```

3. **Use EIP-2612 instead of Permit2** for USD1 token

4. **Ask your senior dev**:
   - How to get test USD1 tokens?
   - Does the contract have a mint/faucet function?
   - Is there a token faucet URL?

## Testing EIP-2612 vs Permit2

```javascript
// Test EIP-2612 support
const usd1 = new ethers.Contract(
  '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  [
    'function DOMAIN_SEPARATOR() view returns (bytes32)',
    'function nonces(address) view returns (uint256)',
    'function permit(address,address,uint256,uint256,uint8,bytes32,bytes32)'
  ],
  provider
);

try {
  const domain = await usd1.DOMAIN_SEPARATOR();
  const nonce = await usd1.nonces(address);
  console.log('✅ USD1 supports EIP-2612');
  console.log('Domain:', domain);
  console.log('Nonce:', nonce.toString());
} catch (e) {
  console.log('❌ USD1 does NOT support EIP-2612');
}
```

## Expected Flow for USD1 Gasless Payment

Since USD1 supports EIP-2612:

1. Build intent via `/payments/build-intent` with `scheme: 'eip2612'`
2. Sign EIP-2612 permit (not Permit2)
3. Sign witness for router
4. Submit to `/relay/payment` with `scheme: 'eip2612'`
5. Relayer calls `router.payWithEIP2612(intent, witness, permitSig)`

**No Permit2 approval needed** because EIP-2612 is native to the token.

---

## Next Steps

1. Check balance: Do you have USD1?
2. If yes, use EIP-2612 flow (not Permit2)
3. If no, get test tokens from senior dev
4. Test with standard payment first (non-gasless)
5. Once working, add gasless

**Most Likely Issue**: You don't have USD1 tokens or the balance is insufficient for the invoice amount.
