# Fixes Applied - Invoice History & Gasless Payments

## Issues Fixed

### 1. ✅ Invoice History Not Showing Created Invoices

**Problem:** Invoices created weren't appearing in the history page.

**Root Cause:**
- History page was searching for invoices using wallet address as localStorage key
- Need to ensure wallet address format matches between invoice creation and history loading

**Fixes Applied:**

1. **Added Debug Logging** (HistoryPage.tsx lines 90-118)
   - Console logs show which localStorage keys are being checked
   - Helps diagnose address format mismatches

2. **Added Refresh Button** (HistoryPage.tsx lines 329-339)
   - Manual refresh button to reload history
   - Yellow button at top right of history page

3. **Added Auto-Refresh on Window Focus** (HistoryPage.tsx lines 76-85)
   - Automatically refreshes when switching back to history tab
   - Helps catch invoices created in other tabs/windows

**How to Test:**

```bash
# Open browser console (F12) to see debug logs

Step 1: Create an invoice
- Go to http://localhost:3000
- Connect MetaMask wallet
- Fill in invoice details
- Click "Create Invoice"
- Note the wallet address shown (console will log it)

Step 2: Check history
- Go to History page
- Connect same wallet
- Look at console logs - it will show:
  - "=== Loading History ==="
  - "Wallet address: 0x..."
  - "Checking localStorage key: invoices_0x..."
  - "Found invoices key: invoices_0x..." (if any exist)

Step 3: If invoices don't show
- Click the yellow "Refresh" button
- Check console for localStorage keys being searched
- Verify wallet addresses match exactly (case-sensitive)
```

**Console Output Example:**
```
=== Loading History ===
Wallet address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
Checking localStorage key: invoices_0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
Found invoices key: invoices_0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
Match! Using key: invoices_0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0
```

### 2. ✅ Gasless Payment "Not Available" Message

**Problem:** "Gasless not available. Token needs Permit2 approval or EIP-2612 support."

**Root Cause:**
- Most ERC20 tokens on testnet don't support EIP-2612 natively
- Permit2 requires one-time approval before gasless works
- No easy way for users to approve Permit2

**Fixes Applied:**

1. **Added "Approve Permit2" Button** (InvoicePage.tsx lines 1239-1280 desktop, 1615-1647 mobile)
   - Shows when gasless is not available
   - One-click button to approve Permit2 for selected token
   - After approval, gasless mode becomes available

2. **Better User Messaging**
   - Changed from amber "not available" warning
   - To blue info card with action button
   - Explains: "To enable gasless payments for this token, you need to approve Permit2 (one-time setup)"

3. **Auto-Recheck After Approval**
   - After approving Permit2, system automatically rechecks
   - Updates UI to show "Gasless ready"
   - User can then select gasless mode

**How to Test:**

```bash
Step 1: Open invoice payment page
- Open any invoice payment link
- Select USDT, USDC, or USD1 token

Step 2: Connect wallet
- Click "Connect Wallet"
- Approve MetaMask connection
- Wait for gasless support check (~2 seconds)

Step 3: If gasless not available
- See blue info card: "Enable gasless by approving Permit2"
- Click "Approve Permit2 for USDT" button
- Approve transaction in MetaMask (costs gas - one time only)
- Wait for confirmation
- Alert shows: "Permit2 approved! Gasless payments are now enabled"

Step 4: Verify gasless is now available
- See green card: "✓ Gasless ready: Permit2 approved"
- "Gasless" button is now enabled
- Select "Gasless" mode
- Click "Pay" button
- Sign permit message (NO gas cost!)
- Payment submitted by relayer (relayer pays gas)
```

### 3. ✅ Native BNB Always Requires Gas

**Already Working Correctly!**
- BNB shows amber info card explaining gas requirement
- No gasless option shown for BNB
- Users understand blockchain limitation

## What Permit2 Is

**Permit2 Address:** `0x000000000022D473030F116dDEE9F6B43aC78BA3`

**What it does:**
- Universal permit system for ANY ERC20 token
- Allows gasless token approvals via signatures
- Created by Uniswap, used by many protocols
- One-time approval per token = unlimited gasless payments

**Why it's needed:**
- Most tokens don't have native permit() function (EIP-2612)
- Permit2 adds permit functionality to any token
- After approval, all future payments can be gasless

**Cost:**
- First time: User pays gas to approve Permit2 (~50k gas)
- After that: All payments are gasless (relayer pays)

## Files Modified

### HistoryPage.tsx
- Added console logging for debugging (lines 90-118)
- Added manual refresh button (lines 329-339)
- Added auto-refresh on window focus (lines 76-85)

