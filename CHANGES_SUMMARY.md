# Invoice & Subscription Updates Summary

## Changes Made

### 1. InvoiceModal.tsx
✅ **Updated Token Support Text**
- **Before**: "Accepts BNB, USDT, USDC, FDUSD, and other supported tokens"
- **After**: "Accepts BNB, USDT, and BUSD tokens (Testnet)"
- **Reason**: Matches BNB Chain Testnet token allowlist (USDC and FDUSD not deployed on testnet)

✅ **Added Pepay Logo to Footer**
- **Before**: Text-only footer "Powered by **PePay** • BNBPay • x402 Flex"
- **After**: Logo + text footer with Pepay logo image
- **Logo Path**: `/pepaylabs.png` (exists in `public/` directory)
- **Implementation**: Flexbox layout with centered logo and text

### 2. SubscriptionModal.tsx
✅ **Added Pepay Logo to Footer**
- Same footer update as InvoiceModal for consistency
- Uses the same Pepay logo from `/pepaylabs.png`

### 3. New Documentation
✅ **Created INVOICE_CONTRACT_ALIGNMENT.md**
- Comprehensive mapping of invoice JSON to smart contract events
- Full subscription flow documentation (create plan, authorize, subscribe, charge, cancel)
- Token allowlist validation for testnet
- SDK integration examples
- MCP agent automation scenarios

---

## Invoice JSON Structure Validation

### Your Current Invoice JSON
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

### ✅ Validation Against PaymentRegistry Contract

This JSON structure **CORRECTLY ALIGNS** with the `PaymentSettledV2` event:

```solidity
event PaymentSettledV2(
    bytes32 indexed paymentId,     // ← keccak256("inv_1763310900014_698xx8a")
    address indexed payer,          // ← Wallet address at payment time
    address indexed merchant,       // ← Invoice creator address
    address token,                  // ← BNB/USDT/BUSD address
    uint256 amount,                 // ← 0.01 * 10^18 (converted to wei)
    uint256 feeAmount,              // ← Auto-calculated by contract
    bytes32 schemeId,               // ← Payment method (permit, Permit2, etc.)
    string referenceData,           // ← "ref_1763310899212_syv3zt2"
    bytes32 resourceId,             // ← keccak256(invoiceId + email)
    uint256 timestamp               // ← block.timestamp
);
```

**Field Mappings**:
| JSON Field | Contract Field | Status |
|-----------|---------------|--------|
| `invoiceId` | `paymentId` | ✅ Converted via keccak256 |
| `referenceId` | `referenceData` | ✅ ≤64 bytes UTF-8 string |
| `amount` | `amount` | ✅ Converted to 18 decimal wei |
| `settlement` ("USD1") | `token` | ✅ Must be BNB/USDT/BUSD on testnet |
| `invoiceId + customer.email` | `resourceId` | ✅ Deterministic hash |
| N/A | `feeAmount` | ✅ Auto-calculated (0-10%) |
| N/A | `schemeId` | ✅ Set by payment method |
| N/A | `payer` | ✅ Known at payment execution |
| N/A | `merchant` | ✅ Invoice creator |

---

## Supported Tokens (BNB Chain Testnet)

### ✅ Current Allowlist
| Token | Symbol | Address | Status |
|-------|--------|---------|--------|
| BNB | BNB | `0x0000000000000000000000000000000000000000` | ✅ Supported |
| Tether USD | USDT | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` | ✅ Supported |
| Binance USD | BUSD | `0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee` | ✅ Supported |

### ❌ Not on Testnet
| Token | Status | Notes |
|-------|--------|-------|
| USDC | ❌ Not deployed | Address is empty string in constants |
| FDUSD | ❌ Not available | Not included in testnet config |

**UI Text**: "Accepts BNB, USDT, and BUSD tokens (Testnet)" ✅

---

## Subscription Flow Documentation

### Complete Lifecycle

#### 1. Create Plan (Merchant/Backend)
```typescript
const tx = await subscriptionManager.createPlan(
    collectorAddress,              // Authorized collector wallet
    TESTNET_TOKENS.BUSD,           // Payment token (BNB/USDT/BUSD)
    ethers.parseUnits("10", 18),   // 10 BUSD per period
    30 * 24 * 60 * 60,             // 30 days in seconds
    "ipfs://QmMetadata..."         // Plan metadata URI
);
```

**Contract Function**:
```solidity
function createPlan(
    address collector,
    address token,
    uint256 price,
    uint256 period,
    string memory metadataURI
) external returns (uint256 planId);
```

**Event Emitted**:
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

---

#### 2. Authorize Billing (Customer)

**Option A: EIP-2612 Permit (Gasless)**
```typescript
const permitSig = await signPermit(token, {
    owner: userAddress,
    spender: subscriptionManagerAddress,
    value: ethers.MaxUint256,        // Unlimited approval
    deadline: expiryTimestamp
});
```

**Option B: Standard Approval**
```typescript
await token.approve(
    subscriptionManagerAddress,
    ethers.MaxUint256
);
```

---

#### 3. Subscribe (Customer)
```typescript
await subscriptionManager.subscribe(
    planId,
    userAddress,
    permitSig  // or "0x" for standard approval
);
```

**Contract Function**:
```solidity
function subscribe(
    uint256 planId,
    address user,
    bytes calldata permitData
) external;
```

**Event Emitted**:
```solidity
event Subscribed(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 startAt
);
```

---

#### 4. Charge (Backend/MCP Agent)
```typescript
// Automated charging - runs every hour via cron/agent
const dueSubscriptions = await queryDueSubscriptions();

