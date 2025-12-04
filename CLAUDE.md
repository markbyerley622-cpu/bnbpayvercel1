# USD1 Payments UI Guide

## Package Overview
**Name**: USD1 Payments UI
**Description**: Production-ready React UI for creating USD1-first invoices and subscriptions with x402 Flex integration
**Path**: apps/usd1-payments-ui

## Critical Design Standards

### 1. Match Payment Demo Design EXACTLY
This UI **MUST** match the design language from `examples/payment-demo/index.html`:

- **Colors**: BNB yellow (#F0B90B), dark (#0B0E11), gradient backgrounds (purple to blue)
- **Cards**: White background, rounded-2xl corners, shadow-card effect
- **Forms**: 2px borders, gray-200 default, yellow focus, rounded-lg inputs
- **Buttons**: BNB yellow background, bold text, hover lift effect
- **Typography**: System font stack, clear hierarchy
- **Spacing**: Consistent padding (p-4, p-6, p-8 pattern)

### 2. Component Architecture

**InvoiceCreator**
- Form fields: customer name, email, description, amount (USD1), due date
- Validation: required fields, email format, positive amounts
- Output: InvoiceData object with multi-token support flag
- Integration: Opens InvoiceModal on successful creation

**SubscriptionCreator**
- Form fields: plan name, price (USD1), interval, optional customer email
- Interval options: monthly, yearly
- Output: SubscriptionData object with multi-token support flag
- Integration: Opens SubscriptionModal on successful creation

**InvoiceModal / SubscriptionModal**
- QR code display using qrcode package
- Payment link with copy button
- JSON payload display with copy button
- Close button and overlay click-to-close
- Footer: "Powered by PePay • BNBPay • x402 Flex"

**AgentFlowPanel**
- Three tabs: JSON Payload, MCP Calls, Settlement
- JSON tab: Pretty-printed raw payload
- MCP tab: Example method calls with descriptions
- Settlement tab: Multi-token explanation + swap simulator
- Copy buttons for all code blocks

**App (Landing Page)**
- Header: BNB yellow with "USD1 Payments" title
- Mode toggle: Basic / Agent mode switcher
- Tab navigation: Invoice / Subscription
- Two-column layout: Form left, Info/Panel right
- Footer: PePay branding and links

### 3. USD1-First Philosophy

**Every component must emphasize:**
- Primary denomination: USD1
- Multi-token acceptance: BNB, USDT, USDC, FDUSD, etc.
- Automatic settlement: All payments settle to USD1
- No volatility: Merchants receive stable USD1

**UI messaging:**
- "Accepts multi-token payments with automatic DEX settlement to USD1"
- "USD1 as settlement-of-record"
- "No price volatility risk"

### 4. Contract Stub Implementation

Current stubs in `src/lib/contract-stubs.ts`:
- `deployContract()`: Simulates contract deployment
- `createInvoiceOnChain()`: Returns mock invoice ID and tx hash
- `createSubscriptionOnChain()`: Returns mock subscription ID and tx hash
- `settleToUSD1()`: Simulates settlement transaction
- `simulateMultiTokenSwap()`: Returns mock swap quote

**Future integration:**
Replace stubs with actual BNBPay SDK calls to:
- PaymentRegistry contract
- SubscriptionManager contract
- BNBPayRouter for settlements

### 5. MCP Integration Examples

Generate example calls for:
- `x402.create_invoice(payload)`
- `x402.create_subscription(payload)`
- `x402.get_status(id)`
- `x402.settle_to_usd1(id)`

Include automation scenarios:
- Retry failed payments after 24h
- Dunning emails after 3 failed attempts
- Auto-settle multi-token to USD1
- Webhook triggers on completion

### 6. Tailwind Configuration

Custom theme extensions:
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
boxShadow: {
  'card': '0 20px 60px rgba(0,0,0,0.3)',
  'soft': '0 4px 20px rgba(0,0,0,0.1)',
}
```

### 7. Build Configuration

**Vite setup:**
- React plugin with Fast Refresh
- TypeScript strict mode
- Development port: 3000
- Optimized production builds

**TypeScript config:**
- Strict mode enabled
- Target: ES2020
- Module: ESNext
- JSX: react-jsx

**PostCSS:**
- Tailwind CSS
- Autoprefixer

### 8. Testing Strategy

**Manual testing checklist:**
- [ ] Invoice form validation works
- [ ] Subscription form validation works
- [ ] QR codes generate correctly
- [ ] Modals open and close properly
- [ ] Copy buttons work (clipboard API)
- [ ] Mode toggle switches correctly
- [ ] Tab navigation works
- [ ] All styling matches payment-demo
- [ ] Responsive on mobile/tablet/desktop
- [ ] No console errors

**Browser compatibility:**
- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile Safari: iOS 14+
- Mobile Chrome: Android 10+

### 9. Integration Points

**Current:**
- Stub functions for all blockchain operations
- Mock data generation for testing
- Client-side state management

**Future:**
- Connect to BNBPay SDK (`@bnbpay/sdk`)
- Web3 wallet integration (MetaMask, Trust, Binance)
- Real-time payment monitoring
- Webhook event handlers
- Backend API for merchant management

### 10. Deployment

**Development:**
```bash
cd apps/usd1-payments-ui
npm install
npm run dev
```

**Production:**
```bash
npm run build
# Outputs to dist/ directory
# Deploy to Vercel, Netlify, or static hosting
```

**Environment variables:**
```env
VITE_CHAIN_ID=97
VITE_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
VITE_PAYMENT_REGISTRY=0x...
VITE_SUBSCRIPTION_MANAGER=0x...
```

## Critical Rules

1. **NEVER** deviate from the payment-demo design system
2. **ALWAYS** emphasize USD1 as primary settlement currency
3. **NEVER** remove PePay/BNBPay branding from footer
4. **ALWAYS** include "multi-token support" messaging
5. **NEVER** skip input validation on forms
6. **ALWAYS** show QR codes for payment links
7. **NEVER** store sensitive data client-side
8. **ALWAYS** maintain TypeScript strict mode

## Next Steps

### Phase 2: Real Blockchain Integration
1. Replace contract stubs with SDK calls
2. Add Web3 wallet connection
3. Implement payment verification
4. Add transaction monitoring
5. Create webhook handlers

### Phase 3: Enhanced Features
1. Payment history dashboard
2. Customer management
3. Analytics and reporting
4. Multi-language support
5. Mobile app version

## References

- Payment Demo: `../../examples/payment-demo/index.html`
- SDK Types: `../../packages/sdk-ts/src/types.ts`
- X402 Spec: `../../SPEC.md`
- Root Documentation: `../../docs/README.md`

## Important Notes

This UI is the **canonical reference** for USD1-first payments on BNBPay. It demonstrates:
- Solana Pay parity with EVM enhancements
- X402 Flex integration
- MCP/agent automation readiness
- Enterprise-grade subscription management
- Multi-token acceptance with stable settlement

**Every design decision prioritizes:**
1. User clarity and trust
2. USD1 settlement transparency
3. Multi-token flexibility
4. Enterprise automation readiness
5. BNB Chain ecosystem alignment