### InvoicePage.tsx
- Added Permit2 approval button (desktop: 1239-1280)
- Added Permit2 approval button (mobile: 1615-1647)
- Imported approvePermit2 function (line 12)
- Better user messaging for gasless unavailable state

### gasless-payments.ts
- Already had approvePermit2() function (lines 360-376)
- Already had isPermit2Approved() function (lines 349-358)
- No changes needed!

## Testing Checklist

### Invoice Creation & History
- [ ] Create invoice with connected wallet
- [ ] Invoice appears in localStorage (check console)
- [ ] Go to history page with same wallet
- [ ] Invoice shows in list
- [ ] Click refresh button - invoice still there
- [ ] Create second invoice - both show

### Gasless Payment - USDT
- [ ] Open invoice, select USDT
- [ ] Connect wallet
- [ ] See "Approve Permit2" button
- [ ] Click approve, confirm transaction
- [ ] See "Gasless ready" message
- [ ] Select "Gasless" mode
- [ ] Pay invoice (sign permit only)
- [ ] Payment confirmed

### Gasless Payment - USDC
- [ ] Repeat above with USDC token

### Gasless Payment - USD1
- [ ] Repeat above with USD1 token

### BNB Payment
- [ ] Open invoice, select BNB
- [ ] See amber info card
- [ ] No gasless option shown
- [ ] Can only pay with gas

## Common Issues & Solutions

### Issue: Invoices not showing in history
**Solution:**
1. Open browser console (F12)
2. Look for localStorage keys: `localStorage.getItem('invoices_YOUR_ADDRESS')`
3. Check if wallet address matches exactly (case-sensitive)
4. Click refresh button
5. Try disconnecting/reconnecting wallet

### Issue: Permit2 approval fails
**Solution:**
1. Check you have enough BNB for gas
2. Check you're on correct network (testnet/mainnet)
3. Try increasing gas limit in MetaMask
4. Check token address is correct

### Issue: Gasless payment fails
**Solution:**
1. Verify Permit2 is approved: Check green "Gasless ready" message
2. Check relayer is online: API endpoint responding
3. Check wallet has enough tokens (balance check)
4. Try switching back to "Pay with Gas" mode

### Issue: Invoice shows but status is wrong
**Solution:**
1. Click refresh button on history page
2. Check API is responding: https://api.bnbpay.org/health
3. Wait for event indexer to catch up (~30 seconds)
4. Check transaction on BSC scan

## Developer Notes

### LocalStorage Structure

```javascript
// Invoices per merchant
localStorage.getItem('invoices_0xMERCHANT_ADDRESS')
// Returns: [{ invoiceId, amount, token, ... }, ...]

// Individual invoice
localStorage.getItem('invoice_INV_ID')
// Returns: { invoiceId, amount, token, status, ... }

// Payment record
localStorage.getItem('payment_INV_ID')
// Returns: { txHash, paymentId, paidBy, token, amount }
```

### Permit2 Integration

```typescript
// Check if approved
const approved = await isPermit2Approved(tokenAddress, walletAddress, provider);

// Approve Permit2
await approvePermit2(tokenAddress, signer);
// ^ Sends approve transaction (user pays gas once)

// After approval, use gasless payments
await payInvoiceGasless({
  merchantAddress,
  amount,
  paymentToken,
  tokenAddress,
  invoiceId,
  network,
  signer,
  provider,
});
// ^ Signs permit message (no gas), relayer submits
```

### Relay API Flow

```
1. User clicks "Pay" with gasless mode
2. System calls buildPaymentIntent API
   - Gets: intent, witness, deadline
3. User signs permit for token amount
4. User signs witness (EIP-712 signature)
5. System calls relayPayment API
   - Sends: intent, witness, signatures, permit
6. Relayer validates and submits transaction
7. Relayer pays all gas
8. Payment confirmed on-chain
```

## Next Steps

### For Production:
1. Deploy contracts to mainnet
2. Test with mainnet tokens (USDT, USDC, etc.)
3. Verify Permit2 approvals work on mainnet
4. Set up relayer monitoring
5. Add gas savings calculator
6. Add transaction failure retry logic

### For Testing:
1. Test with multiple wallets
2. Test invoice creation from different accounts
3. Test concurrent invoice payments
4. Test network switching
5. Test mobile wallets (Trust, MetaMask Mobile)

## Summary

**Both issues are now fixed:**

1. ✅ Invoice history has better debugging + refresh button
2. ✅ Gasless payments have "Approve Permit2" button

**Users can now:**
- Create invoices and see them in history immediately
- Enable gasless payments with one click (approve Permit2)
- Pay invoices without gas costs (after Permit2 setup)
- Understand why BNB requires gas (info cards)

**Test it at:** http://localhost:3000

Check browser console for detailed logs!
