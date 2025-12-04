# BNBPay Testnet Deployment Guide 🚀

## What Was Fixed

### ✅ 1. JSON Payload Moved to Agent Mode
**Before**: JSON payload was cluttering the invoice modal
**After**:
- Removed from InvoiceModal ✅
- Removed from SubscriptionModal ✅
- Now shows hint: "💡 View JSON payload and MCP examples in Agent Mode"
- Agent/MCP Panel now receives data automatically ✅

### ✅ 2. Data Flow Connected
- `InvoiceCreator` → notifies `App` → updates `AgentFlowPanel` ✅
- `SubscriptionCreator` → notifies `App` → updates `AgentFlowPanel` ✅
- Switch to **Agent Mode** to see JSON, MCP calls, and settlement info ✅

---

## How to Use Agent Mode

### Step 1: Create Invoice/Subscription
1. Fill out the form (Invoice or Subscription)
2. Click "Create Invoice" or "Create Subscription"
3. Modal appears showing the created item

### Step 2: Switch to Agent Mode
1. Close the modal
2. Click **"Agent Mode"** toggle (top of page)
3. The Agent/MCP Panel will now show:
   - **JSON Payload** tab: Full JSON data
   - **MCP Calls** tab: Example automation calls
   - **Settlement** tab: Multi-token swap info

### What You'll See in Agent Mode:

```
┌─────────────────────────────────────┐
│ Agent / MCP Panel                   │
├─────────────────────────────────────┤
│ [JSON Payload] [MCP Calls] [Settlement] │
├─────────────────────────────────────┤
│                                     │
│ {                                   │
│   "type": "invoice",                │
│   "amount": "24.00",                │
│   "paymentToken": "BNB",            │
│   "paymentAmount": "0.04",          │
│   "acceptedTokens": [...]           │
│ }                                   │
│                                     │
└─────────────────────────────────────┘
```

---

## Current State: Using Stubs (Not Real Contracts)

**⚠️ IMPORTANT**: Right now, invoices and subscriptions are **NOT** being created on-chain!

### What's Happening Now:
```typescript
// File: src/lib/contract-stubs.ts

export const contractStubs = {
  createInvoiceOnChain: async (invoice: InvoiceData) => {
    // ❌ This is a MOCK - not real blockchain!
    return JSON.stringify({
      invoiceId: `inv_${Date.now()}_${randomString()}`,
      paymentLink: `https://pay.testnet/x402/usd1/invoice/...`,
      transactionHash: '0xmock...',
    });
  },

  createSubscriptionOnChain: async (subscription: SubscriptionData) => {
    // ❌ This is a MOCK - not real blockchain!
    return JSON.stringify({
      subscriptionId: `sub_${Date.now()}_${randomString()}`,
      paymentLink: `https://pay.testnet/x402/usd1/subscription/...`,
      transactionHash: '0xmock...',
    });
  },
};
```

**These are placeholder functions!** They return fake data for UI testing only.

---

## How to Deploy to Testnet and Use Real Contracts

### Phase 1: Deploy Contracts to BNB Testnet

#### 1. Set Up Testnet Wallet
```bash
# Get testnet BNB from faucet
https://testnet.bnbchain.org/faucet-smart

# Add BSC Testnet to MetaMask:
Network Name: BSC Testnet
RPC URL: https://data-seed-prebsc-1-s1.binance.org:8545
Chain ID: 97
Currency Symbol: tBNB
Block Explorer: https://testnet.bscscan.com
```

#### 2. Deploy PaymentRegistry Contract
```bash
cd contracts/payments

# Install dependencies
npm install

# Create .env file
echo "PRIVATE_KEY=your_private_key_here" > .env
echo "BSCSCAN_API_KEY=your_bscscan_key" >> .env

# Deploy to testnet
npx hardhat run scripts/deploy-registry.ts --network bscTestnet
```

**Expected Output:**
```
PaymentRegistry deployed to: 0x1234567890abcdef...
Fee Recipient: 0xYourAddress...
Default Fee: 0 bps
```

**Save this address!** You'll need it for the UI.

#### 3. Deploy BNBPayRouter Contract
```bash
# Deploy router (pass PaymentRegistry address)
npx hardhat run scripts/deploy-router.ts --network bscTestnet
```

**Expected Output:**
```
BNBPayRouter deployed to: 0xabcdef1234567890...
PaymentRegistry: 0x1234567890abcdef...
Permit2: 0x... (or address(0) if not using Permit2)
```

#### 4. Deploy SubscriptionManager Contract
```bash
cd ../subscriptions

