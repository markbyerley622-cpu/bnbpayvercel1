# 🔴 URGENT: API Bug in `/payments/build-intent`

## Summary
The `/payments/build-intent` endpoint is returning **incorrect amount values**, causing all gasless payments to fail with error `0xee7ad419`.

## The Problem

### What Should Happen:
When sending:
```json
{
  "amount": "6",
  "decimals": 18,
  "token": "0xE71Ad4C949dF74c229697b3A8414A0833ABd4165"
}
```

API should return:
```json
{
  "derived": {
    "intent": {
      "amount": "6000000000000000000"  // 6 × 10^18
    }
  }
}
```

### What Actually Happens:
API returns:
```json
{
  "derived": {
    "intent": {
      "amount": "6000000"  // Only 6 × 10^6 ❌
    }
  }
}
```

## Evidence

From browser console logs:

```
Build request: {
  mode: 'minimal',
  network: 'bnbTestnet',
  merchant: '0xC671DE9012fb37122fbCeFC9F0AC8B99abb2F556',
  token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  amount: '6',         // Input: 6 tokens
  decimals: 18,        // USD1 has 18 decimals
  scheme: 'permit2'
}

Intent object: {
  amount: '6000000',   // ❌ WRONG - Should be 6000000000000000000
  token: '0xE71Ad4C949dF74c229697b3A8414A0833ABd4165',
  ...
}
```

## Impact

This breaks **all gasless payments** because:

1. The Permit2 signature is signed for amount `6000000000000000000` (correct)
2. But the intent hash includes amount `6000000` (wrong)
3. Contract validates the signature against the intent hash
4. Signature verification fails → **Error 0xee7ad419 (PayerMismatch)**

## Steps to Reproduce

1. Create invoice for 6 USD1
2. Approve Permit2 for USD1 (confirmed working)
3. Try gasless payment
4. Check console logs - intent.amount is wrong
5. Payment fails with `0xee7ad419`

## Expected Behavior

The API should:
- Parse `amount: "6"` and `decimals: 18`
- Calculate: `6 × 10^18 = 6000000000000000000`
- Return this in `derived.intent.amount`

## Workaround

None - this must be fixed server-side because:
- The `intentHash` is calculated on the server
- Changing amount locally breaks the hash
- Signatures become invalid

## Fix Required

**File**: `bnbpay-api/src/api/routes/payments.ts` (likely)
**Endpoint**: `POST /payments/build-intent`
**Issue**: Amount conversion from human-readable to wei

Probably missing:
```typescript
const amountWei = parseUnits(request.amount, request.decimals || 18);
```

Instead using:
```typescript
const amountWei = parseUnits(request.amount, 6); // ❌ Wrong decimals
```

## Testing After Fix

```bash
curl -X POST https://api.bnbpay.org/payments/build-intent \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "minimal",
    "network": "bnbTestnet",
    "merchant": "0xC671DE9012fb37122fbCeFC9F0AC8B99abb2F556",
    "token": "0xE71Ad4C949dF74c229697b3A8414A0833ABd4165",
    "amount": "6",
    "decimals": 18,
    "scheme": "permit2",
    "payer": "0xC671DE9012fb37122fbCeFC9F0AC8B99abb2F556",
    "deadlineSeconds": 900,
    "invoiceId": "test_invoice"
  }'
```

**Expected**:
```json
{
  "derived": {
    "intent": {
      "amount": "6000000000000000000"
    }
  }
}
```

**Currently returns**:
```json
{
  "derived": {
    "intent": {
      "amount": "6000000"
    }
  }
}
```

## Priority

**🔴 CRITICAL** - Blocks all gasless payments

## Status

- ✅ Permit2 approval working
- ✅ Token balance sufficient
- ✅ Wallet connected correctly
- ❌ **API returning wrong amount**
- ❌ All payments fail

## Contact




