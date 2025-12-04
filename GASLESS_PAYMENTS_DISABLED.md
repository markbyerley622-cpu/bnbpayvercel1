# Gasless Payments Temporarily Disabled

## Date: 2025-12-01

## Summary

**Gasless payments have been temporarily disabled** in the UI due to a critical server-side bug in the BNBPay API.

## The Issue

The BNBPay API endpoint `POST /payments/build-intent` is returning a **500 Internal Server Error** with the message:
```
"Do not know how to serialize a BigInt"
```

This is a **server-side bug**, not a client-side issue.

## Root Cause

The API server is:
1. ✅ Receiving valid requests from the client
2. ✅ Processing payment intents
3. ❌ **Failing to serialize BigInt values** in the response (intentHash, paymentId, witness fields)
4. ❌ Crashing with a 500 error

The server code needs to convert BigInt to strings before sending JSON responses.

## Client-Side Changes

To protect users from a broken experience, we have:

### 1. Disabled the Gasless Button
```typescript
<button
  disabled={true /* Temporarily disabled due to API server bug */}
  title="Gasless payments temporarily unavailable due to API server issue"
>
  Gasless
</button>
```

### 2. Added Prominent Warning Banner
A red warning banner is now displayed for all ERC20 token payments:

```
⚠️ Gasless Payments Temporarily Unavailable

The API server is experiencing a technical issue with gasless payment processing.
Please use "Pay with Gas" mode (already selected).
We apologize for the inconvenience.

Technical: Server-side BigInt serialization error in /payments/build-intent endpoint.
```

### 3. Default to "Pay with Gas" Mode
Payment mode is forced to 'gas' by default, ensuring users can still make payments.

## Files Modified

- **InvoicePage.tsx**:
  - Disabled gasless button with tooltip
  - Added warning banner
  - Updated comments to explain temporary disable

- **API_BUG_REPORT.md**: Detailed bug report for API maintainers

- **GASLESS_PAYMENTS_DISABLED.md**: This document

## Impact

- ✅ **Users can still make payments** using "Pay with Gas" mode
- ❌ Users **cannot** use gasless (Permit2/EIP-2612) payments
- ❌ Relayer-paid gas feature is unavailable
- ⚠️ Users must have BNB for gas fees

## When to Re-enable

Gasless payments can be re-enabled once:

1. ✅ The API server implements BigInt serialization
2. ✅ The `/payments/build-intent` endpoint returns successful responses
3. ✅ Testing confirms gasless flow works end-to-end

## How to Re-enable

Once the API is fixed, revert these changes:

### 1. Remove the disabled flag:
```typescript
// Change from:
disabled={true /* Temporarily disabled due to API server bug */}

// Back to:
disabled={!walletAddress || (!supportsPermit && !permit2Approved)}
```

### 2. Make warning conditional:
```typescript
// Change from:
{/* API Issue Warning - Always shown for ERC20 tokens */}
<div className="mt-3 p-3 bg-red-500/10...">

// Back to:
{paymentMode === 'gasless' && someCondition && (
  <div className="mt-3 p-3 bg-red-500/10...">
)}
```

Or simply remove the warning banner entirely.

### 3. Test thoroughly:
- Test gasless payments with USDT
- Test gasless payments with USDC
- Test gasless payments with USD1
- Verify Permit2 approval flow
- Verify EIP-2612 permit flow
- Check payment confirmation
- Check API status updates

## Testing the API Fix

To test if the API is fixed, run:

```bash
curl -X POST https://api.bnbpay.org/payments/build-intent \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "minimal",
    "network": "bnbTestnet",
    "merchant": "0x7b4E5C26c887500Df42BE6327ddaD211811BA34A",
    "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
    "amount": "6",
    "decimals": 18,
    "scheme": "permit2",
    "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c",
    "deadlineSeconds": 3600,
    "referenceId": "invoice:test",
    "baseReference": "test"
  }'
```

**Expected (after fix)**: HTTP 200 with JSON response containing properly serialized strings

**Current**: HTTP 500 with "Do not know how to serialize a BigInt" error

## User Experience

Users will see:
1. The gasless button grayed out and non-clickable
2. A red warning banner explaining the situation
3. "Pay with Gas" mode pre-selected and working normally
4. Normal payment flow with user-paid gas fees

This ensures **payments remain functional** while gasless feature is being fixed.

## API Maintainer Action Required

The API team needs to:

1. **Implement BigInt serialization** in response handler
2. **Convert all BigInt to strings** before JSON.stringify()
3. **Test the build-intent endpoint** with the curl command above
4. **Deploy the fix** to production
5. **Notify the client team** when ready for testing

See `API_BUG_REPORT.md` for detailed technical information.

---

**Status**: 🔴 Gasless payments DISABLED (temporary)
**ETA**: Pending API server fix
**Workaround**: Use "Pay with Gas" mode ✅
