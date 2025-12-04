# Token Image Path Fix ✅

## Problem
BNB token images weren't rendering in the invoice/subscription modals.

### What was broken:
```tsx
// ❌ Incorrect path
<img src="/bnb.png" />
// File doesn't exist! Actual file is /bnblogo.png
```

### Files in public directory:
- `/bnblogo.png` ← BNB token (not `/bnb.png`!)
- `/usdt.png` ← USDT token ✅
- `/busd.png` ← BUSD token ✅

---

## Solution

### Fixed Image Path Logic

**Before:**
```tsx
src={`/${token.toLowerCase()}.png`}
// BNB → /bnb.png ❌ (doesn't exist)
// USDT → /usdt.png ✅
// BUSD → /busd.png ✅
```

**After:**
```tsx
src={token === 'BNB' ? '/bnblogo.png' : `/${token.toLowerCase()}.png`}
// BNB → /bnblogo.png ✅
// USDT → /usdt.png ✅
// BUSD → /busd.png ✅
```

---

## Files Updated

### 1. InvoiceModal.tsx
**Line 81**: Payment token icon
```tsx
<img
  src={invoice.paymentToken === 'BNB' ? '/bnblogo.png' : `/${invoice.paymentToken.toLowerCase()}.png`}
  alt={invoice.paymentToken}
  className="h-6 w-6 rounded-full"
/>
```

**Line 164**: Payment options icons
```tsx
<img
  src={option.token === 'BNB' ? '/bnblogo.png' : `/${option.token.toLowerCase()}.png`}
  alt={option.token}
  className="h-6 w-6 rounded-full"
/>
```

### 2. SubscriptionModal.tsx
**Line 77**: Recurring payment icon
```tsx
<img
  src={subscription.paymentToken === 'BNB' ? '/bnblogo.png' : `/${subscription.paymentToken.toLowerCase()}.png`}
  alt={subscription.paymentToken}
  className="h-6 w-6 rounded-full"
/>
```

**Line 165**: Payment options icons
```tsx
<img
  src={option.token === 'BNB' ? '/bnblogo.png' : `/${option.token.toLowerCase()}.png`}
  alt={option.token}
  className="h-6 w-6 rounded-full"
/>
```

### 3. price-utils.ts (Helper Function Added)
```typescript
/**
 * Get the correct image path for a token
 * BNB uses bnblogo.png, others use lowercase names
 */
export function getTokenImagePath(token: Token): string {
  return token === 'BNB' ? '/bnblogo.png' : `/${token.toLowerCase()}.png`;
}
```

**Usage:**
```tsx
import { getTokenImagePath } from '../lib/price-utils';

<img src={getTokenImagePath(token)} alt={token} />
```

---

## Token Image Mapping

| Token | File Path | Status |
|-------|-----------|--------|
| BNB | `/bnblogo.png` | ✅ Fixed |
| USDT | `/usdt.png` | ✅ Working |
| BUSD | `/busd.png` | ✅ Working |

---

## Visual Result

### Before (Broken)
```
Payment: [❌ Missing] 0.04 BNB
          ↑
    Broken image

Pay with:
┌────────────────────────┐
│ [❌] BNB   0.04 BNB    │
│ [✅] USDT  24.00 USDT  │
│ [✅] BUSD  24.00 BUSD  │
└────────────────────────┘
```

### After (Fixed)
```
Payment: [🟡 BNB] 0.04 BNB
          ↑
    Shows BNB logo!

Pay with:
┌────────────────────────┐
│ [🟡] BNB   0.04 BNB    │  ← BNB logo visible
│ [💵] USDT  24.00 USDT  │  ← USDT logo visible
│ [💵] BUSD  24.00 BUSD  │  ← BUSD logo visible
└────────────────────────┘
```

---

## Testing

### Invoice Test
1. Create invoice with BNB payment
2. Check modal displays:
   - ✅ BNB logo appears in "Payment" section
   - ✅ BNB logo appears in payment options list

### Subscription Test
1. Create subscription with BNB payment
2. Check modal displays:
   - ✅ BNB logo appears in "Recurring Payment" section
   - ✅ BNB logo appears in payment options list

---

## Summary

- ✅ BNB token images now render correctly
- ✅ USDT and BUSD images still work
- ✅ Helper function added for future use
- ✅ All token icons display properly in both modals

The image path issue is **completely fixed**! 🎉
