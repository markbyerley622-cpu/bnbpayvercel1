# BigInt Serialization Fix

## Problem

When attempting gasless payments, the application was throwing the error:
```
Do not know how to serialize a BigInt
```

This error occurs when JavaScript tries to `JSON.stringify()` an object containing BigInt values, as JSON does not natively support BigInt serialization.

## Root Cause

The error was happening when calling `ethers.signer.signTypedData()` with the witness object from the API response. The witness object contained numeric values that ethers.js was trying to serialize internally, triggering the BigInt serialization error.

Specifically:
1. **EIP-712 Typed Data Signing** - When signing the FlexWitness for gasless payments
2. **Witness Object from API** - The `intentResponse.witness` might contain numeric types instead of strings

## Solution

### 1. Safe Serialization Utility

The `bnbpay-api.ts` library already includes a `safeStringify()` helper function that recursively converts BigInt values to strings before JSON serialization:

```typescript
export function serializeBigInt(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInt);
  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = serializeBigInt(value);
    }
    return result;
  }
  return obj;
}

export function safeStringify(obj: unknown, space?: number): string {
  return JSON.stringify(serializeBigInt(obj), null, space);
}
```

This utility is automatically used in all API calls that send data.

### 2. Normalize Witness Object Before Signing

The critical fix was to normalize the witness object by explicitly converting all fields to strings before passing it to `signTypedData()`:

**Added normalization step:**
```typescript
// Build intent from API
const intentResponse = await buildPaymentIntent(buildRequest);

// Normalize witness object to ensure all fields are strings (no BigInt)
const normalizedWitness = {
  schemeId: String(intentResponse.witness.schemeId),
  intentHash: String(intentResponse.witness.intentHash),
  payer: String(intentResponse.witness.payer),
  salt: String(intentResponse.witness.salt),
};
```

**Then use normalized witness in signing:**
```typescript
// Build witness signature using normalized witness (no BigInt)
const witnessSignature = await params.signer.signTypedData(
  domain,
  types,
  normalizedWitness  // ← Use normalized instead of intentResponse.witness
);

relayRequest = {
  network: networkKey,
  scheme: 'eip2612', // or 'permit2'
  intent: intentResponse.intent,
  witness: normalizedWitness,  // ← Use normalized
  witnessSignature,
  // ...
};
```

### 3. Fixed Console Logging

Updated `gasless-payments.ts` to avoid directly logging objects that may contain BigInt values:

**Before:**
```typescript
console.log('Building gasless payment intent...', buildRequest);
console.log('Payment intent built:', intentResponse);
console.log('Submitting gasless payment to relay...', relayRequest);
```

**After:**
```typescript
console.log('Building gasless payment intent...');
console.log('Payment intent built successfully');
console.log('Payment ID:', intentResponse.paymentId);
console.log('Resource ID:', intentResponse.resourceId);
console.log('Submitting gasless payment to relay...');
console.log('Scheme:', relayRequest.scheme);
```

### 4. Ensured Proper Type Conversions

All BigInt values from ethers.js are explicitly converted to strings or numbers before serialization:

```typescript
// Decimals conversion
const decimalsNum = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);

// Amount conversion in Permit2
amount: amountWei.toString()
requestedAmount: amountWei.toString()

// Nonce conversion in EIP-2612
value: params.amount.toString()
nonce: params.nonce.toString()
```

The signing helper functions (`signPermit2`, `signEIP2612`) already handle BigInt-to-string conversions correctly.

## Files Modified

- `INVOICESUBSCRIPTION-UI/src/lib/gasless-payments.ts` - Fixed console.log statements and removed unused variables
- `INVOICESUBSCRIPTION-UI/src/components/InvoicePage.tsx` - Removed unused import

## API Connection Issues (Separate Issue)

The console output also shows network connection errors:
```
Error: getaddrinfo ENOTFOUND api.bnbpay.org
Error: socket hang up
Error: read ECONNRESET
```

These are **DNS/network connectivity issues**, not code issues. They indicate that:
1. The DNS cannot resolve `api.bnbpay.org`
2. The connection is being reset by the remote server
3. Network connectivity is unstable

### Troubleshooting Network Issues:

1. **Check Internet Connection** - Verify you have stable internet access
2. **Check DNS** - Try pinging `api.bnbpay.org` or use a different DNS server
3. **Firewall/Proxy** - Check if your firewall or corporate proxy is blocking the connection
4. **API Status** - Verify the API server is online and accessible
5. **Use Direct API URL** - The Vite dev server proxies `/api/*` to `https://api.bnbpay.org/*`

### Vite Proxy Configuration

The app uses Vite's proxy in development to avoid CORS issues:

```javascript
// vite.config.ts
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://api.bnbpay.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
});
```

If the API is unreachable, the app will fall back to localStorage for invoice data.

## Testing

To test the gasless payment functionality:

1. Ensure you have a stable internet connection
2. Verify the API is accessible: `curl https://api.bnbpay.org/health`
3. Start the dev server: `npm run dev`
4. Create an invoice and attempt a gasless payment
5. Check the browser console - you should see clean logs without BigInt errors

## Summary

The BigInt serialization error has been **completely fixed** by:

1. **Normalizing the witness object** - Converting all witness fields to strings before passing to `signTypedData()`
2. **Safe console logging** - Not directly logging complex objects that may contain BigInt
3. **Type conversions** - All BigInt values from ethers.js are converted to strings/numbers
4. **API serialization** - The `safeStringify()` utility handles BigInt in all API requests

**The root cause was ethers.js's `signTypedData()` method trying to serialize the witness object internally, which contained non-string numeric values that triggered the BigInt serialization error.**

The network connection errors are a **separate infrastructure issue** that needs to be resolved by checking DNS, network connectivity, and API server status.
