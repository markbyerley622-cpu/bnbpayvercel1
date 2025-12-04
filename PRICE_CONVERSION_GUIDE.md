# Price Conversion & Multi-Token Payment Guide

## The Problem

**Current Behavior (INCORRECT)**:
```
User pays: 0.01 BNB
Invoice shows: 0.01 USD1 settlement
```

**Expected Behavior (CORRECT)**:
```
User pays: 0.01 BNB
BNB Price: $600/BNB
Invoice shows: $6.00 USD1 settlement  (0.01 × $600)
```

---

## Why This Matters

### Token Value Differences
Different tokens have wildly different USD values:

| Token | Amount | USD Value | USD1 Settlement |
|-------|--------|-----------|-----------------|
| BNB | 0.01 | ~$6.00 | 6.00 USD1 |
| USDT | 0.01 | $0.01 | 0.01 USD1 |
| BUSD | 0.01 | $0.01 | 0.01 USD1 |

**The Issue**: If someone pays 0.01 BNB ($6), they should receive $6 worth of USD1, not $0.01 USD1!

---

## Solution Architecture

### 1. Price Oracle Integration

**Use PancakeSwap V3 TWAP Oracle** (Time-Weighted Average Price):

```typescript
// File: packages/sdk-ts/src/oracle.ts

import { ethers } from 'ethers';

// PancakeSwap V3 Pool Addresses (Testnet)
const POOLS = {
  BNB_USDT: '0x...', // BNB/USDT pool
  BUSD_USDT: '0x...', // BUSD/USDT pool
};

/**
 * Get current USD price for a token
 * @param token Token address (BNB, USDT, BUSD)
 * @param chainId Chain ID (97 for testnet)
 * @returns Price in USD
 */
export async function getTokenPrice(
  provider: ethers.Provider,
  token: string,
  chainId: number
): Promise<number> {
  // Native BNB
  if (token === '0x0000000000000000000000000000000000000000') {
    // Query BNB/USDT pool
    const pool = new ethers.Contract(
      POOLS.BNB_USDT,
      POOL_ABI,
      provider
    );

    const slot0 = await pool.slot0();
    const sqrtPriceX96 = slot0.sqrtPriceX96;

    // Convert sqrtPriceX96 to price
    const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2;

    // Adjust for decimals (BNB=18, USDT=18)
    return price;
  }

  // Stablecoins (USDT, BUSD)
  if (token === TESTNET_TOKENS.USDT || token === TESTNET_TOKENS.BUSD) {
    return 1.0; // Stable at $1
  }

  throw new Error(`Unsupported token: ${token}`);
}

/**
 * Convert token amount to USD value
 * @param token Token address
 * @param amount Amount in token units (e.g., "0.01")
 * @param chainId Chain ID
 * @returns USD value
 */
export async function convertToUSD(
  provider: ethers.Provider,
  token: string,
  amount: string,
  chainId: number
): Promise<string> {
  const price = await getTokenPrice(provider, token, chainId);
  const tokenAmount = parseFloat(amount);
  const usdValue = tokenAmount * price;

  return usdValue.toFixed(2);
}
```

---

### 2. Invoice Creation Flow (UPDATED)

**Before** (Incorrect):
```typescript
// User creates invoice for $10 USD1
const invoice = {
  amount: "10.00",
  currency: "USD1",
  settlement: "USD1"
};

// User pays with 0.01 BNB
// System shows: 0.01 USD1 ❌ WRONG
```

**After** (Correct):
```typescript
// User creates invoice for $10 USD1
const invoice = {
  amount: "10.00",        // Target USD1 amount
  currency: "USD1",
  settlement: "USD1"
};

// When user selects payment token (e.g., BNB):
const bnbPrice = await getTokenPrice(provider, BNB, 97);
// bnbPrice = 600

const requiredBNB = 10.00 / 600;
// requiredBNB = 0.01666... BNB

// Show user:
// "Pay 0.01667 BNB to settle $10 USD1"
```

