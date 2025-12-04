# Invoice & Subscription Contract Alignment Guide

## Overview
This document ensures that the USD1 Payments UI invoice and subscription features align perfectly with the BNBPay smart contracts (PaymentRegistry, BNBPayRouter, and SubscriptionManager).

---

## Invoice JSON Payload Structure

### Current Invoice Structure
```json
{
  "type": "invoice",
  "currency": "USD1",
  "amount": "0.01",
  "description": "data",
  "customer": {
    "name": "Pepay",
    "email": "Jhon@outlook.com"
  },
  "dueDate": "2025-12-29",
  "supports_multi_token": true,
  "settlement": "USD1",
  "referenceId": "ref_1763310899212_syv3zt2",
  "invoiceId": "inv_1763310900014_698xx8a",
  "paymentLink": "https://pay.testnet/x402/usd1/invoice/inv_1763310900014_698xx8a"
}
```

### Mapping to PaymentRegistry.PaymentSettledV2 Event

The `PaymentSettledV2` event from PaymentRegistry.sol emits:
```solidity
event PaymentSettledV2(
    bytes32 indexed paymentId,     // Maps to: keccak256(invoiceId)
    address indexed payer,          // Determined at payment time
    address indexed merchant,       // Invoice creator address
    address token,                  // BNB, USDT, or BUSD (testnet)
    uint256 amount,                 // Converted from "0.01" based on token decimals
    uint256 feeAmount,              // Calculated: (amount * feeBps) / 10000
    bytes32 schemeId,               // e.g., keccak256("eip2612") or keccak256("permit2")
    string referenceData,           // Maps to: referenceId ("ref_1763310899212_syv3zt2")
    bytes32 resourceId,             // Maps to: keccak256(invoiceId + customer.email)
    uint256 timestamp               // block.timestamp at settlement
);
```

### Field Validation

| Invoice Field | Contract Field | Validation | Notes |
|--------------|----------------|------------|-------|
| `invoiceId` | `paymentId` | Must be unique, converted to bytes32 via keccak256 | Used for replay protection |
| `referenceId` | `referenceData` | ≤64 bytes UTF-8 string | Merchant's internal reference |
| `amount` | `amount` | Positive number, converted to wei (18 decimals) | Must match token decimals |
| `settlement` | `token` | Must be in TESTNET_TOKENS allowlist | BNB, USDT, or BUSD |
| `invoiceId + customer.email` | `resourceId` | Deterministic hash for replay protection | Ensures uniqueness per customer |
| N/A | `feeAmount` | Auto-calculated by contract | 0-10% based on merchant config |
| N/A | `schemeId` | Determined by payment method | Direct, permit, Permit2, AA push |
| N/A | `payer` | Wallet address initiating payment | Known at payment execution |
| N/A | `merchant` | Invoice creator address | Set when invoice is created |

---

## Supported Tokens (BNB Chain Testnet)

The invoice MUST only accept tokens from the testnet allowlist:

