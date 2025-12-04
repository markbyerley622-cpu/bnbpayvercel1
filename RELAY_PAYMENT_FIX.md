# Relay Payment Fix - "No Matching Fragment" Error

## Problem

When attempting to pay an invoice using the Permit2 gasless flow, the BNBPay API relay endpoint returned:

```
400 Bad Request: no matching fragment (operation="fragment", info={ "args": [...], "key": "payWithPermit2" }, code=UNSUPPORTED_OPERATION)
```

### Root Cause

The error occurred because there was a **payer address mismatch** between the `intent` and `witness` objects being sent to the relay endpoint:

- **Intent.payer**: `0x0000000000000000000000000000000000000000` (zero address)
- **Witness.payer**: `0x5828014eA4DfaB2d17a05738d043216ABFf73f7c` (actual payer)

This mismatch caused the ethers.js ABI decoder on the server side to fail when trying to match the function signature for `payWithPermit2`.

## Why This Happened

In the `gasless-payments.ts` file, we were constructing the relay intent using:

```typescript
const relayIntent = {
  // ...
  payer: intentResponse.derived.intent.payer, // ❌ WRONG - This was zero address
  // ...
};
```

The `buildPaymentIntent` API response has two payer fields:
1. **`input.payer`** - The actual payer address we sent in the request ✅
2. **`derived.intent.payer`** - May be zero address for permit2 schemes ❌

For Permit2 schemes, the `derived.intent.payer` can be zero address because the actual payer is extracted from the Permit2 signature at settlement time. However, for the relay request, we need to send the actual payer address to match the witness signature.

## Solution

Changed both occurrences in `gasless-payments.ts` to use `input.payer` instead:

```typescript
const relayIntent = {
  paymentId: intentResponse.derived.intent.paymentId,
  merchant: intentResponse.derived.intent.merchant,
  token: intentResponse.derived.intent.token,
  amount: intentResponse.derived.intent.amount,
  deadline: intentResponse.derived.intent.deadline,
  payer: intentResponse.input.payer, // ✅ CORRECT - Use input payer
  resourceId: intentResponse.derived.intent.resourceId,
  referenceHash: intentResponse.derived.intent.referenceHash,
};
```

This ensures the payer address in the `intent` matches the payer address in the `witness`, allowing the ABI decoder to properly match the `payWithPermit2` function signature.

## Verification

After this fix, the relay request structure is:

```json
{
  "network": "bnbTestnet",
  "scheme": "permit2",
  "intent": {
    "paymentId": "0x...",
    "merchant": "0x7b4E5C26c887500Df42BE6327ddaD211811BA34A",
    "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
    "amount": "6000000000000000000",
    "deadline": 1764650532,
    "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c", // ✅ Actual payer
    "resourceId": "0x...",
    "referenceHash": "0x..."
  },
  "witness": {
    "schemeId": "0x...",
    "intentHash": "0x...",
    "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c", // ✅ Matches intent.payer
    "salt": "0x..."
  },
  "witnessSignature": "0x...",
  "reference": "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1",
  "permit2": {
    "permit": {
      "permitted": {
        "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
        "amount": "6000000000000000000"
      },
      "nonce": "1764646933353",
      "deadline": 1764650533
    },
    "transferDetails": {
      "to": "0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B", // Router address
      "requestedAmount": "6000000000000000000"
    },
    "signature": "0x..."
  }
}
```

**Key Point**: `intent.payer` and `witness.payer` now both have the same address, allowing the contract ABI decoder to successfully match the `payWithPermit2` function.

## Testing

To test the fix:

1. Create an invoice
2. Open the payment modal
3. Click "Pay (Gasless)"
4. Sign the Permit2 signature
5. Sign the witness signature
6. Payment should relay successfully to the API
7. Transaction hash should be returned

Expected console output:
```
🚀 Using gasless payment flow...
Building gasless payment intent...
Payment intent built successfully
Using Permit2 for gasless payment...
Submitting gasless payment to relay...
✅ Gasless payment relayed successfully
Transaction Hash: 0x...
Payment ID: 0x...
```

## Additional Notes

### Why Two Payer Fields?

The API returns two payer fields for different purposes:

1. **`input.payer`** - The payer address you sent in the build request. Use this for constructing relay requests.

2. **`derived.intent.payer`** - The payer address that will be used on-chain. For permit2 schemes, this may be zero address because:
   - The actual payer is extracted from the Permit2 signature at settlement time
   - The router contract validates the signature and pulls the payer from it
   - This allows the intent to be "open" to any payer with a valid signature

### Signature Requirements

As per your senior dev's guidance, you need **two signatures** for Permit2 payments:

1. **Witness Signature (EIP-712)**
   - Domain: BNBPayRouter
   - Message: FlexWitness (schemeId, intentHash, payer, salt)
   - Purpose: Proves the payer authorizes this specific intent

2. **Permit2 Signature (EIP-712)**
   - Domain: Permit2
   - Message: PermitTransferFrom (token, amount, nonce, deadline)
   - Purpose: Authorizes the router to transfer tokens

Both signatures must be from the same payer address, and that address must match in both the intent and witness.

## Files Modified

- `src/lib/gasless-payments.ts` - Line ~407 and ~340 (2 occurrences fixed)

## Related Documentation

- `GASLESS_INTEGRATION_GUIDE.md` - Complete integration guide
- `IMPLEMENTATION_COMPLETE.md` - Implementation summary
- `QUICK_START.md` - Quick reference

## Status

✅ **FIXED** - The payer address mismatch has been corrected. The gasless payment flow should now work correctly with the BNBPay relay endpoint.