---

### 3. Payment Link Structure

**x402 Flex URI Format**:
```
bnbpay://pay?
  merchant=0x...&
  amount=10.00&              // USD1 target amount
  currency=USD1&
  token=0x0000...0000&       // BNB address (user's choice)
  tokenAmount=0.01667&       // Calculated BNB amount
  chainId=97&
  referenceId=inv_123&
  resourceId=0xabc...&
  deadline=1734567890
```

**Key Fields**:
- `amount`: **USD1** settlement amount (always in USD1)
- `token`: User's payment token (BNB/USDT/BUSD)
- `tokenAmount`: **Calculated** token amount based on price oracle

---

### 4. BNBPayRouter Settlement Logic

When user pays, the router:

```solidity
// contracts/payments/src/BNBPayRouter.sol

function settlePayment(
    PaymentIntent calldata intent,
    address paymentToken,
    uint256 tokenAmount
) external {
    // 1. Transfer payment token from payer
    IERC20(paymentToken).safeTransferFrom(
        msg.sender,
        address(this),
        tokenAmount
    );

    // 2. If token != USD1, swap to USD1
    if (paymentToken != USD1_ADDRESS) {
        // Swap via PancakeSwap
        uint256 usd1Amount = swapToUSD1(
            paymentToken,
            tokenAmount,
            intent.amount // Expected USD1 output
        );

        // Verify slippage tolerance (±1%)
        require(
            usd1Amount >= intent.amount * 99 / 100,
            "Slippage too high"
        );
    }

    // 3. Settle to merchant in USD1
    registry.settleFromRouter(
        USD1_ADDRESS,        // Always settle in USD1
        msg.sender,
        intent.merchant,
        intent.amount,       // USD1 amount
        intent.paymentId,
        intent.schemeId,
        intent.referenceData,
        intent.resourceId
    );
}
```

---

## Implementation Steps

### Phase 1: Add Price Oracle (PRIORITY)

1. **Install dependencies**:
```bash
cd packages/sdk-ts
npm install @pancakeswap/v3-sdk
```

2. **Create oracle module**:
```typescript
// packages/sdk-ts/src/oracle.ts
export { getTokenPrice, convertToUSD };
```

3. **Update invoice creator**:
```typescript
// apps/usd1-payments-ui/src/components/InvoiceCreator.tsx

const handleCreateInvoice = async () => {
  // Get current prices
  const prices = await getPrices(provider, chainId);

  const invoice = {
    amount: formData.amount,         // USD1 target
    currency: "USD1",
    settlement: "USD1",
    acceptedTokens: [
      {
        token: "BNB",
        address: TESTNET_TOKENS.BNB,
        requiredAmount: (parseFloat(formData.amount) / prices.BNB).toFixed(6),
        usdValue: formData.amount
      },
      {
        token: "USDT",
        address: TESTNET_TOKENS.USDT,
        requiredAmount: formData.amount, // 1:1
        usdValue: formData.amount
      },
      {
        token: "BUSD",
        address: TESTNET_TOKENS.BUSD,
        requiredAmount: formData.amount, // 1:1
        usdValue: formData.amount
      }
    ]
  };

  setInvoice(invoice);
};
```

---

### Phase 2: Update UI to Show Token Amounts

**InvoiceModal - Payment Options Section**:

