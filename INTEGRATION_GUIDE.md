# BNBPay Invoice & Subscription UI - Integration Guide

## Overview
This UI is now fully integrated with the deployed BNBPay contracts on BSC Testnet (Chain ID: 97). It provides a complete interface for creating USD1-denominated invoices and subscriptions with multi-token payment support.

## Deployed Contracts (BSC Testnet)

All contracts are deployed and verified on BSC Testnet:

```
PaymentRegistry:  0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D
BNBPayRouter:     0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B
SessionStore:     0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983
Permit2:          0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
Fee Recipient:    0xba4170Bb3535B0A6bf36aa5cD982BD1ecc1E76BF
```

**Testnet Block Explorer:**
- [PaymentRegistry](https://testnet.bscscan.com/address/0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D)
- [BNBPayRouter](https://testnet.bscscan.com/address/0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B)
- [SessionStore](https://testnet.bscscan.com/address/0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983)

## Quick Start

### 1. Install Dependencies

```bash
cd INVOICESUBSCRIPTION-UI
npm install
```

### 2. Configure Environment

The `.env` file is already configured with the deployed contract addresses:

```env
VITE_CHAIN_ID=97
VITE_NETWORK_NAME=BNB Testnet
VITE_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545

VITE_PAYMENT_REGISTRY=0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D
VITE_BNBPAY_ROUTER=0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B
VITE_SESSION_STORE=0x9BDC430A2d3cc0ec86B266075c6Fb30dD3599983
VITE_PERMIT2_ADDRESS=0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
VITE_FEE_RECIPIENT=0xba4170Bb3535B0A6bf36aa5cD982BD1ecc1E76BF
```

### 3. Run Development Server

```bash
npm run dev
```

The app will start at **http://localhost:5173**

### 4. Connect Your Wallet

1. Install [MetaMask](https://metamask.io/) if you haven't already
2. Open the app at http://localhost:5173
3. Click "Connect Wallet" button
4. Approve the connection in MetaMask
5. The app will automatically switch to BSC Testnet

### 5. Get Testnet BNB

You'll need testnet BNB to pay for gas fees:

1. Visit [BSC Testnet Faucet](https://testnet.bnbchain.org/faucet-smart)
2. Enter your wallet address
3. Request testnet BNB (you'll get 0.5 tBNB)

### 6. Get Testnet Tokens (Optional)

To test with USDT:
- Testnet USDT: `0x337610d27c682E347C9cD60BD4b3b107C9d34dDd`
- You can get testnet USDT from various BSC testnet faucets

## Features

### 1. Invoice Creator

Create USD1-denominated invoices with multi-token payment support:

**How to use:**
1. Fill in customer details (name, email)
2. Enter invoice description
3. Enter amount in USD1
4. (Optional) Set due date
5. Click "Create Invoice"
6. Approve the transaction in MetaMask
7. Wait for confirmation

**What happens on-chain:**
- Creates a payment through `BNBPayRouter`
- Routes to `PaymentRegistry` for settlement
- Emits `PaymentSettledV2` event with payment details
- Creates an x402 session in `SessionStore`

**Result:**
- Invoice ID and Payment ID generated
- QR code for payment link
- Transaction hash and explorer link
- Payment can be tracked on-chain via events

### 2. Subscription Creator

Create recurring subscription plans:

**How to use:**
1. Enter plan name
2. Enter price in USD1
3. Select interval (monthly/yearly)
4. (Optional) Add customer email
5. Click "Create Subscription"

**Note:** SubscriptionManager contract is not yet deployed. This feature currently returns a stub response.

### 3. Agent Flow Panel

View MCP integration examples and multi-token settlement info:

**Tabs:**
- **JSON Payload:** Raw invoice/subscription data
- **MCP Calls:** Example MCP method calls for AI agents
- **Settlement:** Multi-token to USD1 swap simulation

## Architecture

### Contract Integration Flow

```
User (Wallet)
    ↓
INVOICESUBSCRIPTION-UI (React + Ethers.js)
    ↓
BNBPayRouter (0xA3d5...)
    ↓
PaymentRegistry (0x1B71...)
    ↓
PaymentSettledV2 Event Emitted
    ↓
SessionStore (0x9BDC...) - x402 session created
```

### Key Files

```
INVOICESUBSCRIPTION-UI/
├── src/
│   ├── contracts/
│   │   ├── index.ts              # Contract integration utilities
│   │   └── abis/                 # Contract ABIs (JSON)
│   │       ├── PaymentRegistry.json
│   │       ├── BNBPayRouter.json
│   │       └── SessionStore.json
│   ├── lib/
│   │   ├── contracts.ts          # Real contract implementations
│   │   ├── contract-stubs.ts     # Legacy stubs (deprecated)
│   │   ├── web3.ts              # Web3 utilities
│   │   └── types.ts             # TypeScript types
│   ├── components/
│   │   ├── InvoiceCreator.tsx   # Invoice creation form
│   │   ├── SubscriptionCreator.tsx
│   │   └── ...
│   └── App.tsx                   # Main app
├── .env                          # Environment configuration
└── package.json
```

## API Reference

### Contract Functions

#### `createPayment(signer, params)`

Create a payment through BNBPayRouter:

```typescript
import { createPayment } from './contracts';

const result = await createPayment(signer, {
  merchant: '0x...',
  token: TOKEN_ADDRESSES.USDT,
  amount: '10.0', // USD1 amount
  feeAmount: '0.1', // Optional fee
  referenceData: 'inv_123',
  resourceId: 'x402://merchant/invoice/123',
});

console.log(result.txHash); // Transaction hash
console.log(result.paymentId); // Payment ID
```

#### `isPaymentSettled(provider, paymentId)`

Check if a payment has been settled:

```typescript
import { isPaymentSettled, getProvider } from './contracts';

const provider = getProvider();
const settled = await isPaymentSettled(provider, paymentId);

if (settled) {
  console.log('Payment confirmed!');
}
```

#### `getPaymentDetails(provider, paymentId)`

Get payment details from events:

```typescript
import { getPaymentDetails, getProvider } from './contracts';

const provider = getProvider();
const details = await getPaymentDetails(provider, paymentId);

console.log(details.merchant);
console.log(details.amount);
console.log(details.token);
```

#### `createSession(signer, params)`

Create an x402 session:

```typescript
import { createSession } from './contracts';

const result = await createSession(signer, {
  resourceId: 'x402://merchant/resource',
  merchant: '0x...',
  amount: '10.0',
  token: TOKEN_ADDRESSES.USDT,
  expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour
});

console.log(result.sessionId);
console.log(result.txHash);
```

### Web3 Utilities

#### `connectWallet()`

Connect to MetaMask wallet:

```typescript
import { connectWallet, switchToBSCTestnet } from './lib/contracts';

const { address, chainId } = await connectWallet();

if (chainId !== 97) {
  await switchToBSCTestnet();
}
```

## X402 Flex Integration

This UI fully supports the x402 Flex protocol for HTTP 402 payment flows:

### Payment Intent Structure

```typescript
{
  paymentId: "0x...",      // Deterministic payment ID
  merchant: "0x...",       // Merchant address
  token: "0x...",          // Payment token address
  amount: "1000000000000000000", // Amount in wei
  deadline: 1234567890,    // Unix timestamp
  resourceId: "0x..."      // x402 resource ID (bytes32)
}
```

### X402 Headers

```
X-402-Protocol: flex/1.0
X-402-Resource-Id: bnbpay:invoice:inv_123
X-402-Amount: 10.0
X-402-Currency: USD1
X-402-Chain: bnb-chain:97
X-402-Merchant: 0x...
X-402-Settlement: USD1
X-402-Router: 0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B
```

### Event Tracking

All payments emit the `PaymentSettledV2` event:

```solidity
event PaymentSettledV2(
    bytes32 indexed paymentId,
    address indexed payer,
    address indexed merchant,
    address token,
    uint256 amount,
    uint256 feeAmount,
    bytes32 schemeId,
    string referenceData,
    bytes32 resourceId,
    uint256 timestamp
);
```

## MCP Integration

The UI includes MCP (Model Context Protocol) examples for AI agent automation:

### Example MCP Calls

```typescript
// Create invoice
await mcp.call('x402.create_invoice', {
  amount: '10.0',
  currency: 'USD1',
  description: 'Payment for services',
  customer: { name: 'John', email: 'john@example.com' }
});

// Check status
await mcp.call('x402.get_status', {
  invoiceId: 'inv_123'
});

// Settle to USD1
await mcp.call('x402.settle_to_usd1', {
  invoiceId: 'inv_123'
});
```

## Troubleshooting

### Common Issues

**1. "No Web3 wallet detected"**
- Install MetaMask or another Web3 wallet
- Make sure it's enabled in your browser

**2. "Failed to switch to BSC Testnet"**
- Manually add BSC Testnet to MetaMask:
  - Network Name: BNB Smart Chain Testnet
  - RPC URL: https://data-seed-prebsc-1-s1.binance.org:8545
  - Chain ID: 97
  - Currency Symbol: tBNB
  - Block Explorer: https://testnet.bscscan.com

**3. "Insufficient funds for gas"**
- Get testnet BNB from the faucet (see step 5 above)

**4. "Transaction failed"**
- Check that you have enough token balance
- Make sure you've approved the token (for ERC-20 tokens)
- Verify the contract addresses in `.env`

**5. "Contract call reverted"**
- Check the console for detailed error messages
- Verify the transaction on BSCScan testnet explorer
- Make sure contracts are properly deployed

### Debug Mode

Enable debug logging in browser console:

```javascript
localStorage.setItem('DEBUG', 'bnbpay:*');
```

## Testing Checklist

- [ ] Connect wallet successfully
- [ ] Switch to BSC Testnet
- [ ] Create invoice (test with small amount)
- [ ] View transaction on BSCScan
- [ ] Check PaymentSettledV2 event
- [ ] Generate QR code
- [ ] Copy payment link
- [ ] View JSON payload
- [ ] Check MCP examples
- [ ] Test multi-token swap simulation

## Production Deployment

### Pre-deployment Checklist

- [ ] Update contract addresses for mainnet in `.env`
- [ ] Test thoroughly on testnet
- [ ] Security audit completed
- [ ] Error handling tested
- [ ] User documentation complete
- [ ] Analytics integrated
- [ ] Monitoring setup

### Build for Production

```bash
npm run build
```

Output will be in `dist/` directory. Deploy to:
- Vercel
- Netlify
- AWS S3 + CloudFront
- Any static hosting service

### Environment Variables for Production

```env
VITE_CHAIN_ID=56
VITE_NETWORK_NAME=BNB Chain
VITE_RPC_URL=https://bsc-dataseed1.binance.org/
VITE_PAYMENT_REGISTRY=0x... # Mainnet address
VITE_BNBPAY_ROUTER=0x...    # Mainnet address
VITE_SESSION_STORE=0x...    # Mainnet address
```

## Support

- **Documentation:** See CLAUDE.md for detailed implementation guide
- **Contract Docs:** See ../../contracts/payments/README.md
- **Issues:** Report bugs on GitHub
- **Discord:** Join BNBPay community

## License

MIT License - see LICENSE file for details
