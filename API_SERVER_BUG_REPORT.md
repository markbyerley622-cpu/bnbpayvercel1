# BNBPay API Server Bug Report - Extra Argument in Contract Calls

## Bug Summary

The BNBPay API server (`https://api.bnbpay.org` and local `bnbpay-api`) is passing **11 arguments** to the `payWithPermit2`, `payWithEIP2612`, and `payWithEIP3009` contract functions when they only expect **10 arguments**.

This causes ethers.js to throw:
```
no matching fragment (operation="fragment", info={ "key": "payWithPermit2" }, code=UNSUPPORTED_OPERATION)
```

## Affected Files

`bnb-pay/bnbpay-api/src/relay/service.ts`

## Root Cause

The `buildPermit2Tx`, `buildEip2612Tx`, and `buildEip3009Tx` functions are passing the `reference` parameter as an **extra 11th argument** after already including `payload.referenceData` as the 10th argument in the args array.

## Bug Details

### buildPermit2Tx (Line 290-313)

```typescript
async function buildPermit2Tx(
  router: ReturnType<typeof BNBPayRouter__factory.connect>,
  reference: string,  // ← This parameter
  payload: ReturnType<typeof buildRelayPayload>,
  request: RelayPaymentRequest
) {
  const { permit, transferDetails, signature } = request.permit2!;
  const args = [
    payload.intent,
    payload.witness,
    request.witnessSignature,
    permit,
    transferDetails,
    signature,
    payload.sessionAuth,
    request.sessionAuthSignature,
    payload.session,
    payload.referenceData,  // ← 10th argument (already includes reference!)
  ] as const;
  if (payload.session) {
    return (router as any).payWithPermit2Session.populateTransaction(...(args as any));
  }
  return (router as any).payWithPermit2.populateTransaction(...(args as any), reference);
  //                                                                          ^^^^^^^^^ BUG: Passing reference as 11th arg!
}
```

### The Contract Function Signature

From `BNBPayRouter.json` ABI, the `payWithPermit2` function expects **10 parameters**:

1. `intent` - PaymentIntent struct
2. `witness` - FlexWitness struct
3. `witnessSig` - bytes
4. `permit` - PermitTransferFrom struct
5. `details` - SignatureTransferDetails struct
6. `signature` - bytes
7. `auth` - SessionSpendAuth struct (can be empty for non-session)
8. `authSig` - bytes (can be empty for non-session)
9. `sessionCtx` - SessionContext struct (can be empty for non-session)
10. `referenceData` - string ✅ **This is the reference**

## Why This Happens

The `reference` parameter in `buildPermit2Tx` comes from:

```typescript
// service.ts line 118
txRequest = await buildPermit2Tx(router, payload.referenceData, payload, request);
//                                        ^^^^^^^^^^^^^^^^^^^^^ This IS the reference
```

So `buildPermit2Tx` receives `payload.referenceData` as the `reference` parameter, includes it in the args array at position 10, then **passes it again** as an 11th argument!

## The Fix

Remove the extra `reference` parameter from the `populateTransaction` call:

### Before (Buggy)
```typescript
return (router as any).payWithPermit2.populateTransaction(...(args as any), reference);
```

### After (Fixed)
```typescript
// BUG FIX: Don't pass reference again - it's already in payload.referenceData (args[9])
return (router as any).payWithPermit2.populateTransaction(...(args as any));
```

## Files to Fix

Apply the same fix to all three payment schemes:

### 1. `buildPermit2Tx` (Line 312)
```typescript
// BEFORE
return (router as any).payWithPermit2.populateTransaction(...(args as any), reference);

// AFTER
return (router as any).payWithPermit2.populateTransaction(...(args as any));
```

### 2. `buildEip2612Tx` (Line 339)
```typescript
// BEFORE
return (router as any).payWithEIP2612.populateTransaction(...(args as any), reference);

// AFTER
return (router as any).payWithEIP2612.populateTransaction(...(args as any));
```