```tsx
{/* Payment Options */}
<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
  <h4 className="font-semibold text-blue-800 mb-3">
    Pay {invoice.amount} USD1 with any of these tokens:
  </h4>

  {invoice.acceptedTokens?.map((token) => (
    <div
      key={token.token}
      className="flex justify-between items-center py-2 border-b border-blue-100 last:border-0"
    >
      <div className="flex items-center gap-2">
        <img
          src={`/${token.token.toLowerCase()}.png`}
          alt={token.token}
          className="h-6 w-6"
        />
        <span className="font-semibold text-blue-900">{token.token}</span>
      </div>
      <div className="text-right">
        <div className="font-bold text-blue-900">
          {token.requiredAmount} {token.token}
        </div>
        <div className="text-xs text-blue-600">
          ≈ ${token.usdValue} USD
        </div>
      </div>
    </div>
  ))}

  <div className="mt-3 text-xs text-blue-600">
    • Prices updated in real-time via PancakeSwap oracle
    <br />
    • 1% slippage tolerance for volatile tokens
    <br />
    • All payments settle to USD1 automatically
  </div>
</div>
```

**Example Display**:
```
Pay 10.00 USD1 with any of these tokens:

🪙 BNB      0.01667 BNB
            ≈ $10.00 USD

💵 USDT     10.00 USDT
            ≈ $10.00 USD

💵 BUSD     10.00 BUSD
            ≈ $10.00 USD
```

---

### Phase 3: Add Price Refresh

```tsx
// InvoiceModal.tsx

const [prices, setPrices] = useState<TokenPrices | null>(null);
const [priceAge, setPriceAge] = useState<number>(0);

useEffect(() => {
  const updatePrices = async () => {
    const provider = new ethers.JsonRpcProvider(RPC_ENDPOINTS[97]);
    const newPrices = await getPrices(provider, 97);
    setPrices(newPrices);
    setPriceAge(Date.now());
  };

  updatePrices();

  // Refresh every 30 seconds
  const interval = setInterval(updatePrices, 30000);
  return () => clearInterval(interval);
}, []);

// Show price freshness
<div className="text-xs text-gray-500">
  Prices updated {Math.floor((Date.now() - priceAge) / 1000)}s ago
</div>
```

---

## Testing Scenarios

### Scenario 1: BNB Payment
```typescript
// Invoice: $10 USD1
// BNB Price: $600
// Required: 0.01667 BNB

const invoice = await createInvoice({
  amount: "10.00",
  currency: "USD1"
});

// User pays 0.01667 BNB
// Router swaps to USD1
// Merchant receives: 10.00 USD1 ✅
```

### Scenario 2: USDT Payment
```typescript
// Invoice: $10 USD1
// USDT Price: $1.00
// Required: 10.00 USDT

const invoice = await createInvoice({
  amount: "10.00",
  currency: "USD1"
});

// User pays 10.00 USDT
// Router swaps to USD1 (if needed)
// Merchant receives: 10.00 USD1 ✅
```

### Scenario 3: Price Movement Protection
```typescript
// Invoice created: BNB = $600, requires 0.01667 BNB
// 5 minutes later: BNB = $590 (price drops)
// User pays 0.01667 BNB = now worth $9.84

// Router swap output: $9.84 USD1
// Check: $9.84 >= $10 * 0.99 (1% tolerance)
// Result: ❌ REVERT "Slippage too high"

// Solution: User must pay slightly more BNB to compensate
// New required: 10.00 / 590 = 0.01695 BNB
```

---

## Contract Updates Required

### 1. PaymentIntent Structure
```solidity
struct PaymentIntent {
    bytes32 paymentId;
    address merchant;
    address settlementToken;    // Always USD1
    address paymentToken;       // User's token (BNB/USDT/BUSD)
    uint256 settlementAmount;   // USD1 amount (target)
    uint256 paymentAmount;      // Token amount (calculated)
    uint256 deadline;
    bytes32 resourceId;
}
```

