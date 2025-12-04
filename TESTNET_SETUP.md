# 🚀 USD1 Payments UI - Testnet Setup

The UI is now configured with the deployed BNBPay contracts on BNB Testnet!

## ✅ Configuration Complete

The `.env` file has been created with:

- **PaymentRegistry:** `0xddF1b20690E09C1CBFA9c1748f0590643d706B96`
- **BNBPayRouter:** `0xd63D036aEAf02985800d8D4e4B29024d7B35af94`
- **Network:** BNB Testnet (Chain ID 97)
- **Supported Tokens:** BNB, USDT, BUSD

## 🏃 Run the UI

```bash
cd apps/usd1-payments-ui
npm install
npm run dev
```

The app will start at **http://localhost:3000**

## 🧪 Testing on Testnet

### 1. Connect MetaMask to BNB Testnet

**Network Details:**
- Network Name: BNB Smart Chain Testnet
- RPC URL: https://data-seed-prebsc-1-s1.binance.org:8545
- Chain ID: 97
- Currency Symbol: BNB
- Block Explorer: https://testnet.bscscan.com

### 2. Get Testnet BNB

Visit: https://testnet.bnbchain.org/faucet-smart
Request testnet BNB for gas fees

### 3. Get Testnet USDT/BUSD (Optional)

For testing with stablecoins, you can:
- Use a testnet faucet
- Swap testnet BNB for testnet tokens on PancakeSwap Testnet

### 4. Create Your First Invoice

1. Open http://localhost:3000
2. Click "Generate Invoice" card
3. Fill in:
   - Customer Name
   - Customer Email
   - Description
   - Amount (e.g., 0.01)
   - Select token (BNB, USDT, or BUSD)
4. Click "Create Invoice"
5. You'll see:
   - Payment QR code
   - Payment link
   - JSON payload for MCP/agent integration

### 5. Create a Subscription

1. Click "Create Subscription" card
2. Fill in:
   - Plan Name
   - Price (e.g., 0.01)
   - Billing Interval (monthly/yearly)
   - Select token
3. Click "Create Subscription"
4. Review the subscription details in the modal

## 🔍 Verify Transactions on BscScan

After creating an invoice or subscription:

1. Visit https://testnet.bscscan.com
2. Search for the contract addresses:
   - PaymentRegistry: `0xddF1b20690E09C1CBFA9c1748f0590643d706B96`
   - BNBPayRouter: `0xd63D036aEAf02985800d8D4e4B29024d7B35af94`
3. Check the "Events" tab for payment events

## 🎨 UI Features

- ⚡ Lightning-fast black & yellow BNB theme
- 🌊 Animated floating particles background
- 💰 Multi-token support (BNB, USDT, BUSD)
- 📄 Invoice creation with QR codes
- 🔄 Subscription management
- 🤖 Agent/MCP integration panel
- 📱 Responsive design

## 🔗 Contract Addresses

| Contract | Address | Explorer |
|----------|---------|----------|
| PaymentRegistry | `0xddF1b20690E09C1CBFA9c1748f0590643d706B96` | [View](https://testnet.bscscan.com/address/0xddF1b20690E09C1CBFA9c1748f0590643d706B96) |
| BNBPayRouter | `0xd63D036aEAf02985800d8D4e4B29024d7B35af94` | [View](https://testnet.bscscan.com/address/0xd63D036aEAf02985800d8D4e4B29024d7B35af94) |

## 🛠️ Development

### Environment Variables

All configuration is in `.env`:
- Network settings
- Contract addresses
- Token addresses
- Explorer URLs

### Hot Reload

The app uses Vite with hot module replacement. Changes to code will auto-reload.

### TypeScript

Full TypeScript support with strict mode enabled.

## 🐛 Troubleshooting

### Port 3000 already in use?

```bash
npx kill-port 3000
# OR
npm run dev -- --port 3001
```

### MetaMask not connecting?

1. Make sure you're on BNB Testnet (Chain ID 97)
2. Check the RPC URL is correct
3. Try adding the network manually in MetaMask

### Transactions failing?

1. Ensure you have enough testnet BNB for gas
2. Check the token allowances
3. Verify you're on the correct network

## 📝 Next Steps

1. ✅ Test invoice creation
2. ✅ Test subscription creation
3. ✅ Verify events on BscScan
4. 🔜 Set up Safe multisig (2-of-3)
5. 🔜 Deploy SubscriptionManager contract
6. 🔜 Prepare for mainnet deployment

## 🎯 Production Deployment

When ready for mainnet:

1. Update `.env` with mainnet contract addresses
2. Change `VITE_CHAIN_ID` to `56`
3. Update RPC URL to mainnet
4. Build for production: `npm run build`
5. Deploy the `dist/` folder to your hosting

---

**Everything is ready to test! 🎉**

Run `npm run dev` and start creating invoices and subscriptions on BNB Testnet!