### 3. `buildEip3009Tx` (Line 367)
```typescript
// BEFORE
return (router as any).payWithEIP3009.populateTransaction(...(args as any), reference);

// AFTER
return (router as any).payWithEIP3009.populateTransaction(...(args as any));
```

## Error Example from Production

When calling `/relay/payment` with Permit2 scheme, the error args show 11 parameters:

```json
{
  "args": [
    { "amount": "6000000000000000000", "deadline": 1764653139, ... },  // 1. intent
    { "intentHash": "0x...", "payer": "0x5828...", ... },              // 2. witness
    "0x3789f0f7813590dd...",                                            // 3. witnessSig
    { "deadline": 1764653139, "nonce": "...", "permitted": {...} },    // 4. permit
    { "requestedAmount": "6000000000000000000", "to": "0xA3d..." },    // 5. details
    "0xb0d43b9ce6466e10...",                                            // 6. signature
    null,                                                               // 7. auth
    null,                                                               // 8. authSig
    null,                                                               // 9. sessionCtx
    "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1",                    // 10. referenceData ✅
    "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1"                     // 11. DUPLICATE! ❌
  ],
  "key": "payWithPermit2"
}
```

Notice the reference string appears **twice** - positions 10 and 11!

## Impact

- **ALL Permit2 payments fail** with "no matching fragment" error
- **ALL EIP-2612 payments fail** with the same error
- **ALL EIP-3009 payments fail** with the same error
- **ONLY session-based payments work** (because they use a different code path that doesn't have the bug - line 310/337/365)

## Workaround

Currently, there is **NO client-side workaround**. The bug must be fixed on the server side.

## Status in Local Codebase

I've already applied the fix to the local `bnb-pay/bnbpay-api/src/relay/service.ts` file, but the production API server at `https://api.bnbpay.org` still has the bug.

## Recommended Actions

1. **Apply the fix** to `bnb-pay/bnbpay-api/src/relay/service.ts` (lines 312, 339, 367)
2. **Rebuild the API server**: `npm run build`
3. **Deploy to production**: Update `https://api.bnbpay.org`
4. **Add regression test** to ensure contract calls have correct number of arguments

## Test Case

After the fix, this relay request should succeed:

```bash
curl -X POST https://api.bnbpay.org/relay/payment \
  -H "Content-Type: application/json" \
  -d '{
    "network": "bnbTestnet",
    "scheme": "permit2",
    "intent": {
      "paymentId": "0x...",
      "merchant": "0x7b4E5C26c887500Df42BE6327ddaD211811BA34A",
      "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
      "amount": "6000000000000000000",
      "deadline": 1764653139,
      "resourceId": "0x...",
      "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c"
    },
    "witness": {
      "schemeId": "0xc16f881b3dd0a1bf52965fa8de2adc6199cef183866d9a9b5b0ae9dc5897512f",
      "intentHash": "0x9fd900364fac8fee3f8c9e9cebd481207de47e97179bce283b67a82a8d92d997",
      "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c",
      "salt": "0x000000000000000000000000000000000000000000000000cad8a504861d1c93"
    },
    "witnessSignature": "0x3789f0f7...",
    "reference": "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1",
    "permit2": {
      "permit": {
        "permitted": {
          "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
          "amount": "6000000000000000000"
        },
        "nonce": "1764649539491",
        "deadline": 1764653139
      },
      "transferDetails": {
        "to": "0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B",
        "requestedAmount": "6000000000000000000"
      },
      "signature": "0xb0d43b9c..."
    }
  }'
```

Expected response:
```json
{
  "txHash": "0x...",
  "network": "bnbTestnet",
  "paymentId": "0x...",
  "referenceId": "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1"
}
```

## Related Issues

- All non-session gasless payments currently fail
- Invoice payments with Permit2 are blocked
- Subscription payments with EIP-2612 are blocked

## Priority

**CRITICAL** - This blocks all gasless payment functionality except session-based flows.

## Contact

Reported by: Claude Code AI Assistant
Date: 2025-12-02
Local fix applied to: `C:\Users\markb\Desktop\bnb-pay\bnbpay-api\src\relay\service.ts`
Production API affected: `https://api.bnbpay.org`