# Deploy subscription manager
npx hardhat run scripts/deploy-subscriptions.ts --network bscTestnet
```

**Expected Output:**
```
SubscriptionManager deployed to: 0xfedcba0987654321...
```

#### 5. Grant Roles to Router
```bash
cd ../payments

# Grant COLLECTOR_ROLE to BNBPayRouter
npx hardhat run scripts/grant-roles.ts --network bscTestnet
```

**This allows the router to call `settleFromRouter()` on PaymentRegistry.**

---

### Phase 2: Update UI to Use Real Contracts

#### 1. Update SDK Constants
```typescript
// File: packages/sdk-ts/src/constants.ts

export const CONTRACTS = {
  [CHAINS.TESTNET]: {
    PaymentRegistry: '0x1234567890abcdef...',      // ← Your deployed address
    BNBPayRouter: '0xabcdef1234567890...',          // ← Your deployed address
    SubscriptionManager: '0xfedcba0987654321...',   // ← Your deployed address
    PriceOracle: '',  // Optional for Phase 2
  },
} as const;
```

#### 2. Replace Contract Stubs with Real SDK Calls

**Update `src/lib/contract-stubs.ts`**:

```typescript
import { ethers } from 'ethers';
import { CONTRACTS, CHAINS } from '@bnbpay/sdk';  // Import from SDK

// Connect to testnet
const provider = new ethers.JsonRpcProvider(
  'https://data-seed-prebsc-1-s1.binance.org:8545'
);

// Load contract ABIs
import PaymentRegistryABI from '../../../contracts/payments/artifacts/contracts/PaymentRegistry.sol/PaymentRegistry.json';
import SubscriptionManagerABI from '../../../contracts/subscriptions/artifacts/contracts/SubscriptionManager.sol/SubscriptionManager.json';

// Real implementation
export const contractStubs = {
  createInvoiceOnChain: async (invoice: InvoiceData) => {
    // ✅ Real on-chain transaction!

    // You need a signer (wallet) to create invoices
    // For now, this requires user's connected wallet
    const signer = await provider.getSigner();

    const registryAddress = CONTRACTS[CHAINS.TESTNET].PaymentRegistry;
    const registry = new ethers.Contract(
      registryAddress,
      PaymentRegistryABI.abi,
      signer
    );

    // Generate unique payment ID
    const paymentId = ethers.keccak256(
      ethers.toUtf8Bytes(invoice.invoiceId + invoice.customer.email)
    );

    // Create invoice on-chain (example - actual flow depends on your design)
    // Note: Invoices are typically registered when PAID, not when created
    // So this might just return metadata without a tx

    return JSON.stringify({
      invoiceId: invoice.invoiceId,
      paymentId,
      paymentLink: `https://pay.testnet/x402/usd1/invoice/${invoice.invoiceId}`,
      // If you want to pre-register: include tx hash
      // transactionHash: tx.hash,
    });
  },

  createSubscriptionOnChain: async (subscription: SubscriptionData) => {
    // ✅ Real on-chain transaction!

    const signer = await provider.getSigner();

    const subManagerAddress = CONTRACTS[CHAINS.TESTNET].SubscriptionManager;
    const subManager = new ethers.Contract(
      subManagerAddress,
      SubscriptionManagerABI.abi,
      signer
    );

    // Create plan on-chain
    const tokenAddress = subscription.paymentToken === 'BNB'
      ? '0x0000000000000000000000000000000000000000'
      : subscription.paymentToken === 'USDT'
      ? '0x337610d27c682E347C9cD60BD4b3b107C9d34dDd'
      : '0xeD24FC36d5Ee211Ea25A80239Fb8C4Cfd80f12Ee'; // BUSD

    const priceInWei = ethers.parseUnits(
      subscription.paymentAmount!,
      18
    );

    const intervalSeconds = subscription.interval === 'monthly'
      ? 30 * 24 * 60 * 60
      : 365 * 24 * 60 * 60;

    // Create plan transaction
    const tx = await subManager.createPlan(
      await signer.getAddress(), // collector (your address)
      tokenAddress,
      priceInWei,
      intervalSeconds,
      JSON.stringify({
        name: subscription.planName,
        description: 'Subscription plan',
      })
    );

    const receipt = await tx.wait();

    // Extract planId from event
    const planCreatedEvent = receipt.logs.find(
      (log: any) => log.fragment?.name === 'PlanCreated'
    );
    const planId = planCreatedEvent?.args?.planId;

    return JSON.stringify({
      subscriptionId: `sub_${planId}`,
      planId: planId.toString(),
      paymentLink: `https://pay.testnet/x402/usd1/subscription/${planId}`,
      transactionHash: receipt.hash,
    });
  },
};
```

---

### Phase 3: Wallet Connection (Required for Real Txs)

To create subscriptions on-chain, users need to connect their wallet:

#### 1. Add Wallet Connect Button

**Update App.tsx**:
```tsx
import { BrowserProvider } from 'ethers';

