# How to Start Local BNBPay API with Fixes

## Problem

The production API at `https://api.bnbpay.org` has TWO bugs:

1. **Validation strips `payer` field** - Zod schema doesn't allow `payer`, so it gets removed and defaults to zero address
2. **Passes duplicate `reference` parameter** - Server passes 11 arguments when contract expects 10

## Fixes Applied

I've fixed BOTH bugs in your local copy:

1. **`bnb-pay/bnbpay-api/src/api/routes/relay.ts`** (Line 17-18)
   - Added `payer` and `referenceHash` as optional fields to validation schema

2. **`bnb-pay/bnbpay-api/src/relay/service.ts`** (Lines 313, 340, 369)
   - Removed duplicate `reference` parameter from contract calls

3. **`bnb-pay/bnbpay-api/dist/api/routes/relay.js`** (Lines 13-14)
   - Updated compiled JavaScript to include optional fields

## Steps to Run Local API

### 1. Build the SDK Package

```bash
cd C:\Users\markb\Desktop\bnb-pay\packages\sdk-ts
npm install
npm run build
```

If `tsc` is not found, install TypeScript globally:
```bash
npm install -g typescript
```

### 2. Link the SDK to the API

```bash
cd C:\Users\markb\Desktop\bnb-pay\packages\sdk-ts
npm link

cd C:\Users\markb\Desktop\bnb-pay\bnbpay-api
npm link @bnbpay/sdk
```

### 3. Start the API Server

```bash
cd C:\Users\markb\Desktop\bnb-pay\bnbpay-api
npm start
```

The API should start on `http://localhost:3001`

### 4. Verify It's Running

Open a new terminal and test:

```bash
curl http://localhost:3001/health
```

Or use PowerShell:
```powershell
Invoke-WebRequest -Uri http://localhost:3001/health -UseBasicParsing
```

You should see a health check response.

### 5. Test a Payment

Your frontend is already configured to use `localhost:3001` (see `vite.config.ts`).

Just **hard refresh your browser** (Ctrl+Shift+R) and try the payment again!

## What's Fixed

### Before (Buggy Production API)

**Validation strips payer:**
```json
{
  "intent": {
    "paymentId": "0x...",
    "payer": "0x5828..."
  }
}
// After validation ↓
{
  "intent": {
    "paymentId": "0x...",
    // payer REMOVED! Defaults to 0x0000...
  }
}
```

**Contract call with 11 arguments:**
```javascript
router.payWithPermit2(
  ...args,  // 10 arguments
  reference // 11th argument (duplicate!)
)
```

### After (Fixed Local API)

**Validation preserves payer:**
```json
{
  "intent": {
    "paymentId": "0x...",
    "payer": "0x5828..."  // ✅ PRESERVED
  }
}
```

**Contract call with 10 arguments:**
```javascript
router.payWithPermit2(...args)  // ✅ Only 10 arguments
```

## Troubleshooting

### SDK Not Found

If you see:
```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '@bnbpay/sdk'
```

**Solution**: Build and link the SDK (steps 1-2 above)

### Port Already in Use

If port 3001 is already in use:

```bash
# Find process using port 3001
netstat -ano | findstr :3001

# Kill the process (replace PID with actual PID)
taskkill //F //PID <PID>
```

### TypeScript Not Found

If `tsc` command not found:

```bash
npm install -g typescript
```

## Alternative: Report to Backend Team

If you can't get the local API running, you need to report these bugs to the BNBPay backend team. Share:

1. **`API_SERVER_BUG_REPORT.md`** - Detailed bug report
2. **This file** - Shows the exact fixes needed

The production API needs these same changes deployed.

## Summary

**It's NOT your fault!** The backend API has bugs that:

1. Strip the `payer` field during validation (causing zero address)
2. Pass 11 arguments instead of 10 (causing "no matching fragment")

Your frontend code is correct - it's sending the right data. The API just needs to be fixed to accept it.