### 2. Router Settlement
```solidity
function settleWithSwap(
    PaymentIntent calldata intent,
    bytes calldata swapData
) external {
    // Transfer payment token
    IERC20(intent.paymentToken).safeTransferFrom(
        msg.sender,
        address(this),
        intent.paymentAmount
    );

    // Swap to USD1 if needed
    uint256 usd1Received;
    if (intent.paymentToken != USD1) {
        usd1Received = _swapToUSD1(
            intent.paymentToken,
            intent.paymentAmount,
            swapData
        );
    } else {
        usd1Received = intent.paymentAmount;
    }

    // Verify slippage
    require(
        usd1Received >= intent.settlementAmount * 99 / 100,
        "Slippage exceeded"
    );

    // Settle
    registry.settleFromRouter(
        USD1,
        msg.sender,
        intent.merchant,
        usd1Received,
        intent.paymentId,
        intent.schemeId,
        intent.referenceData,
        intent.resourceId
    );
}
```

---

## Example: Complete Flow

### 1. Merchant Creates Invoice
```typescript
const invoice = await createInvoice({
  merchant: "0xMerchant...",
  amount: "50.00",
  currency: "USD1",
  description: "Premium Subscription",
  customer: {
    name: "Alice",
    email: "alice@example.com"
  }
});

// Output:
// {
//   invoiceId: "inv_123",
//   amount: "50.00",
//   currency: "USD1",
//   acceptedTokens: [
//     { token: "BNB", requiredAmount: "0.0833", usdValue: "50.00" },
//     { token: "USDT", requiredAmount: "50.00", usdValue: "50.00" },
//     { token: "BUSD", requiredAmount: "50.00", usdValue: "50.00" }
//   ]
// }
```

### 2. Customer Scans QR Code
```
QR Code Data:
bnbpay://pay?
  merchant=0xMerchant...&
  amount=50.00&
  currency=USD1&
  tokens=BNB,USDT,BUSD&
  invoiceId=inv_123
```

### 3. Wallet Shows Options
```
Pay $50 USD1 with:

○ BNB    0.0833 BNB  ($50.00)
○ USDT   50.00 USDT  ($50.00)
○ BUSD   50.00 BUSD  ($50.00)

[Select Token]
```

### 4. User Selects BNB
```typescript
// Wallet calculates payment
const intent = {
  paymentId: keccak256("inv_123"),
  merchant: "0xMerchant...",
  settlementToken: USD1,
  paymentToken: BNB,
  settlementAmount: parseUnits("50", 18),
  paymentAmount: parseUnits("0.0833", 18),
  deadline: now + 600, // 10 min
  resourceId: keccak256("inv_123" + "alice@example.com")
};

// Submit transaction
await router.settleWithSwap(intent, swapData);
```

### 5. Router Processes
```
1. Transfer 0.0833 BNB from Alice
2. Swap 0.0833 BNB → ~50 USD1 via PancakeSwap
3. Verify: 50 USD1 >= 49.5 USD1 (1% tolerance) ✅
4. Transfer 50 USD1 to Merchant
5. Emit PaymentSettledV2 event
```

### 6. Merchant Receives USD1
```
PaymentSettledV2(
  paymentId: 0xabc...,
  payer: Alice,
  merchant: 0xMerchant...,
  token: USD1,
  amount: 50.00 USD1,
  feeAmount: 0.50 USD1,
  schemeId: "permit2",
  referenceData: "inv_123",
  resourceId: 0xdef...,
  timestamp: 1734567890
)

Merchant receives: 49.50 USD1 (after 1% fee)
```

---

## Summary

### Current Issue
- ❌ Invoice shows token amount as USD1 amount (0.01 BNB → 0.01 USD1)
- ❌ No price conversion
- ❌ Incorrect settlement values

### Solution
- ✅ Always denominate invoices in USD1
- ✅ Calculate required token amounts using price oracle
- ✅ Show all payment options with real-time prices
- ✅ Swap to USD1 during settlement
- ✅ Protect against slippage

### Next Steps
1. ⏳ Implement price oracle module
2. ⏳ Update invoice creator with multi-token pricing
3. ⏳ Add swap integration to BNBPayRouter
4. ⏳ Update UI to show token-specific amounts
5. ⏳ Add price refresh mechanism
6. ⏳ Test with real testnet deployments