function App() {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  const connectWallet = async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask!');
      return;
    }

    const provider = new BrowserProvider(window.ethereum);
    const accounts = await provider.send('eth_requestAccounts', []);
    setWalletAddress(accounts[0]);

    // Switch to BSC Testnet
    try {
      await provider.send('wallet_switchEthereumChain', [{ chainId: '0x61' }]);
    } catch (error: any) {
      // Add BSC Testnet if not found
      if (error.code === 4902) {
        await provider.send('wallet_addEthereumChain', [{
          chainId: '0x61',
          chainName: 'BSC Testnet',
          rpcUrls: ['https://data-seed-prebsc-1-s1.binance.org:8545'],
          nativeCurrency: { name: 'tBNB', symbol: 'tBNB', decimals: 18 },
          blockExplorerUrls: ['https://testnet.bscscan.com'],
        }]);
      }
    }
  };

  return (
    <header>
      {!walletAddress ? (
        <button onClick={connectWallet}>
          Connect Wallet
        </button>
      ) : (
        <div>
          Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
        </div>
      )}
    </header>
  );
}
```

#### 2. Pass Wallet to Contract Stubs

```typescript
export const contractStubs = {
  createSubscriptionOnChain: async (
    subscription: SubscriptionData,
    signer?: ethers.Signer
  ) => {
    if (!signer) {
      throw new Error('Wallet not connected! Please connect MetaMask.');
    }

    // ... rest of implementation using signer
  },
};
```

---

## Deployment Checklist

### Contracts
- [ ] Deploy PaymentRegistry to testnet
- [ ] Deploy BNBPayRouter to testnet
- [ ] Deploy SubscriptionManager to testnet
- [ ] Grant COLLECTOR_ROLE to router
- [ ] Verify contracts on BSCScan
- [ ] Update token allowlist (BNB, USDT, BUSD)

### SDK
- [ ] Update contract addresses in `constants.ts`
- [ ] Build SDK: `cd packages/sdk-ts && npm run build`
- [ ] Test SDK functions with testnet

### UI
- [ ] Replace contract stubs with real implementations
- [ ] Add wallet connection (MetaMask)
- [ ] Test invoice creation → PaymentRegistry
- [ ] Test subscription creation → SubscriptionManager
- [ ] Verify transactions on BSCScan

---

## Testing the Integration

### 1. Create a Subscription Plan (On-Chain)
1. Connect wallet (MetaMask)
2. Fill subscription form:
   - Plan: "Test Plan"
   - Price: 0.01 BNB
   - Interval: Monthly
3. Click "Create Subscription"
4. **MetaMask popup appears** → Confirm transaction
5. Wait for confirmation (~3 seconds)
6. Check BSCScan: `https://testnet.bscscan.com/tx/0x...`

**Expected Result**:
- `PlanCreated` event emitted
- `planId` assigned (e.g., 0, 1, 2...)
- Visible on BSCScan

### 2. Pay an Invoice (On-Chain)
1. User receives invoice link
2. Opens link → shows invoice details
3. Clicks "Pay with BNB"
4. MetaMask popup → Approve + Pay
5. Router calls `settleFromRouter()` on PaymentRegistry
6. `PaymentSettledV2` event emitted

**Expected Result**:
- Payment recorded on-chain
- Event shows: paymentId, payer, merchant, amount, token
- Merchant receives funds (minus fee)

---

## Debugging

### Contract Not Deployed
```
Error: contract not deployed (contractAddress="0x0000...", operation="getCode")
```
**Fix**: Update `CONTRACTS` in `constants.ts` with real deployed addresses

### Transaction Failed
```
Error: execution reverted: "Token not supported"
```
**Fix**: Call `updateTokenAllowlist()` on PaymentRegistry to enable BNB/USDT/BUSD

### Wallet Not Connected
```
Error: Wallet not connected! Please connect MetaMask.
```
**Fix**: Click "Connect Wallet" button before creating subscriptions

---

## Summary

### Current State ✅
- JSON payload removed from modals
- Agent Mode shows all data
- Data flow: Creator → App → AgentFlowPanel working
- Using stubs for testing UI

### Next Steps ⏳
1. Deploy contracts to testnet
2. Update SDK constants
3. Replace stubs with real implementations
4. Add wallet connection
5. Test end-to-end flows

**Once deployed**, every invoice and subscription will be **real on-chain transactions** on BNB Testnet! 🎉
