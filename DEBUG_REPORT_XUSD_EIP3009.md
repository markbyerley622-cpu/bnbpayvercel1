# XUSD EIP-3009 Gasless Payment Debug Report

**Date:** December 6, 2025
**Issue:** EIP-3009 gasless payment failing with `UnsupportedToken` error
**Token:** XUSD (`0xBCa3782BC181446a0bdB87356Bde326559a4FAb2`)
**Network:** BNB Testnet (Chain ID: 97)

---

## Summary

The frontend correctly detects XUSD as EIP-3009 compatible and sends the relay request with `scheme: 'eip3009'`. However, the **backend/router contract rejects the token** with error `UnsupportedToken(address)`.

---

## Error Details

### Error Selector
```
0xbf16aab6 = UnsupportedToken(address)
```

### Error Data
```
0xbf16aab6000000000000000000000000bca3782bc181446a0bdb87356bde326559a4fab2
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
         XUSD token address that is "unsupported"
```

### Transaction Details
- **From (Relayer):** `0x3f7Cc645ff83A6AAdd61F45C070477aAE9258A7C`
- **To (BNBPayRouter):** `0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B`
- **Function Selector:** `0x18ddf70c` (likely `settleWithEIP3009` or `payWithEIP3009`)

---

## Root Cause Analysis

### 1. Token Not Registered in PaymentRegistry

The BNBPayRouter or PaymentRegistry contract has a whitelist of supported tokens. XUSD (`0xBCa3782BC181446a0bdB87356Bde326559a4FAb2`) is **NOT in this whitelist**.

**Action Required:** Add XUSD to the `supportedTokens` mapping in the PaymentRegistry contract.

### 2. API Token List vs Contract Whitelist Mismatch

The API `/tokens` endpoint correctly lists XUSD with `supportsEIP3009: true`:
```json
{
  "symbol": "XUSD",
  "address": "0xBCa3782BC181446a0bdB87356Bde326559a4FAb2",
  "supportsEIP3009": true,
  "supportsEIP2612": false,
  "supportsPermit2": false
}
```

But the **on-chain contract** doesn't have XUSD in its supported tokens list.

---

## Console Log Analysis

### Frontend Flow (Working Correctly)
```
✅ Token XUSD not found in API, using on-chain detection
✅ Token 0xBCa3782BC181446a0bdB87356Bde326559a4FAb2 supports EIP-3009 (transferWithAuthorization found in bytecode)
✅ Token XUSD supports EIP-3009: true
✅ Using EIP-3009 TransferWithAuthorization for gasless payment...
✅ Signing EIP-3009 TransferWithAuthorization
✅ Submitting gasless payment to relay... Scheme: eip3009
```

### Backend/Contract Failure
```
❌ Relay payment failed: execution reverted (unknown custom error)
❌ Error: 0xbf16aab6 = UnsupportedToken(0xBCa3782BC181446a0bdB87356Bde326559a4FAb2)
```

---

## Relay Request Sent (Correct Format)

```json
{
  "network": "bnbTestnet",
  "scheme": "eip3009",
  "intent": {
    "paymentId": "0xa56fb5677c7e874aa78fff87692ff3c402b5cdddc8f935373f271cf513565495",
    "merchant": "0xC671DE9012fb37122fbCeFC9F0AC8B99abb2F556",
    "token": "0xBCa3782BC181446a0bdB87356Bde326559a4FAb2",
    "amount": "6000000000000000000",
    "deadline": 1733451916,
    "resourceId": "0xfb1fd5108631ddcca8502a9236566d0c84c8e15b9280c72455b3bc2c1560b479",
    "payer": "0x7d91cb6561F2De50a7aE2f52F4466D187D6471d7"
  },
  "witness": {
    "schemeId": "0x34c93802ae191b7deb01ad6df5a2ddcf563aa42e377cf6f0405e671ebb703f11",
    "intentHash": "...",
    "payer": "0x7d91cb6561F2De50a7aE2f52F4466D187D6471d7",
    "salt": "..."
  },
  "witnessSignature": "0x...",
  "reference": "invoice:dbb17eaa-64ac-4b7f-aaf6-97ad4d6e163a",
  "eip3009": {
    "validAfter": 0,
    "validBefore": 1733451917,
    "authNonce": "0x7ad0265a0836ee52cb3dd09511af5e985b4d65b41c9590c4f89401c3f9110d85",
    "v": 28,
    "r": "0x1f6ea9381720482a7dcfc59ce5bd17357cae1bc2c9e76d2dbabfed8a52b37551",
    "s": "0x524d66530dfcfbf3ccff84b05e28f245b9bd90d190c5e1a8f49adc5c710e08d9"
  }
}
```

---

## Required Backend/Contract Fixes

### Option 1: Add XUSD to PaymentRegistry Supported Tokens

Call `addSupportedToken` on the PaymentRegistry contract:
```solidity
// PaymentRegistry.sol
function addSupportedToken(address token) external onlyOwner {
    supportedTokens[token] = true;
}
```

Execute:
```javascript
const registry = new ethers.Contract(PAYMENT_REGISTRY_ADDRESS, abi, signer);
await registry.addSupportedToken("0xBCa3782BC181446a0bdB87356Bde326559a4FAb2");
```

### Option 2: Check Router EIP-3009 Handler

Ensure the BNBPayRouter has the `settleWithEIP3009` or equivalent function that:
1. Calls `transferWithAuthorization` on the XUSD token
2. Routes funds to the PaymentRegistry
3. Handles the FlexWitness verification

---

## XUSD Token Verification

### Contract Address
```
0xBCa3782BC181446a0bdB87356Bde326559a4FAb2
```

### Deployment TX
```
0x0537f783475458547f2ae79c7511fcfb9690af990f646e659b145c6262a32c49
```

### Initial Holder
```
0xba4170Bb3535B0A6bf36aa5cD982BD1ecc1E76BF
```

### EIP-3009 Functions Present (Verified via Bytecode)
- ✅ `transferWithAuthorization` (selector: `0xe3ee160e`)
- ✅ `receiveWithAuthorization` (selector: `0xef55bec6`)
- ✅ `DOMAIN_SEPARATOR`
- ❌ `authorizationState` (not present, but not required)

---

## Additional Error Noted

```
Build Intent Response: { "error": "Permit2 requires an ERC-20 token, not the native asset." }
```

This is a **separate issue** - likely the API is defaulting to `permit2` scheme somewhere. The frontend explicitly sends `scheme: 'eip3009'` in the build-intent request, but this error suggests the scheme selection may not be working correctly on the backend.

**Check:** Ensure the backend respects `scheme: 'eip3009'` in the build-intent request and doesn't force `permit2`.

---

## Summary of Required Actions

| Priority | Action | Owner |
|----------|--------|-------|
| **P0** | Add XUSD to PaymentRegistry `supportedTokens` mapping | Backend/Contract |
| **P0** | Ensure BNBPayRouter has EIP-3009 handler for XUSD | Backend/Contract |
| **P1** | Fix build-intent API to respect `scheme: 'eip3009'` | Backend |
| **P2** | Add XUSD to SDK token list with correct capabilities | SDK |

---

## Frontend Code References

- Detection: `src/lib/gasless-payments.ts:276-296` (supportsEIP3009)
- Signing: `src/lib/gasless-payments.ts:330-370` (signEIP3009)
- Relay: `src/lib/gasless-payments.ts:520-588` (EIP-3009 flow)
- UI: `src/components/InvoicePage.tsx:417-458` (capability detection)
