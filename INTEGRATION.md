# BNBPay X402 Flex Integration Guide

## Overview
This UI is now fully integrated with the **official BNBPay X402 Flex testnet deployment** on BSC Testnet (Chain ID: 97).

## Live Application
**Dev Server**: http://localhost:3000 (when running `npm run dev`)

## Official Testnet Contracts

### Smart Contracts (BSC Testnet)
| Contract | Address |
|----------|---------|
| **PaymentRegistry** | `0x7C86190b9bE40E4a5B1078B1831a3F2441E57c45` |
| **SubscriptionManager** | `0x3E7E5C8E9729545B6D33aA0B5988E361276fDf4c` |
| **BNBPayRouter** | `0xd63D036aEAf02985800d8D4e4B29024d7B35af94` |

### Supported Tokens (BSC Testnet)
| Token | Address |
|-------|---------|
| **BNB** | `0x0000000000000000000000000000000000000000` (Native) |
| **USDT** | `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd` |
| **BUSD** | `0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee` |
| **USD1** | `0x60EAA77B631c1c25CE1a825E49E734664C23339B` |

## X402 Flex Protocol Features

### Architecture Highlights
- **Unified Receipt Tracking**: Single `PaymentSettledV2` events with `resourceId` and `schemeId`
- **Multi-Scheme Support**: Permit2, ERC-2612, ERC-3009, AA (4337), native/token push
- **Fast Confirmations**: < 2s confirmations for registry latency
- **Router-Orchestrated**: All payment flows go through BNBPayRouter
- **Shared Infrastructure**: Subscriptions and payments share access control, fee logic, and token allowlists

### Payment Schemes Supported
1. **Permit2** - Gasless token approvals with witness data
2. **ERC-2612** - Standard permit() function for ERC-20 tokens
3. **ERC-3009** - Transfer with authorization (fiat-like flows)
4. **Account Abstraction (4337)** - Bundled user operations
5. **Native/Token Push** - Direct transfers with registry settlement

## Implementation Details

### MetaMask Integration
When users interact with the UI:

#### **Creating Subscriptions**
1. Fill subscription form (plan name, price, interval, payment token)
2. Click "Create Subscription" button
3. **MetaMask Pop-up #1**: Connect wallet request
4. Approve wallet connection
5. **MetaMask Pop-up #2**: Switch to BSC Testnet (if needed)
6. Approve network switch
7. **MetaMask Pop-up #3**: Transaction approval
   - Calls `SubscriptionManager.createPlan(collector, token, price, period, metadataURI)`
   - Gas estimate shown
   - User approves transaction
8. Wait for blockchain confirmation
9. Extract `planId` from `PlanCreated` event
10. Display success modal with transaction hash and plan details

#### **Creating Invoices**
1. Fill invoice form (customer, amount, description, payment token)
2. Click "Create Invoice" button
3. **MetaMask Pop-up**: Connect wallet request
4. Approve wallet connection and network switch
5. Generate invoice intent with merchant's wallet address
6. Display invoice modal with payment link and QR code

### Contract Calls

#### Subscription Creation
```typescript
// Creates on-chain subscription plan
const tx = await subscriptionManager.createPlan(
  account,           // collector (merchant)
  tokenAddress,      // payment token (BNB, USDT, BUSD, USD1)
  priceWei,          // price in wei (18 decimals)
  period,            // billing period in seconds
  metadataURI        // JSON metadata with plan details
);

// Wait for confirmation
const receipt = await tx.wait();

// Parse PlanCreated event to get planId
const planCreatedEvent = receipt.logs
  .find(log => log.name === 'PlanCreated');
const planId = planCreatedEvent.args[0];
```

#### Invoice Creation
```typescript
// Invoices are off-chain payment intents
// Connects wallet to get merchant address
const account = await connectWallet();

// Generates invoice ID and payment link
const invoiceId = 'inv_' + Date.now() + '_' + randomString();
const paymentLink = `https://pay.testnet.bnbpay.io/invoice/${invoiceId}`;
```

## Testing Instructions

### Prerequisites
1. **Install MetaMask**: https://metamask.io/download/
2. **Add BSC Testnet** to MetaMask:
   - Network Name: `BSC Testnet`
   - RPC URL: `https://data-seed-prebsc-1-s1.binance.org:8545/`
   - Chain ID: `97`
   - Currency Symbol: `tBNB`
   - Block Explorer: `https://testnet.bscscan.com`
3. **Get Testnet BNB**: https://testnet.bnbchain.org/faucet-smart

