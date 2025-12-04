# Gasless Payments Implementation

## Overview
Implemented gasless payment option for ERC20 tokens using Permit2/EIP-2612 permits with relay infrastructure. Users can now choose between paying gas themselves or having the relayer pay gas.

## What Was Implemented

### 1. Gasless Payment Utilities (`src/lib/gasless-payments.ts`)

**New Functions:**
- `signPermit2()` - Signs Permit2 permit for universal ERC20 gasless transfers
- `signEIP2612()` - Signs EIP-2612 permit for tokens that natively support it
- `payInvoiceGasless()` - Main function to execute gasless payments via relay
- `supportsEIP2612()` - Checks if token supports native permit
- `isPermit2Approved()` - Checks if Permit2 is approved for a token
- `approvePermit2()` - Approves Permit2 for a token (one-time setup)

**How It Works:**
1. User selects ERC20 token for payment
2. System checks if token supports EIP-2612 or if Permit2 is approved
3. User signs a permit message (NO approve transaction, NO gas cost)
4. System calls `buildPaymentIntent` API to get payment details
5. System calls `relayPayment` API with permit signature
6. Relayer submits transaction on-chain and pays all gas

### 2. Updated Invoice Page (`src/components/InvoicePage.tsx`)

**New UI Components:**
- **Payment Mode Toggle** - Shows "Pay with Gas" vs "Gasless" options (desktop & mobile)
- **Gasless Status Indicators** - Shows if gasless is available for selected token
- **Auto-detection** - Automatically checks token support when user connects wallet
- **Smart Defaults** - Forces "Pay with Gas" for native BNB (cannot be gasless)

**New State:**
- `paymentMode` - 'gas' or 'gasless'
- `permit2Approved` - Whether Permit2 is approved for selected token
- `supportsPermit` - Whether token supports EIP-2612 or Permit2
- `checkingPermit2` - Loading state for permit checks

**Updated Payment Flow:**
```typescript
if (paymentMode === 'gasless' && selectedPayToken !== 'BNB') {
  // Gasless payment using Permit2/EIP-2612 + Relay
  result = await payInvoiceGasless({...});
} else {
  // Regular payment with gas (user pays)
  result = await payInvoiceThroughRouter({...});
}
```

## User Experience

### For Native BNB Payments:
- Only "Pay with Gas" option available
- User pays gas (cannot be gasless)

### For ERC20 Token Payments (USDT, USDC, USD1, etc.):

#### Option 1: Pay with Gas (Current Default)
1. User connects wallet
2. System checks token approval
3. If not approved: User signs approve transaction (pays gas)
4. User signs payment transaction (pays gas)
5. Payment confirmed

#### Option 2: Gasless (New!)
1. User connects wallet
2. User selects "Gasless" mode
3. System checks if token supports gasless:
   - ✅ If token supports EIP-2612 → Ready!
   - ✅ If Permit2 is approved → Ready!
   - ❌ Otherwise → Show "Permit2 approval needed"
4. User signs ONE permit message (NO gas, NO transaction)
5. Relayer submits payment transaction (relayer pays ALL gas)
6. Payment confirmed

### Visual Indicators

**Desktop View:**
- Large payment mode toggle with icons
- Status messages show:
  - "Checking gasless support..." (loading)
  - "Gasless ready: Token supports EIP-2612" (green)
  - "Gasless ready: Permit2 approved" (green)
  - "Gasless not available..." (amber)
- Blue info box explains gasless when selected

**Mobile View:**
- Compact 2-column toggle
- Status indicators below toggle
- Clear messaging about which mode is active

**Pay Button:**
- Shows "(Gasless)" suffix when gasless mode is selected
- Example: "Pay 10.00 USDT (Gasless)"

## Technical Details

### Permit2 vs EIP-2612

**EIP-2612 (Native Token Permit):**
- Some tokens have built-in permit() function
- Examples: USDC, DAI
- No additional approvals needed
- Just sign one permit message
- ✅ Best UX

**Permit2 (Universal Solution):**
- Works with ANY ERC20 token
- Contract address: `0x000000000022D473030F116dDEE9F6B43aC78BA3`
- Requires one-time approval of Permit2 contract
- After approval, all future payments are gasless
- ✅ Works everywhere

### API Integration

**Endpoints Used:**
1. `POST /payments/build-intent` - Builds payment intent payload
2. `POST /relay/payment` - Submits gasless payment to relayer

**Request Flow:**
```typescript
// 1. Build intent
const intentResponse = await buildPaymentIntent({
  mode: 'advanced',
  network: 'bnbTestnet',
  merchant: merchantAddress,
  token: tokenAddress,
  amount: amountWei.toString(),
  scheme: 'permit2' or 'eip2612',
  payer: payerAddress,
  deadlineSeconds: 3600,
});

// 2. Sign permit
const permitSig = await signPermit2({...}) or signEIP2612({...});

// 3. Relay payment
const relayResponse = await relayPayment({
  network: 'bnbTestnet',
  scheme: 'permit2' or 'eip2612',
  intent: intentResponse.intent,
  witness: intentResponse.witness,
  witnessSignature: witnessSig,
  reference: referenceData,
  permit2: {...} or eip2612: {...},
});
```

