# 🚀 USD1 Payments UI - Quick Start

## ⚡ Black & Yellow Theme - Exact Match to bnbpaylander

This is the complete USD1 Payments UI with the **exact design** from your bnbpaylander checkout-demo:
- ✅ Black background (#0B0E11)
- ✅ Yellow accents (#F0B90B)
- ✅ Floating yellow particles animation
- ✅ Lightning bolt icon
- ✅ USD1 branding
- ✅ "Generate Invoice" & "Create Subscription" buttons
- ✅ Powered by PePay Labs footer

---

## 📋 Step 1: Copy Logo Files

**IMPORTANT:** You need to copy these image files from `bnbpaylander` to the `public` folder:

```bash
# Navigate to the bnbpaylander directory
cd C:\Users\markb\Desktop\bnbpaylander

# Copy all logos to the USD1 Payments UI public folder
copy 10.png C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui\public\
copy 2.png C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui\public\
copy 6.png C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui\public\
copy USD1.png C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui\public\
copy pepaylabs.png C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui\public\
```

**Required Files:**
- `10.png` - BNBPay main logo
- `2.png` - BNBPay icon
- `6.png` - Coin icon
- `USD1.png` - USD1 logo
- `pepaylabs.png` - PePay Labs logo

---

## 🏃 Step 2: Install & Run

```bash
# Navigate to the USD1 Payments UI folder
cd C:\Users\markb\Desktop\bnb-pay\apps\usd1-payments-ui

# Install dependencies (use pnpm or npm)
pnpm install
# OR
npm install

# Start development server
pnpm run dev
# OR
npm run dev
```

---

## 🌐 Step 3: Open in Browser

The app will start at **http://localhost:3000**

You'll see:
- ⚡ **Animated yellow particles** floating in the background
- ⚡ **Lightning bolt icon** at the top
- 💰 **USD1 logo** with glowing effect
- 📄 **Generate Invoice** card (left)
- 🔄 **Create Subscription** card (right)
- 🎚️ **Mode toggle** - Basic / Agent
- 🏢 **Powered by PePay Labs** footer

---

## ✨ Features

### Invoice Creation
- Customer name & email
- Description
- USD1 amount
- Optional due date
- **Multi-token acceptance** with auto-settlement to USD1

### Subscription Creation
- Plan name
- USD1 price
- Billing interval (monthly/yearly)
- Optional customer email
- **Recurring payments** with retries & dunning

### Agent Mode
- JSON payload view
- MCP method examples
- Multi-token settlement simulation
- Automation examples

---

## 🎨 Design System

All colors, animations, and styles match **checkout-demo.html** exactly:

**Colors:**
- BNB Dark: `#0B0E11` (background)
- BNB Yellow: `#F0B90B` (accents)
- BNB Gray: `#1E2329` (cards)

**Animations:**
- Floating particles (20 particles)
- Glow effects on buttons
- Lightning bolt pulse
- Smooth fade-in transitions

**Typography:**
- Font: Inter (from Google Fonts)
- Clean, modern, professional

---

## 📂 Project Structure

```
apps/usd1-payments-ui/
├── public/
│   ├── 10.png              ← Copy from bnbpaylander
│   ├── 2.png               ← Copy from bnbpaylander
│   ├── 6.png               ← Copy from bnbpaylander
│   ├── USD1.png            ← Copy from bnbpaylander
│   └── pepaylabs.png       ← Copy from bnbpaylander
├── src/
│   ├── components/
│   │   ├── InvoiceCreator.tsx
│   │   ├── SubscriptionCreator.tsx
│   │   ├── InvoiceModal.tsx
│   │   ├── SubscriptionModal.tsx
│   │   └── AgentFlowPanel.tsx
│   ├── lib/
│   │   ├── types.ts
│   │   └── contract-stubs.ts
│   ├── App.tsx             ← Main app with dark theme
│   ├── index.css           ← Animations & styles
│   └── main.tsx
├── index.html
├── package.json
├── tailwind.config.js      ← BNB colors
└── QUICKSTART.md           ← This file
```

---

## 🐛 Troubleshooting

### Images Not Showing?
Make sure you copied all 5 PNG files to the `/public` folder.

### Particles Not Animating?
Clear your browser cache and refresh. The particles are created on component mount.

### Port 3000 Already in Use?
```bash
# Kill the process
npx kill-port 3000

# OR use a different port
npm run dev -- --port 3001
```

### TypeScript Errors?
```bash
# Reinstall dependencies
rm -rf node_modules
rm package-lock.json
npm install
```

---

## 🎯 Next Steps

1. ✅ Copy the logo files (see Step 1)
2. ✅ Run `npm install && npm run dev`
3. ✅ Open http://localhost:3000
4. ✅ Create an invoice or subscription
5. ✅ Toggle between Basic and Agent modes
6. ✅ Enjoy the smooth animations!

---

## 📝 Notes

- **Stub functions**: All blockchain operations are stubs for now
- **Dark theme**: Matches checkout-demo exactly
- **Responsive**: Works on desktop, tablet, and mobile
- **Production-ready**: Just add real contract integration

---

**🎉 Enjoy your USD1-first payments UI!**

Powered by **PePay Labs** • **BNBPay** • **x402 Flex**
