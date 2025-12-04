# On-Chain Invoice Creation Guide

## Overview

Invoices now interact with PaymentRegistry and BNBPayRouter contracts through MetaMask, creating on-chain payment records with x402 Flex protocol support.

## How It Works

### 1. Invoice Creation Flow

When a merchant creates an invoice, the following happens:

#### Step 1: Generate x402 Flex Headers
```typescript
createInvoiceIntent() → {
  invoiceId,
  paymentLink,
  x402FlexHeaders,
  resourceId
}
```

Creates the x402 Flex metadata including:
- Protocol version
- Resource ID (`bnbpay:invoice:{id}`)
- Amount and currency (USD1)
- Chain ID (56 for mainnet, 97 for testnet)
- Accepted tokens
- Settlement currency

#### Step 2: Connect MetaMask
- Prompts user to connect MetaMask
- Switches to the correct network (mainnet or testnet)
- Gets merchant address from connected wallet

#### Step 3: Prepare Transaction Data
```typescript
{
  merchantAddress: "0x...",
  amount: ethers.parseUnits(usdAmount, 18), // Convert to wei
  token: tokenAddress, // BNB/USDT/BUSD address
  referenceData: JSON.stringify({
    customerName,
    customerEmail,
    description,
    invoiceId,
    timestamp
  }),
  resourceId: "bnbpay:invoice:inv_..."
}
```

#### Step 4: Call BNBPayRouter
```solidity
router.payWithResourceId(
  paymentRegistry, // PaymentRegistry contract address
  token,          // Payment token address
  merchant,       // Merchant address
  amount,         // Amount in wei
  referenceData,  // JSON metadata
  resourceId      // x402 resource ID as bytes32
)
```

#### Step 5: Settlement via PaymentRegistry
The Router automatically calls:
```solidity
paymentRegistry.settleFromRouter(
  intent,
  schemeId,
  referenceData
)
```

This emits the `PaymentSettledV2` event:
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
)
```

## Network Configuration

### Testnet (Chain ID 97)
```typescript
{
  tokens: {
    TBNB: "0x0000000000000000000000000000000000000000",
    TUSDT: "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd",
    TBUSD: "0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee"
  },
  contracts: {
    paymentRegistry: "0x7C86190b9bE40E4a5B1078B1831a3F2441E57c45",
    bnbPayRouter: "0xd63D036aEAf02985800d8D4e4B29024d7B35af94"
  }
}
```

### Mainnet (Chain ID 56)
```typescript
{
  tokens: {
    BNB: "0x0000000000000000000000000000000000000000",
    USDT: "0x55d398326f99059fF775485246999027B3197955",
    BUSD: "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56"
  },
  contracts: {
    paymentRegistry: "TO_BE_DEPLOYED",
    bnbPayRouter: "TO_BE_DEPLOYED"
  }
}
```

## Token Approval Flow

For ERC20 tokens (USDT, BUSD), the system automatically:

1. **Check Allowance**
   ```typescript
   const allowance = await tokenContract.allowance(
     userAddress,
     routerAddress
   );
   ```

2. **Approve if Needed**
   ```typescript
   if (allowance < amount) {
     await tokenContract.approve(routerAddress, amount);
   }
   ```

3. **Execute Payment**
   ```typescript
   await router.payWithResourceId(...);
   ```

For native BNB, the value is sent directly:
```typescript
router.payWithResourceId(..., { value: amount });
```

## Invoice Data Structure

```typescript
interface InvoiceData {
  type: 'invoice';
  currency: 'USD1';
  amount: string; // USD1 settlement amount
  description: string;
  customer: {
    name: string;
    email: string;
  };

  // Payment info
  paymentToken: 'BNB' | 'USDT' | 'BUSD' | 'TBNB' | 'TUSDT' | 'TBUSD';
  paymentAmount: string;
  acceptedTokens: TokenPaymentOption[];

  // On-chain data
  invoiceId: string;
  paymentId: string; // bytes32 from router
  txHash: string; // Transaction hash
  merchantAddress: string;