### Security Considerations

**Permit Signatures:**
- EIP-712 typed structured data signatures
- Cannot be replayed (includes nonce and deadline)
- User can see exactly what they're signing
- More secure than blank approvals

**Relayer Trust:**
- Relayer cannot steal funds (user only signs permit for exact amount)
- Relayer cannot modify payment details (signed in witness)
- Relayer can only submit transaction as specified

**Transaction Determinism:**
- All payment details hashed and signed upfront
- On-chain validation ensures intent matches signature
- Router enforces correct settlement

## Benefits

### For Users:
- ✅ Save on gas costs (relayer pays)
- ✅ Faster checkout (no approve transaction)
- ✅ Better mobile experience (fewer confirmations)
- ✅ Can pay even with 0 BNB balance

### For Merchants:
- ✅ Higher conversion rates (less friction)
- ✅ No gas cost barrier for customers
- ✅ Faster settlement
- ✅ Professional UX

## Configuration

### Network Support
- ✅ BNB Testnet (Chain ID 97) - Fully supported
- ✅ BNB Mainnet (Chain ID 56) - Ready (contracts deployed)

### Supported Tokens for Gasless
- USDT (if EIP-2612 or Permit2 approved)
- USDC (if EIP-2612 or Permit2 approved)
- USD1 (if EIP-2612 or Permit2 approved)
- Any BEP-20 token (via Permit2 after approval)

### NOT Supported for Gasless
- Native BNB (always requires gas for native transfers)

## Testing Checklist

### Before Production:
- [ ] Test EIP-2612 tokens (USDC on testnet)
- [ ] Test Permit2 with non-permit tokens
- [ ] Test gas mode still works correctly
- [ ] Test mode switching between gas/gasless
- [ ] Test error handling for unsupported tokens
- [ ] Test mobile UI responsiveness
- [ ] Test with real relayer on testnet
- [ ] Verify payment confirmation flow
- [ ] Test invoice status updates after gasless payment
- [ ] Test with different wallet amounts (including 0 BNB)

### Edge Cases to Test:
- [ ] Switching networks mid-flow
- [ ] Disconnecting wallet after selecting gasless
- [ ] Expired permit signatures
- [ ] Relayer downtime (fallback to gas mode)
- [ ] Insufficient token balance (but no BNB)
- [ ] Multiple concurrent gasless payments

## Future Enhancements

### Phase 2 (Recommended):
1. **Auto Permit2 Setup** - One-click Permit2 approval from UI
2. **Batch Permits** - Sign multiple payment permits at once
3. **Session Keys** - Pre-approve spending limit for multiple payments
4. **Gas Estimation** - Show estimated gas savings in USD
5. **Fallback Logic** - Auto-switch to gas mode if relayer fails

### Phase 3 (Advanced):
1. **Account Abstraction** - Full AA wallet support
2. **Paymaster Integration** - Let merchants sponsor gas
3. **Cross-chain Gasless** - Gasless for multiple chains
4. **Subscription Gasless** - Recurring gasless charges

## Troubleshooting

### "Gasless not available"
- **Cause:** Token doesn't support EIP-2612 and Permit2 not approved
- **Fix:** User needs to approve Permit2 once (costs gas, but only once per token)

### "Permit2 not approved"
- **Cause:** User hasn't approved Permit2 contract for this token
- **Fix:** Call `approvePermit2(tokenAddress, signer)` - one-time setup

### "Invalid signature" error
- **Cause:** Permit signature expired or incorrect
- **Fix:** Check deadline parameter (should be 1 hour from now)

### Relayer errors
- **Cause:** Relayer service down or insufficient relayer balance
- **Fix:** Switch to "Pay with Gas" mode, or retry later

## API Documentation

See `src/lib/bnbpay-api.ts` for full API types and endpoints:
- Lines 119-155: BuildIntentRequest/Response
- Lines 250-336: RelayPaymentRequest/Response
- Lines 282-295: Permit2 types
- Lines 297-303: EIP2612 types

## References

- [EIP-2612: Permit Extension for ERC20](https://eips.ethereum.org/EIPS/eip-2612)
- [Permit2 Documentation](https://github.com/Uniswap/permit2)
- [EIP-712: Typed Structured Data](https://eips.ethereum.org/EIPS/eip-712)
- BNBPay API: `https://api.bnbpay.org`

## Implementation Date
December 1, 2025

## Status
✅ **COMPLETED** - Ready for testing on BNB Testnet
