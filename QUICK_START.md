# Quick Start - Gasless Payments with BNBPay

## 🚀 Get Started in 3 Steps

### Step 1: Import Hooks

```tsx
import { useInvoices } from './hooks/useInvoices';
import { useGaslessPayment } from './hooks/useGaslessPayment';
import { InvoicePayment } from './components/InvoicePayment';
```

### Step 2: Create an Invoice

```tsx
const { createInvoice } = useInvoices();

const { invoice } = await createInvoice({
  merchantAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
  customerName: 'Alice Smith',
  customerEmail: 'alice@example.com',
  description: 'Consulting services',
  amount: '100.00',
  currency: 'USD1',
  tokenAddress: NETWORKS.testnet.tokens.usdt,
  dueDate: new Date('2025-02-01'),
  network: 'testnet',
});
```

### Step 3: Display Payment Modal

```tsx
<InvoicePayment
  invoice={invoice}
  signer={signer}
  provider={provider}
  onPaymentSuccess={(txHash, paymentId) => {
    console.log('Payment successful!', txHash);
  }}
  onClose={() => setShowModal(false)}
/>
```

## ✅ That's It!

The modal handles:
- ✅ Permit2 approval check
- ✅ Token approval (if needed)
- ✅ Gasless payment signatures
- ✅ Payment relay to BNBPay API
- ✅ Success/error handling
- ✅ QR code generation

---

## 📊 Invoice Management

```tsx
const {
  invoices,              // All invoices
  createInvoice,         // Create invoice
  getPendingInvoices,    // Get unpaid
  getPaidInvoices,       // Get paid
  markInvoicePaid,       // Update status
} = useInvoices();
```

### Display Invoice List

```tsx
import { InvoiceHistory } from './components/InvoiceHistory';

<InvoiceHistory
  invoices={invoices}
  onSelectInvoice={(inv) => setSelected(inv)}
  onPayInvoice={(inv) => setShowPaymentModal(true)}
/>
```

---

## 💳 Subscription Support

```tsx
import { useSubscriptions } from './hooks/useSubscriptions';

const { createPlan, createSubscription, chargeSubscription } = useSubscriptions();

// Create a plan
const plan = await createPlan({
  name: 'Pro Plan',
  price: '29.99',
  currency: 'USD1',
  interval: 'monthly',
  merchantAddress: '0x...',
  tokenAddress: '0x...',
  network: 'testnet',
});

// Subscribe customer
const subscription = await createSubscription({
  planId: plan.id,
  customerEmail: 'customer@example.com',
  customerName: 'Bob',
  customerAddress: '0xCustomerWallet',
});

// Charge subscription (recurring)
const result = await chargeSubscription({
  subscriptionId: subscription.id,
  signer: customerSigner,
  provider,
});
```

---

## 🔧 Direct Payment API

For advanced use cases:

```tsx
import { payInvoiceGasless } from './lib/gasless-payments';

const result = await payInvoiceGasless({
  merchantAddress: '0x...',
  amount: '10.50',
  paymentToken: 'USDT',
  tokenAddress: '0x...',
  invoiceId: 'INV-001',
  network: 'testnet',
  signer,
  provider,
});

console.log('Tx Hash:', result.txHash);
console.log('Payment ID:', result.paymentId);
```

---

## ❌ Error Handling

```tsx
const { payGasless, error } = useGaslessPayment();

try {
  await payGasless(params);
} catch (err) {
  if (error?.code === 'PERMIT2_NOT_APPROVED') {
    // Show approval UI
  } else if (error?.code === 'INSUFFICIENT_BALANCE') {
    alert(`Not enough tokens: ${error.message}`);
  } else {
    alert(`Payment failed: ${error.message}`);
  }
}
```

---

## 📄 Full Documentation

- **Complete Guide**: `GASLESS_INTEGRATION_GUIDE.md`
- **Implementation Details**: `IMPLEMENTATION_COMPLETE.md`
- **Contract ABIs**: `src/contracts/abis/`
- **API Reference**: `src/lib/bnbpay-api.ts`

---

## 🧪 Testing

```bash
# Start dev server
npm run dev

# Open browser
http://localhost:5173

# Connect MetaMask to BSC Testnet
# Get testnet BNB from faucet
# Get testnet USDT tokens
# Create and pay an invoice
```

---

## 🎯 Contract Addresses (Testnet)

```
Chain ID: 97 (BSC Testnet)
RPC: https://data-seed-prebsc-1-s1.binance.org:8545

PaymentRegistry: 0x1B71cBdeA2f36A06B0ed844B5080bf620Ef8052D
BNBPayRouter: 0xA3d5EAaFCc1378058CE008Be1E9392D4E738083B
Permit2: 0x31c2F6fcFf4F8759b3Bd5Bf0e1084A055615c768

Tokens:
- USDT: 0x337610d27c682E347C9cD60BD4b3b107C9d34dDd
- BUSD: 0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee
```

---

## 💡 Tips

1. **First-time users** need to approve Permit2 once per token
2. **Gasless payments** require user to sign (no gas fees)
3. **Invoices expire** based on due date - check status
4. **Subscriptions** need manual charging (or cron job in backend)
5. **Error messages** are user-friendly - show them directly

---

## 🆘 Need Help?

- Check `GASLESS_INTEGRATION_GUIDE.md` for detailed examples
- Review code comments in `src/hooks/` and `src/components/`
- Test on BSC Testnet before mainnet
- Verify transactions on https://testnet.bscscan.com

**Happy coding!** 🚀
