# USD1 Payments UI

A complete, production-ready UI for creating USD1-first invoices and subscriptions using the BNBPay x402 Flex standard.

## Features

### Invoice Creation
- Create USD1-denominated invoices
- Customer information collection
- QR code generation for payment
- Multi-token acceptance (BNB, USDT, USDC, FDUSD, etc.)
- Automatic settlement to USD1

### Subscription Management
- Create recurring payment plans
- Monthly and yearly billing intervals
- USD1 pricing with multi-token acceptance
- Automatic retry logic for failed payments
- Proration, dunning, and refund support

### Agent/MCP Integration
- JSON payload export
- MCP method examples
- Multi-token swap simulation
- Settlement automation examples
- Webhook integration ready

## Design System

This UI follows the **exact same design language** as the BNBPay payment demo:

- **Colors**: BNB Chain yellow (#F0B90B) with purple gradient backgrounds
- **Components**: Clean white cards with rounded corners and shadow effects
- **Typography**: System font stack for optimal rendering
- **Forms**: Consistent input styling with yellow focus states
- **Buttons**: BNB yellow with hover animations
- **Modals**: Full-screen overlays with QR code display

## Technology Stack

- **React 18**: Modern React with hooks
- **TypeScript**: Full type safety
- **Vite**: Fast development and optimized builds
- **Tailwind CSS**: Utility-first styling matching payment-demo
- **QRCode.js**: QR code generation for payment links
- **Ethers.js v6**: Blockchain interaction (via SDK)

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or pnpm package manager

### Installation

```bash
# Navigate to the USD1 payments UI directory
cd apps/usd1-payments-ui

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
# Build optimized production bundle
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
usd1-payments-ui/
├── src/
│   ├── components/
│   │   ├── InvoiceCreator.tsx       # Invoice creation form
│   │   ├── SubscriptionCreator.tsx  # Subscription creation form
│   │   ├── InvoiceModal.tsx         # Invoice display modal
│   │   ├── SubscriptionModal.tsx    # Subscription display modal
│   │   └── AgentFlowPanel.tsx       # MCP/automation panel
│   ├── lib/
│   │   ├── types.ts                 # TypeScript type definitions
│   │   └── contract-stubs.ts        # Blockchain interaction stubs
│   ├── App.tsx                      # Main application component
│   ├── main.tsx                     # Application entry point
│   └── index.css                    # Global styles (Tailwind)
├── public/                          # Static assets
├── index.html                       # HTML template
├── package.json                     # Dependencies and scripts
├── tailwind.config.js               # Tailwind configuration
├── tsconfig.json                    # TypeScript configuration
├── vite.config.ts                   # Vite build configuration
└── README.md                        # This file
```

## Usage

### Basic Mode

1. Select **Invoice** or **Subscription** tab
2. Fill in the required information
3. Click **Generate USD1 Invoice** or **Create USD1 Subscription**
4. View the generated QR code and payment link
5. Copy the link or JSON payload

### Agent Mode

1. Toggle to **Agent Mode** using the mode switcher
2. Create an invoice or subscription
3. View the raw JSON payload
4. Explore MCP method examples
5. Simulate multi-token swaps
6. See settlement automation examples

## Contract Integration (Stubs)

The current implementation includes **stub functions** for blockchain operations:

- `deployContract()`: Deploy USD1 payment contracts
- `createInvoiceOnChain()`: Create invoice on-chain
- `createSubscriptionOnChain()`: Create subscription on-chain
- `settleToUSD1()`: Settle multi-token payment to USD1
- `simulateMultiTokenSwap()`: Simulate DEX swap

To integrate with real contracts:

1. Update `src/lib/contract-stubs.ts` with actual contract calls
2. Import BNBPay SDK: `import { BNBPay } from '@bnbpay/sdk'`
3. Connect to BNB Chain provider
4. Call PaymentRegistry and SubscriptionManager contracts

## Configuration

### Tailwind Colors

The Tailwind config includes BNB Chain and PePay branding:

```javascript
colors: {
  bnb: {
    yellow: '#F0B90B',
    dark: '#0B0E11',
    light: '#FFF9E5',
  },
  pepay: {
    primary: '#F0B90B',
    secondary: '#764ba2',
    accent: '#667eea',
  },
}
```

### Environment Variables

Create a `.env` file for configuration:

```env
VITE_CHAIN_ID=97                              # BNB Testnet
VITE_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
VITE_PAYMENT_REGISTRY=0x...                   # Contract address
VITE_SUBSCRIPTION_MANAGER=0x...               # Contract address
VITE_USD1_TOKEN=0x...                         # USD1 token address
```

## Features Roadmap

### Phase 1 (Current)
- ✅ Invoice creation UI
- ✅ Subscription creation UI
- ✅ QR code generation
- ✅ Modal displays
- ✅ MCP panel
- ✅ Contract stubs

### Phase 2 (Next)
- ⏳ Real contract integration
- ⏳ Wallet connection (MetaMask, Trust, Binance)
- ⏳ Payment verification
- ⏳ Transaction monitoring
- ⏳ Webhook integration

### Phase 3 (Future)
- ⏳ Payment history dashboard
- ⏳ Customer management
- ⏳ Analytics and reporting
- ⏳ Multi-language support
- ⏳ Mobile app version

## Development Commands

```bash
# Install dependencies
npm install

# Start dev server (with hot reload)
npm run dev

# Type checking
npm run build  # TypeScript checks included

# Linting (if configured)
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

## Integration Examples

### Create Invoice from API

```typescript
const invoice = {
  type: 'invoice',
  currency: 'USD1',
  amount: '100.00',
  description: 'Consulting services',
  customer: {
    name: 'John Doe',
    email: 'john@example.com',
  },
  supports_multi_token: true,
  settlement: 'USD1',
};

const result = await contractStubs.createInvoiceOnChain(invoice);
```

### MCP Agent Call

```typescript
// x402.create_invoice
{
  "method": "x402.create_invoice",
  "params": {
    "type": "invoice",
    "currency": "USD1",
    "amount": "100.00",
    "customer": { ... }
  }
}
```

## PePay Features Highlighted

This UI demonstrates all key PePay capabilities:

- Multi-token acceptance with automatic DEX settlement to USD1
- Subscriptions with retries, proration, dunning, refunds
- Controlled enterprise payouts
- SDKs, WordPress plugins, e-commerce connectors, POS rails
- BNBPay + x402 Flex rails for BNB chain
- Designed for remittance & 2026 USD1 → bank routes
- USD1 as settlement-of-record across the stack

## Contributing

This is part of the BNBPay monorepo. For contribution guidelines, see the root README.

## License

See the root LICENSE file in the BNBPay repository.

## Support

For issues or questions:
- GitHub Issues: https://github.com/[org]/bnb-pay/issues
- Documentation: See `/docs` in the monorepo
- Specification: See `/SPEC.md` in the root

## Related

- [BNBPay SDK](../../packages/sdk-ts)
- [Payment Demo](../../examples/payment-demo)
- [MCP Server](../../mcp-server)
- [X402 Flex Package](../../packages/x402flex)

---

**Powered by PePay • BNBPay • x402 Flex**