| Token | Symbol | Address | Decimals | Status |
|-------|--------|---------|----------|--------|
| BNB | BNB | `0x0000000000000000000000000000000000000000` | 18 | ✅ Supported |
| Tether USD | USDT | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` | 18 | ✅ Supported |
| Binance USD | BUSD | `0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee` | 18 | ✅ Supported |
| USD Coin | USDC | `""` (empty) | 18 | ❌ Not deployed |
| First Digital USD | FDUSD | N/A | 18 | ❌ Not on testnet |

**UI Display**: "Accepts BNB, USDT, and BUSD tokens (Testnet)"

---

## BNBPayRouter Integration

### Payment Intent Structure
When a user pays an invoice, the BNBPayRouter constructs a `PaymentIntent`:

```solidity
struct PaymentIntent {
    bytes32 paymentId;      // keccak256(invoiceId)
    address merchant;       // Invoice creator
    address token;          // Selected payment token (BNB/USDT/BUSD)
    uint256 amount;         // Amount in token wei
    uint256 deadline;       // Payment expiry timestamp
    bytes32 resourceId;     // keccak256(invoiceId + customer.email)
}
```

### Scheme Support

| Scheme ID | Description | User Flow |
|-----------|-------------|-----------|
| `keccak256("direct_push")` | Simple transfer | User approves token → sends directly |
| `keccak256("eip2612")` | ERC-20 Permit | User signs permit → gasless approval |
| `keccak256("permit2")` | Uniswap Permit2 | User signs Permit2 → multi-approval |
| `keccak256("aa_push")` | Account Abstraction | AA wallet executes bundled transaction |

### Router Flow
1. User selects payment token (BNB, USDT, or BUSD)
2. Router validates token is in allowlist
3. Router constructs `PaymentIntent` with invoice data
4. User signs transaction (or permit)
5. Router calls `PaymentRegistry.settleFromRouter()`
6. Registry emits `PaymentSettledV2` event
7. UI listens for event and shows confirmation

---

## Subscription Flow (SubscriptionManager)

### Plan Creation
Merchant creates a subscription plan:

```solidity
function createPlan(
    address collector,      // Address authorized to collect payments
    address token,          // Payment token (BNB/USDT/BUSD)
    uint256 price,          // Amount per billing period
    uint256 period,         // Interval in seconds (e.g., 30 days)
    string memory metadataURI // IPFS/HTTP link to plan details
) external returns (uint256 planId);

// Example:
// createPlan(
//     0x...,              // Merchant's collector wallet
//     BUSD,               // Pay in BUSD
//     10 * 10**18,        // 10 BUSD per month
//     30 * 24 * 60 * 60,  // 30 days in seconds
//     "ipfs://..."        // Plan metadata
// )
```

**Events Emitted**:
```solidity
event PlanCreated(
    uint256 indexed planId,
    address indexed merchant,
    address token,
    uint256 price,
    uint256 period,
    address collector,
    string metadataURI
);
```

### Customer Authorization (Permit-Based)

Customer authorizes recurring billing using EIP-2612 or Permit2:

**Option A: EIP-2612 Permit (for compatible tokens)**
```typescript
// User signs a permit message
const permit = await token.signPermit({
    owner: userAddress,
    spender: subscriptionManagerAddress,
    value: ethers.MaxUint256, // Unlimited approval
    deadline: Math.floor(Date.now() / 1000) + 86400 // 24h expiry
});
```

**Option B: Standard Approval**
```typescript
// User approves token spending
await token.approve(subscriptionManagerAddress, ethers.MaxUint256);
```

### Subscription Creation

Customer subscribes to a plan:

```solidity
function subscribe(
    uint256 planId,
    address user,
    bytes calldata permitData // Optional: EIP-2612/Permit2 signature
) external;

// Example SDK call:
await subscriptionManager.subscribe(planId, userAddress, permitSignature);
```

**Events Emitted**:
```solidity
event Subscribed(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 startAt // block.timestamp
);
```

### Recurring Charges

Backend or agent calls `charge()` after each billing period:

```solidity
function charge(
    address user,
    uint256 planId
) external;

// Backend automation:
// 1. Query subscriptions where nextCharge <= block.timestamp
// 2. Call charge(user, planId) for each eligible subscription
// 3. Router transfers token from user to merchant
// 4. PaymentRegistry emits PaymentSettledV2 event
```

**Events Emitted**:
```solidity
event Charged(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 periodStart,     // Timestamp of billing period start
    uint256 amount,          // Amount charged
    bytes32 reference        // Internal reference for this charge
);
```

**Charge Flow**:
1. Backend detects subscription is due (nextCharge ≤ now)
2. Calls `subscriptionManager.charge(user, planId)`
3. Contract verifies user has active subscription
4. Contract checks user has sufficient token balance + allowance
5. Contract routes payment through BNBPayRouter → PaymentRegistry
6. PaymentRegistry emits `PaymentSettledV2` with subscription reference
7. Subscription state updated: lastCharge, nextCharge, totalPaid

### Cancellation

User or merchant can cancel subscription:

```solidity
function cancel(
    uint256 planId,
    address user
) external;

