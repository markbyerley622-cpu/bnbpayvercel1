# BNBPay API Server Bug Report

## Issue: BigInt Serialization Error in /payments/build-intent Endpoint

### Environment
- **API**: https://api.bnbpay.org
- **Endpoint**: `POST /payments/build-intent`
- **Network**: bnbTestnet
- **Date**: 2025-12-01

### Problem Description

The `/payments/build-intent` endpoint is returning a **500 Internal Server Error** with the message:
```
"Do not know how to serialize a BigInt"
```

This is a **server-side** JSON serialization error occurring when the API tries to return the response.

### Request (Client Side - CORRECT)

The client is sending a properly formatted request:

```json
{
  "mode": "minimal",
  "network": "bnbTestnet",
  "merchant": "0x7b4E5C26c887500Df42BE6327ddaD211811BA34A",
  "token": "0x60EAA77B631c1c25CE1a825E49E734664C23339B",
  "amount": "6",
  "decimals": 18,
  "scheme": "permit2",
  "payer": "0x5828014eA4DfaB2d17a05738d043216ABFf73f7c",
  "deadlineSeconds": 3600,
  "referenceId": "invoice:4b5d1c85-47ec-460c-a269-49d0f879e4f1",
  "baseReference": "4b5d1c85-47ec-460c-a269-49d0f879e4f1"
}
```

All fields are strings or numbers - no BigInt values are being sent from the client.

### Error Details

**HTTP Status**: 500 Internal Server Error

**Error Message**:
```
BNBPayApiError: Do not know how to serialize a BigInt
    at handleResponse (bnbpay-api.ts:395:11)
```

**Console Log**:
```
:3000/api/payments/build-intent:1  Failed to load resource: the server responded with a status of 500 (Internal Server Error)
```

### Root Cause (Server Side)

The server is:
1. Successfully receiving and parsing the request
2. Processing the payment intent (probably computing intentHash, paymentId, witness fields)
3. Generating BigInt values internally (likely from keccak256 hashing or ethers.js operations)
4. **Failing to serialize these BigInt values** when creating the JSON response

### Expected Behavior

The server should return a successful response with properly serialized values:

```json
{
  "paymentId": "0x...",
  "intent": {
    "paymentId": "0x...",
    "merchant": "0x...",
    "token": "0x...",
    "amount": "6000000000000000000",
    "deadline": 1733064000,
    "resourceId": "0x..."
  },
  "witness": {
    "schemeId": "0x...",
    "intentHash": "0x...",
    "payer": "0x...",
    "salt": "0x..."
  },
  "deadline": 1733064000,
  "resourceId": "0x...",
  "unsignedTx": { ... },
  "estimatedGas": "150000"
}
```

All numeric/hash values should be **strings**, not BigInt.

### Server-Side Fix Required

The API server needs to implement BigInt serialization. Here are recommended fixes:

**Option 1: JSON Replacer Function**
```typescript
JSON.stringify(response, (key, value) =>
  typeof value === 'bigint' ? value.toString() : value
);
```

**Option 2: Recursive Serialization**
```typescript
function serializeBigInt(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

// Before sending response
const serializedResponse = serializeBigInt(responseData);
res.json(serializedResponse);
```

**Option 3: Convert at Generation**
```typescript
// When generating witness/intent
const witness = {
  schemeId: schemeIdBigInt.toString(),  // Convert immediately
  intentHash: intentHashBigInt.toString(),
  payer: payerAddress,
  salt: saltBigInt.toString()
};
```

### Workaround (Client Side)

Until the server is fixed, the client must use the **regular payment flow** (user pays gas) instead of gasless payments:

```typescript
// Temporarily use regular payment flow
result = await payInvoiceThroughRouter({
  merchantAddress: merchant,
  amount: amount,
  paymentToken: tokenSymbol,
  settlementToken: settlementToken,
  invoiceId: invoice.invoiceId || '',
  resourceId: invoice.resourceId,
  network,
});
```

### Impact

- **Gasless payments are currently broken** on testnet and likely mainnet
- Users **cannot** use Permit2 or EIP-2612 permit flows
- All payments must go through regular flow (user pays gas)
- This affects:
  - Invoice payments with gasless mode
  - Subscription charges with permit-based billing
  - Any relay-based payment flows

### Priority

**HIGH** - Core functionality is broken. Gasless payments are a key feature of the BNBPay protocol.

### Testing

To reproduce:
1. Navigate to invoice payment page
2. Select any ERC20 token (USDT, USDC, USD1)
3. Switch to "Gasless" payment mode
4. Click "Pay Now"
5. Error occurs immediately when calling `/payments/build-intent`

### Related Endpoints

Check if other endpoints have the same issue:
- `POST /relay/payment` - May have BigInt serialization issues
- `POST /relay/session/open` - May have BigInt serialization issues
- `GET /payments/{paymentId}` - Should be fine (reads from DB)

### Contact

This bug should be reported to the BNBPay API maintainers immediately.

**Affected Components**:
- API Server (api.bnbpay.org)
- Build Intent endpoint handler
- Payment intent generation logic
- Response serialization middleware

---

**Status**: 🔴 CRITICAL BUG - Gasless payments non-functional
**Date Reported**: 2025-12-01
**Requires**: Server-side fix