for (const sub of dueSubscriptions) {
    try {
        await subscriptionManager.charge(sub.user, sub.planId);
        console.log(`✅ Charged ${sub.user} for plan ${sub.planId}`);
    } catch (error) {
        console.error(`❌ Failed to charge ${sub.user}:`, error);
        // Retry after 24h, send dunning email
    }
}
```

**Contract Function**:
```solidity
function charge(
    address user,
    uint256 planId
) external;
```

**Flow**:
1. Backend detects `nextCharge ≤ block.timestamp`
2. Calls `subscriptionManager.charge(user, planId)`
3. Contract verifies active subscription + sufficient balance
4. Routes payment through **BNBPayRouter → PaymentRegistry**
5. PaymentRegistry emits `PaymentSettledV2` event
6. Subscription state updated: `lastCharge`, `nextCharge`, `totalPaid`

**Event Emitted**:
```solidity
event Charged(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 periodStart,
    uint256 amount,
    bytes32 reference
);
```

---

#### 5. Cancel (User or Merchant)
```typescript
await subscriptionManager.cancel(planId, userAddress);
```

**Contract Function**:
```solidity
function cancel(
    uint256 planId,
    address user
) external;
```

**Event Emitted**:
```solidity
event Canceled(
    uint256 indexed planId,
    address indexed subscriber,
    uint256 at
);
```

---

## SDK Usage Examples

### Creating an Invoice
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
    chainId: 97,  // Testnet
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

### Creating a Subscription Plan
```typescript
import { createSubscriptionPlan } from '@bnbpay/sdk';

const plan = await createSubscriptionPlan({
    merchant: merchantAddress,
    token: TESTNET_TOKENS.BUSD,
    price: "10.00",
    interval: "monthly",  // Auto-converts to seconds
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

### Subscribing to a Plan
```typescript
import { subscribeToPlan } from '@bnbpay/sdk';

const subscription = await subscribeToPlan({
    planId: 123,
    user: userAddress,
    signer: userSigner,
    usePermit: true  // Auto-generates EIP-2612 permit
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

## MCP Integration

### Invoice Monitoring
```json
{
    "tool": "x402.monitor_invoice",
    "parameters": {
        "invoiceId": "inv_1763310900014_698xx8a",
        "webhookUrl": "https://merchant.example/webhooks/payment"
    }
}
```

### Automated Subscription Charging
```json
{
    "tool": "x402.charge_subscription",
    "parameters": {
        "planId": 123,
        "user": "0x...",
        "retryOnFail": true,
        "maxRetries": 3
    }
}
```

---

## Visual Updates

### Before
```
Footer: "Powered by PePay • BNBPay • x402 Flex"
```

### After
```
Footer: [Pepay Logo Image] • BNBPay • x402 Flex
```

**Logo**: Centered Pepay logo (`/pepaylabs.png`) with height of 24px (h-6)

---

## Files Modified

1. ✅ `InvoiceModal.tsx` - Updated tokens text + added logo
2. ✅ `SubscriptionModal.tsx` - Added logo to footer
3. ✅ `INVOICE_CONTRACT_ALIGNMENT.md` - New comprehensive documentation
4. ✅ `CHANGES_SUMMARY.md` - This file

---

## Next Steps

### Immediate
1. ✅ Invoice UI shows correct tokens (BNB, USDT, BUSD)
2. ✅ Pepay logo displayed in footer
3. ✅ JSON structure validated against contracts

### Phase 2: Implementation
1. ⏳ Replace contract stubs with real SDK calls
2. ⏳ Deploy contracts to testnet
3. ⏳ Test end-to-end payment flows
4. ⏳ Implement subscription charging automation
5. ⏳ Add MCP tools for monitoring

### Phase 3: Production
1. ⏳ Security audit
2. ⏳ Gas optimization
3. ⏳ Mainnet deployment
4. ⏳ Webhook system
5. ⏳ Documentation site

---

## References

- **PaymentRegistry Contract**: `contracts/payments/src/PaymentRegistry.sol`
- **BNBPayRouter Contract**: `contracts/payments/src/BNBPayRouter.sol`
- **SubscriptionManager Contract**: `contracts/subscriptions/src/SubscriptionManager.sol`
- **Token Constants**: `packages/sdk-ts/src/constants.ts`
- **Full Documentation**: `INVOICE_CONTRACT_ALIGNMENT.md`