// User cancels their own subscription
await subscriptionManager.cancel(planId, userAddress);

// Merchant cancels (e.g., for refunds)
await subscriptionManager.cancel(planId, userAddress);
```

**Events Emitted**:
```solidity
event Canceled(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 at // block.timestamp
);
```

---

## Complete Subscription Lifecycle

### 1. Create Plan (Merchant)
```typescript
const tx = await subscriptionManager.createPlan(
    collectorAddress,
    TESTNET_TOKENS.BUSD,
    ethers.parseUnits("10", 18), // 10 BUSD
    30 * 24 * 60 * 60, // 30 days
    "ipfs://QmPlanMetadata..."
);
const receipt = await tx.wait();
const planId = receipt.events[0].args.planId;
```

### 2. Authorize Billing (Customer)
```typescript
// Option A: EIP-2612 Permit
const permitSig = await signPermit(token, {
    owner: userAddress,
    spender: subscriptionManagerAddress,
    value: ethers.MaxUint256,
    deadline: expiryTimestamp
});

// Option B: Standard Approval
await token.approve(subscriptionManagerAddress, ethers.MaxUint256);
```

### 3. Subscribe (Customer)
```typescript
await subscriptionManager.subscribe(
    planId,
    userAddress,
    permitSig // or "0x" if using standard approval
);
```

### 4. Automated Charging (Backend/Agent)
```typescript
// Cron job or MCP agent runs every hour
const dueSubscriptions = await queryDueSubscriptions();

for (const sub of dueSubscriptions) {
    try {
        await subscriptionManager.charge(sub.user, sub.planId);
        console.log(`Charged ${sub.user} for plan ${sub.planId}`);
    } catch (error) {
        console.error(`Failed to charge ${sub.user}:`, error);
        // Retry logic: mark for retry after 24h, send dunning email
    }
}
```

### 5. Cancel (User or Merchant)
```typescript
await subscriptionManager.cancel(planId, userAddress);
```

---

## SDK Integration Examples

### Invoice Creation
```typescript
import { createInvoice } from '@bnbpay/sdk';

const invoice = await createInvoice({
    merchant: merchantAddress,
    amount: "10.00",
    currency: "USD1",
    customer: {
        name: "Alice",
        email: "alice@example.com"
    },
    dueDate: "2025-12-31",
    description: "Premium subscription",
    chainId: 97, // Testnet
    settlement: "USD1",
    supports_multi_token: true
});

// Returns:
// {
//   invoiceId: "inv_...",
//   referenceId: "ref_...",
//   paymentLink: "https://pay.testnet/x402/usd1/invoice/inv_...",
//   qrCode: "data:image/png;base64,..."
// }
```

### Subscription Plan Creation
```typescript
import { createSubscriptionPlan } from '@bnbpay/sdk';

const plan = await createSubscriptionPlan({
    merchant: merchantAddress,
    token: TESTNET_TOKENS.BUSD,
    price: "10.00",
    interval: "monthly", // Converted to seconds: 30 * 24 * 60 * 60
    name: "Premium Plan",
    description: "Monthly premium access",
    chainId: 97
});

// Returns:
// {
//   planId: 123,
//   transactionHash: "0x...",
//   collector: "0x..."
// }
```

### Subscribe to Plan
```typescript
import { subscribeToPlan } from '@bnbpay/sdk';

const subscription = await subscribeToPlan({
    planId: 123,
    user: userAddress,
    signer: userSigner,
    usePermit: true // Auto-generates EIP-2612 permit
});

// Returns:
// {
//   subscriptionId: "sub_...",
//   startTime: 1734567890,
//   nextCharge: 1737246290,
//   transactionHash: "0x..."
// }
```

---

## MCP Agent Integration

### Invoice Monitoring
```typescript
// MCP Tool: x402.monitor_invoice
{
    "tool": "x402.monitor_invoice",
    "parameters": {
        "invoiceId": "inv_1763310900014_698xx8a",
        "webhookUrl": "https://merchant.example/webhooks/payment"
    }
}