  // x402 Flex
  x402FlexHeaders: Record<string, string>;
  resourceId: string;
  paymentLink: string;
}
```

## UI Flow

### Create Invoice Button
1. User fills form (customer, amount, token)
2. Clicks "Create Invoice"
3. MetaMask popup appears
4. User approves network switch (if needed)
5. User approves token (if ERC20)
6. User confirms transaction
7. Wait for confirmation (1-3 seconds)
8. Invoice modal shows:
   - Invoice details
   - Transaction hash (clickable → BscScan)
   - Payment ID
   - Merchant address
   - QR code for payment link
   - x402 Flex headers

### Modal Display
```
┌─────────────────────────────────────┐
│ Invoice Generated!                  │
│ Invoice ID: inv_abc123             │
├─────────────────────────────────────┤
│ Customer: John Doe                  │
│ Payment: 0.01 TBNB                 │
│ Settles to: $6.00 USD1             │
├─────────────────────────────────────┤
│ ✓ On-Chain Invoice Created         │
│ Transaction: 0x1234...5678         │
│ Payment ID: 0xabcd...ef01          │
│ Merchant: 0x9876...4321            │
│                                     │
│ ✓ Invoice registered via Registry  │
│ ✓ Payment routed via Router        │
│ ✓ Settlement to USD1 guaranteed    │
├─────────────────────────────────────┤
│ [QR Code]                          │
│ Payment Link: https://...          │
│ [Copy] [View JSON]                 │
└─────────────────────────────────────┘
```

## Testing Guide

### Prerequisites
1. MetaMask installed
2. Connected to BNB Testnet (Chain ID 97)
3. Testnet BNB for gas fees
4. Optional: Testnet USDT/BUSD for token payments

### Test Steps

1. **Start Dev Server**
   ```bash
   cd apps/usd1-payments-ui
   npm run dev
   ```

2. **Open Application**
   - Navigate to http://localhost:3000
   - Toggle to "Testnet" in header
   - Click "Generate Invoice"

3. **Fill Invoice Form**
   ```
   Customer Name: Test Customer
   Customer Email: test@example.com
   Description: Test payment
   Amount: 0.01
   Token: TBNB (or TUSDT/TBUSD)
   ```

4. **Create Invoice**
   - Click "Create Invoice"
   - Approve MetaMask connection
   - Approve network switch (if needed)
   - For ERC20: Approve token spending
   - Confirm transaction

5. **Verify Results**
   - Check modal for transaction hash
   - Click transaction hash → opens BscScan
   - Verify PaymentSettledV2 event in logs
   - Check payment ID matches
   - Verify merchant address is your wallet

### Expected Console Output
```javascript
Invoice intent created with x402 Flex: {
  intentInvoiceId: "inv_1234567890_xyz",
  paymentLink: "https://pay.testnet.bnbpay.io/invoice/...",
  x402FlexHeaders: {
    "X-402-Protocol": "flex/1.0",
    "X-402-Amount": "6.00",
    "X-402-Currency": "USD1",
    "X-402-Chain": "bnb-chain:97",
    // ...
  }
}

Creating on-chain invoice: {
  registry: "0x7C86190b9bE40E4a5B1078B1831a3F2441E57c45",
  token: "0x0000000000000000000000000000000000000000",
  merchant: "0x...",
  amount: "6000000000000000000",
  resourceId: "bnbpay:invoice:inv_..."
}

Invoice transaction sent: 0x...
Invoice transaction confirmed: {...}

On-chain invoice created: {
  invoiceId: "inv_abc_1234567890",
  txHash: "0x...",
  paymentId: "0x..."
}
```

## Error Handling

### Common Errors

1. **MetaMask Not Installed**
   ```
   Error: MetaMask is not installed.
   Solution: Install MetaMask extension
   ```

2. **Wrong Network**
   ```
   Error: Failed to switch to BNB Chain Testnet
   Solution: Manually add network in MetaMask
   ```

3. **Insufficient Balance**
   ```
   Error: Insufficient funds for gas
   Solution: Get testnet BNB from faucet
   ```

4. **Token Not Approved**
   ```
   System automatically requests approval
   Action: Approve in MetaMask popup
   ```

5. **Transaction Failed**
   ```
   Check: Gas limit, token balance, contract state
   Retry: Create new invoice
   ```

## Contract Verification

### Verify on BscScan Testnet

1. Go to transaction hash on testnet.bscscan.com
2. Check "Logs" tab for:
   - `PaymentInitiated` event from Router
   - `PaymentSettledV2` event from Registry
3. Verify:
   - `paymentId` matches
   - `merchant` is correct address
   - `amount` matches (in wei)
   - `token` address is correct
   - `resourceId` is set

### Event Indexing

The `PaymentSettledV2` event can be indexed for:
- Real-time payment monitoring
- Webhook triggers
- Payment history
- Analytics dashboard
- Accounting systems

## Advanced Features

### Custom Reference Data
```typescript
const referenceData = JSON.stringify({
  customerName: "John Doe",
  customerEmail: "john@example.com",
  description: "Invoice #1234",
  invoiceId: "inv_1234",
  orderId: "order_5678", // Custom field
  metadata: {
    source: "web-app",
    version: "1.0"
  }
});
```

### Resource ID Format
```typescript
// Standard format
resourceId = `bnbpay:invoice:${invoiceId}`

// Custom format
resourceId = `myapp:payment:${customId}`

// Multi-tenant
resourceId = `${tenantId}:invoice:${invoiceId}`
```

### Payment Verification
```typescript
// Check if payment is settled
const isSettled = await paymentRegistry.settledPaymentId(paymentId);

// Get payment details from events
const events = await paymentRegistry.queryFilter(
  paymentRegistry.filters.PaymentSettledV2(paymentId)
);
```

## Security Considerations

1. **Always verify chain ID** before transactions
2. **Check token addresses** match official tokens
3. **Validate amounts** before conversion to wei
4. **Never expose private keys** in frontend
5. **Use read-only providers** for queries
6. **Implement rate limiting** on invoice creation
7. **Validate merchant addresses** before display
8. **Store sensitive data** off-chain securely

## Next Steps

1. **Mainnet Deployment**
   - Deploy contracts to mainnet
   - Update contract addresses in config
   - Test with real BNB/USDT/BUSD
   - Enable mainnet toggle

2. **Payment Status Tracking**
   - Listen for PaymentSettledV2 events
   - Update invoice status in database
   - Send confirmation emails
   - Trigger webhooks

3. **Invoice Management**
   - List all invoices
   - Filter by status/date
   - Export to CSV/PDF
   - Analytics dashboard

4. **Integration**
   - REST API for invoice creation
   - Webhook endpoints
   - WordPress plugin
   - E-commerce connectors
