# BNBPay Gasless Payment Integration Guide

Complete guide for integrating Permit2-based gasless payments with invoice and subscription management.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Invoice Flow](#invoice-flow)
5. [Subscription Flow](#subscription-flow)
6. [Error Handling](#error-handling)
7. [Testing](#testing)
8. [Production Deployment](#production-deployment)

---

## Overview

This integration provides a complete gasless payment solution where:

- **Users only sign transactions** (no gas fees)
- **Relayer pays gas fees** (BNBPay API handles relay)
- **Permit2 enables universal ERC20 approvals** (one-time per token)
- **Invoices and subscriptions** are fully managed
- **USD1-first settlement** with multi-token acceptance

### Key Features

✅ **Gasless Payments** - Users never pay gas fees
✅ **Permit2 Integration** - Universal token approvals
✅ **Invoice Management** - Create, track, and pay invoices
✅ **Subscription Support** - Recurring payments (manual/automated)
✅ **Multi-Token** - Accept BNB, USDT, USDC, USD1, etc.
✅ **Error Handling** - Comprehensive error categorization
✅ **Status Tracking** - Real-time payment status updates

---

## Architecture

### File Structure

```
src/
├── hooks/
│   ├── useInvoices.ts           # Invoice creation and management
│   ├── useGaslessPayment.ts     # Permit2 gasless payment flow
│   └── useSubscriptions.ts      # Subscription plans and billing
├── components/
│   ├── InvoicePayment.tsx       # Payment modal with Permit2
│   ├── InvoiceHistory.tsx       # Invoice list and filtering
│   └── ...
└── lib/
    ├── gasless-payments.ts      # Core Permit2 implementation
    ├── bnbpay-api.ts            # BNBPay API client
    └── web3.ts                  # Web3 wallet integration
```

### Payment Flow

```
┌─────────────┐
│   Invoice   │
│   Created   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   User      │
│   Opens     │──────> InvoicePayment.tsx
│   Modal     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Check     │──────> useGaslessPayment.checkPermit2Approval()
│   Approval  │
└──────┬──────┘
       │
       ├─> Not Approved ───> Approve Permit2 (one-time)
       │
       └─> Approved ────────> Continue
                              │
                              ▼
                        ┌─────────────┐
                        │   Sign      │──> Permit2 Signature
                        │   Permit2   │
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   Sign      │──> Witness Signature
                        │   Witness   │
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   Relay     │──> POST /relay/payment
                        │   Payment   │
                        └──────┬──────┘
                               │
                               ▼
                        ┌─────────────┐
                        │   Payment   │
                        │   Success   │
                        └─────────────┘
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install ethers qrcode
```

### 2. Basic Invoice Creation

```tsx
import { useInvoices } from './hooks/useInvoices';
import { InvoicePayment } from './components/InvoicePayment';

function MyApp() {
  const { createInvoice, invoices } = useInvoices();
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  const handleCreateInvoice = async () => {
    const invoice = await createInvoice({
      merchantAddress: '0xYourMerchantAddress',
      customerName: 'John Doe',
      customerEmail: 'john@example.com',
      description: 'Consulting services',
      amount: '100.00',
      currency: 'USD1',
      tokenAddress: '0xUSD1TokenAddress',
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      network: 'testnet',
    });

    setSelectedInvoice(invoice.invoice);
  };

  return (
    <div>
      <button onClick={handleCreateInvoice}>Create Invoice</button>

      {selectedInvoice && (
        <InvoicePayment
          invoice={selectedInvoice}
          signer={signer}
          provider={provider}
          onPaymentSuccess={(txHash, paymentId) => {
            console.log('Payment successful!', txHash, paymentId);
            setSelectedInvoice(null);
          }}
          onPaymentError={(error) => {
            console.error('Payment failed:', error);
          }}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}
```

### 3. Basic Gasless Payment

```tsx
import { useGaslessPayment } from './hooks/useGaslessPayment';

function PaymentButton({ invoice, signer, provider }) {
  const { payGasless, loading, error, requiresApproval, approveToken } = useGaslessPayment();

  const handlePay = async () => {
    // Check if approval is needed
    if (requiresApproval) {
      await approveToken(invoice.tokenAddress, signer);
    }

    // Execute gasless payment
    const result = await payGasless({
      merchantAddress: invoice.merchantAddress,
      amount: invoice.amount,
      paymentToken: invoice.currency,
      tokenAddress: invoice.tokenAddress,
      invoiceId: invoice.id,
      network: invoice.network,
      signer,
      provider,
    });

    console.log('Payment successful!', result);
  };

  return (
    <button onClick={handlePay} disabled={loading}>
      {loading ? 'Processing...' : 'Pay Invoice'}
    </button>
  );
}
```

---

## Invoice Flow

### Creating an Invoice

```tsx
const { createInvoice } = useInvoices();

const invoice = await createInvoice({
  merchantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  customerName: 'Alice Smith',
  customerEmail: 'alice@example.com',
  description: 'Monthly subscription',
  amount: '50.00',
  currency: 'USD1',
  tokenAddress: NETWORKS.testnet.tokens.usdt, // From your config
  dueDate: new Date('2025-02-01'),
  network: 'testnet',
});
```

### Displaying Invoice Payment Modal

```tsx
<InvoicePayment
  invoice={invoice}
  signer={signer}
  provider={provider}
  onPaymentSuccess={(txHash, paymentId) => {
    // Update your UI
    updateInvoiceStatus(invoice.id, 'paid', txHash, paymentId);
  }}
  onPaymentError={(error) => {
    // Handle error
    showNotification('Payment failed: ' + error.message);
  }}
  onClose={() => {
    // Close modal
    setShowPaymentModal(false);
  }}
/>
```

### Tracking Invoice Status

```tsx
const { invoices, getPendingInvoices, getPaidInvoices } = useInvoices();

const pending = getPendingInvoices(); // All unpaid invoices
const paid = getPaidInvoices(); // All paid invoices

// Check for expired invoices
useEffect(() => {
  const interval = setInterval(() => {
    checkExpiredInvoices();
  }, 60000); // Check every minute

  return () => clearInterval(interval);
}, []);
```

---

## Subscription Flow

### Creating a Subscription Plan

```tsx
const { createPlan } = useSubscriptions();

const plan = await createPlan({
  name: 'Pro Plan',
  description: 'Full access to all features',
  price: '29.99',
  currency: 'USD1',
  tokenAddress: NETWORKS.testnet.tokens.usdt,
  interval: 'monthly',
  merchantAddress: '0xYourMerchantAddress',
  network: 'testnet',
});
```

### Subscribing a Customer

```tsx
const { createSubscription } = useSubscriptions();

const subscription = await createSubscription({
  planId: plan.id,
  customerEmail: 'customer@example.com',
  customerName: 'Bob Johnson',
  customerAddress: '0xCustomerWalletAddress',
});
```

### Charging a Subscription (Recurring Payment)

```tsx
const { chargeSubscription, checkDueBillings } = useSubscriptions();

// Check which subscriptions need billing
const dueSubscriptions = checkDueBillings();

// Charge each subscription
for (const sub of dueSubscriptions) {
  try {
    const result = await chargeSubscription({
      subscriptionId: sub.id,
      signer: sub.customerSigner, // Customer's signer
      provider,
    });

    console.log('Subscription charged:', result.txHash);
  } catch (error) {
    console.error('Failed to charge subscription:', error);
    // Subscription status automatically updated to 'payment_failed'
  }
}
```

### Automated Subscription Billing (Backend)

In production, you'd run a cron job on your backend:

```typescript
// backend/cron/subscription-billing.ts
import { checkDueBillings, chargeSubscription } from './subscription-service';

// Run every hour
cron.schedule('0 * * * *', async () => {
  const dueSubscriptions = await checkDueBillings();

  for (const sub of dueSubscriptions) {
    try {
      // Use stored authorization or session
      await chargeSubscription(sub.id);

      // Send email notification
      await sendPaymentConfirmation(sub.customerEmail);
    } catch (error) {
      // Retry logic
      await retryPayment(sub.id);

      // Send dunning email after 3 failures
      if (sub.failedAttempts >= 3) {
        await sendDunningEmail(sub.customerEmail);
      }
    }
  }
});
```

---

## Error Handling

### Error Types

The gasless payment system categorizes errors:

```typescript
type ErrorCode =
  | 'PERMIT2_NOT_APPROVED'      // User needs to approve Permit2
  | 'INSUFFICIENT_BALANCE'      // Not enough tokens
  | 'SIGNATURE_EXPIRED'         // Signature deadline passed
  | 'INVALID_SIGNATURE'         // Signature verification failed
  | 'USER_REJECTED'             // User cancelled in wallet
  | 'PAYMENT_FAILED'            // General payment failure
  | 'APPROVAL_CHECK_FAILED'     // Failed to check approval status
  | 'APPROVAL_FAILED';          // Approval transaction failed
```

### Handling Errors

```tsx
const { payGasless, error } = useGaslessPayment();

try {
  await payGasless(params);
} catch (err) {
  // Error is automatically set in the hook
  if (error) {
    switch (error.code) {
      case 'PERMIT2_NOT_APPROVED':
        // Show approval UI
        showApprovalModal();
        break;

      case 'INSUFFICIENT_BALANCE':
        // Show balance error
        alert(`Insufficient balance: ${error.message}`);
        break;

      case 'USER_REJECTED':
        // User cancelled, no action needed
        console.log('Payment cancelled by user');
        break;

      default:
        // Show generic error
        alert(`Payment failed: ${error.message}`);
    }
  }
}
```

### Retry Logic

```tsx
async function payWithRetry(params, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await payGasless(params);
    } catch (error) {
      if (error.code === 'USER_REJECTED') {
        // Don't retry if user cancelled
        throw error;
      }

      if (attempt === maxRetries) {
        // Final attempt failed
        throw error;
      }

      // Wait before retrying (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
    }
  }
}
```

---

## Testing

### Local Testing with Testnet

```tsx
// .env
VITE_CHAIN_ID=97
VITE_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
VITE_PAYMENT_REGISTRY=0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D
VITE_BNBPAY_ROUTER=0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B
VITE_PERMIT2=0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768
```

### Manual Testing Checklist

- [ ] Create invoice
- [ ] Open payment modal
- [ ] Check Permit2 approval status
- [ ] Approve Permit2 (if needed)
- [ ] Sign Permit2 permit
- [ ] Sign witness
- [ ] Verify payment relay
- [ ] Check invoice status updated
- [ ] Verify transaction on BSCScan
- [ ] Test error cases (insufficient balance, expired signature)

### Automated Tests

```typescript
// __tests__/gasless-payment.test.ts
import { payInvoiceGasless } from '../lib/gasless-payments';

describe('Gasless Payment', () => {
  it('should successfully pay invoice with Permit2', async () => {
    const result = await payInvoiceGasless({
      merchantAddress: TEST_MERCHANT,
      amount: '10.00',
      paymentToken: 'USDT',
      tokenAddress: TEST_USDT_ADDRESS,
      invoiceId: 'INV-TEST-001',
      network: 'testnet',
      signer: testSigner,
      provider: testProvider,
    });

    expect(result.txHash).toBeDefined();
    expect(result.paymentId).toBeDefined();
  });

  it('should fail with insufficient balance', async () => {
    await expect(
      payInvoiceGasless({
        merchantAddress: TEST_MERCHANT,
        amount: '1000000.00', // Exceeds balance
        paymentToken: 'USDT',
        tokenAddress: TEST_USDT_ADDRESS,
        invoiceId: 'INV-TEST-002',
        network: 'testnet',
        signer: testSigner,
        provider: testProvider,
      })
    ).rejects.toThrow('Insufficient balance');
  });
});
```

---

## Production Deployment

### Environment Setup

```bash
# Production .env
VITE_CHAIN_ID=56
VITE_RPC_URL=https://bsc-dataseed.binance.org
VITE_PAYMENT_REGISTRY=0xProductionRegistryAddress
VITE_BNBPAY_ROUTER=0xProductionRouterAddress
VITE_PERMIT2=0x000000000022D473030F116dDEE9F6B43aC78BA3
```

### Security Checklist

- [ ] Validate all user inputs
- [ ] Use HTTPS for all API calls
- [ ] Verify smart contract addresses
- [ ] Implement rate limiting
- [ ] Add transaction monitoring
- [ ] Set up error alerting
- [ ] Use production RPC endpoints
- [ ] Enable Web3 wallet security features
- [ ] Implement proper signature expiration
- [ ] Add invoice ID validation

### Monitoring

```typescript
// Track payment success rate
analytics.track('payment_attempt', {
  invoiceId,
  amount,
  currency,
  method: 'permit2_gasless',
});

analytics.track('payment_success', {
  invoiceId,
  txHash,
  paymentId,
  duration: Date.now() - startTime,
});

analytics.track('payment_failed', {
  invoiceId,
  errorCode: error.code,
  errorMessage: error.message,
});
```

### Performance Optimization

```typescript
// Batch approval checks
async function checkMultipleApprovals(tokens: string[], owner: string, provider: Provider) {
  const checks = tokens.map(token => isPermit2Approved(token, owner, provider));
  return await Promise.all(checks);
}

// Cache payment intents
const intentCache = new Map<string, BuildIntentResponse>();

async function getCachedIntent(key: string, builder: () => Promise<BuildIntentResponse>) {
  if (intentCache.has(key)) {
    return intentCache.get(key)!;
  }

  const intent = await builder();
  intentCache.set(key, intent);

  // Clear cache after 5 minutes
  setTimeout(() => intentCache.delete(key), 5 * 60 * 1000);

  return intent;
}
```

---

## Advanced Features

### Webhook Integration

```typescript
// backend/webhooks/payment-settled.ts
export async function handlePaymentSettled(event: PaymentSettledEvent) {
  const { paymentId, invoiceId, txHash, merchant, payer, amount } = event;

  // Update database
  await db.invoices.update({
    where: { id: invoiceId },
    data: {
      status: 'paid',
      txHash,
      paymentId,
      paidAt: new Date(),
    },
  });

  // Send confirmation email
  await sendPaymentConfirmation({
    invoiceId,
    amount,
    txHash,
  });

  // Trigger fulfillment
  await fulfillOrder(invoiceId);
}
```

### Session-Based Payments (x402)

```typescript
// For automated agents or recurring payments
import { createSession } from './lib/bnbpay-api';

const session = await createSession({
  network: 'bnbTestnet',
  payer: customerAddress,
  agent: agentAddress,
  token: usdtAddress,
  budgetAmount: '1000.00', // Total budget
  expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
});

// Agent can now charge within budget without user signature
await chargeSession({
  sessionId: session.sessionId,
  amount: '10.00',
  invoiceId: 'INV-001',
});
```

---

## Support

For issues or questions:

- **Documentation**: `./docs/README.md`
- **API Reference**: `https://api.bnbpay.org/docs`
- **GitHub Issues**: `https://github.com/bnbpay/bnbpay`
- **Discord**: `https://discord.gg/bnbpay`

---

## License

MIT License - see LICENSE file for details.