// Agent monitors PaymentSettledV2 events
// On payment: POST webhook with receipt data
```

### Automated Subscription Charging
```typescript
// MCP Tool: x402.charge_subscription
{
    "tool": "x402.charge_subscription",
    "parameters": {
        "planId": 123,
        "user": "0x...",
        "retryOnFail": true,
        "maxRetries": 3
    }
}

// Agent:
// 1. Checks if subscription is due
// 2. Calls charge() on-chain
// 3. Listens for Charged event
// 4. On failure: schedules retry after 24h
// 5. After 3 failures: sends dunning email via webhook
```

### Settlement to USD1
```typescript
// MCP Tool: x402.settle_to_usd1
{
    "tool": "x402.settle_to_usd1",
    "parameters": {
        "paymentId": "0x...",
        "fromToken": "USDT",
        "amount": "10.00",
        "slippage": 0.5 // 0.5%
    }
}

// Agent:
// 1. Queries best swap route (USDT → USD1)
// 2. Executes swap via BNBPayRouter
// 3. Confirms settlement in USD1
// 4. Returns settlement receipt
```

---

## Validation Checklist

### Invoice Validation
- [x] `invoiceId` is unique and maps to `paymentId` (keccak256)
- [x] `referenceId` is ≤64 bytes UTF-8 string
- [x] `amount` is positive and converted to 18 decimal wei
- [x] `settlement` token is in TESTNET_TOKENS allowlist (BNB/USDT/BUSD)
- [x] `resourceId` is deterministic (keccak256(invoiceId + customer.email))
- [x] `supports_multi_token` is true to enable BNB/USDT/BUSD payments
- [x] `paymentLink` follows x402 Flex URI format
- [x] UI displays "Accepts BNB, USDT, and BUSD tokens (Testnet)"
- [x] Footer shows Pepay logo with "BNBPay • x402 Flex"

### Contract Alignment
- [x] PaymentRegistry emits `PaymentSettledV2` with all required fields
- [x] BNBPayRouter validates `PaymentIntent` with `resourceId`
- [x] SubscriptionManager supports `createPlan`, `subscribe`, `charge`, `cancel`
- [x] All contracts use SafeERC20 for token transfers
- [x] Fee calculations are consistent (0-10% max)
- [x] Replay protection via `settledPaymentId` mapping

### Subscription Flow
- [x] Plan creation includes collector, token, price, period, metadata
- [x] Customer authorization via EIP-2612/Permit2 or standard approval
- [x] Subscribe function handles permit signatures
- [x] Charge function routes through BNBPayRouter → PaymentRegistry
- [x] Cancel function emits events and updates state
- [x] All events are indexed for efficient querying

---

## Next Steps

### Phase 1: Invoice Integration
1. ✅ Update InvoiceModal to show correct tokens (BNB, USDT, BUSD)
2. ✅ Add Pepay logo to footer
3. ⏳ Replace contract stubs with real SDK calls
4. ⏳ Add PaymentSettledV2 event listener
5. ⏳ Implement payment verification flow

### Phase 2: Subscription Integration
1. ⏳ Build SubscriptionCreator UI component
2. ⏳ Add permit signature flow for gasless approvals
3. ⏳ Implement charge automation backend
4. ⏳ Add subscription management dashboard
5. ⏳ Create MCP tools for subscription monitoring

### Phase 3: Production Readiness
1. ⏳ Deploy contracts to testnet
2. ⏳ Update SDK with deployed addresses
3. ⏳ Test end-to-end payment flows with real wallets
4. ⏳ Implement webhook system for event notifications
5. ⏳ Security audit and gas optimization

---

## References

- **PaymentRegistry**: `contracts/payments/src/PaymentRegistry.sol`
- **BNBPayRouter**: `contracts/payments/src/BNBPayRouter.sol`
- **SubscriptionManager**: `contracts/subscriptions/src/SubscriptionManager.sol`
- **SDK Constants**: `packages/sdk-ts/src/constants.ts`
- **x402 Spec**: `SPEC.md`
- **Project Guide**: `CLAUDE.md`