### Test Subscription Creation
1. Run dev server: `npm run dev`
2. Open http://localhost:3000
3. Click "Create Subscription" card
4. Fill form:
   - Plan Name: `Pro Plan`
   - Price: `0.01` (in BNB, USDT, or BUSD)
   - Interval: `monthly`
   - Token: `BNB`
5. Click "Create Subscription"
6. Approve MetaMask prompts
7. Wait for confirmation
8. View transaction on BSCScan: `https://testnet.bscscan.com/tx/{txHash}`

### Test Invoice Creation
1. Click "Generate Invoice" card
2. Fill form:
   - Customer Name: `John Doe`
   - Email: `john@example.com`
   - Description: `Test Invoice`
   - Amount: `0.01` (in BNB, USDT, or BUSD)
   - Token: `BNB`
3. Click "Create Invoice"
4. Approve MetaMask wallet connection
5. View generated invoice with QR code and payment link

## Key Features

### USD1-First Settlement
- All payments settle to **USD1** stablecoin
- Multi-token acceptance (BNB, USDT, BUSD)
- Automatic conversion via DEX routing
- Zero volatility risk for merchants

### Agent Mode (MCP Integration)
- JSON payload display for automation
- MCP method call examples
- Settlement flow visualization
- Claude-compatible integration guides

### Multi-Token Support
- Accepts BNB (native), USDT, BUSD
- Settles to USD1 for stability
- Automatic price conversion
- Real-time token options display

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌──────────────────┐
│             │      │                  │      │                  │
│  USD1 UI    │─────▶│  SubscriptionMgr │─────▶│ PaymentRegistry  │
│  (React)    │      │  (Smart Contract)│      │ (Smart Contract) │
│             │      │                  │      │                  │
└─────────────┘      └──────────────────┘      └──────────────────┘
      │                      │                         │
      │                      │                         │
      ▼                      ▼                         ▼
┌─────────────┐      ┌──────────────────┐      ┌──────────────────┐
│             │      │                  │      │                  │
│  MetaMask   │      │   BNBPayRouter   │      │  Event Indexer   │
│  (Wallet)   │      │  (Orchestrator)  │      │  (Off-chain)     │
│             │      │                  │      │                  │
└─────────────┘      └──────────────────┘      └──────────────────┘
```

## Event Schema

### PaymentSettledV2
```solidity
event PaymentSettledV2(
    bytes32 indexed paymentId,      // Unique payment identifier
    address indexed payer,           // Wallet that paid
    address indexed merchant,        // Merchant receiving payment
    address token,                   // Token used for payment
    uint256 amount,                  // Payment amount
    uint256 feeAmount,               // Protocol fee
    bytes32 schemeId,                // Payment scheme used
    string referenceData,            // Merchant reference
    bytes32 resourceId,              // Resource being paid for
    uint256 timestamp                // Block timestamp
);
```

### PlanCreated
```solidity
event PlanCreated(
    uint256 indexed planId,          // Unique plan identifier
    address indexed merchant,        // Plan creator
    address token,                   // Payment token
    uint256 price,                   // Subscription price
    uint256 period,                  // Billing period (seconds)
    address collector,               // Payment collector
    string metadataURI               // Plan metadata JSON
);
```

## Security Features

### Smart Contract Security
- ✅ ReentrancyGuard on all payment functions
- ✅ Pausable for emergency stops
- ✅ AccessControl for role-based permissions
- ✅ SafeERC20 for token transfers
- ✅ Input validation with clear revert messages
- ✅ Comprehensive indexed events for monitoring

### Payment Security
- ✅ ResourceId-based replay protection
- ✅ Reference ID uniqueness validation per merchant
- ✅ Minimum block confirmations (3 for mainnet, 1 for testnet)
- ✅ Token allowlist to prevent scam tokens
- ✅ Fee caps (max 10%) to protect users
- ✅ Slippage tolerance for fiat conversions (1-2%)

## Operator
**Pepay Labs** maintains the reference infrastructure including router, registry, subscriptions stack, SDK, and compliance guardrails.

## Resources
- **Live Demo**: https://bnb-pay.vercel.app/
- **BSC Testnet Explorer**: https://testnet.bscscan.com
- **BNB Testnet Faucet**: https://testnet.bnbchain.org/faucet-smart
- **Documentation**: In-repository with transparent spec updates

## Support
For issues or questions about the BNBPay X402 Flex integration, please refer to the repository documentation or contact Pepay Labs.
