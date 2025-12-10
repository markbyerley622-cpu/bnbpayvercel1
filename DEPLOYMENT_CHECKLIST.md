# BNBPay Payments UI - Deployment Checklist

## Pre-Deployment Checklist

### 1. Environment Configuration

#### Testnet to Mainnet Migration
- [ ] Set `VITE_NETWORK_MODE=mainnet` in `.env.production`
- [ ] Set `VITE_MAINNET_ENABLED=true` in `.env.production`
- [ ] Verify all mainnet contract addresses are set:
  - [ ] `VITE_MAINNET_PAYMENT_REGISTRY`
  - [ ] `VITE_MAINNET_BNBPAY_ROUTER`
  - [ ] `VITE_MAINNET_SUBSCRIPTION_MANAGER`
  - [ ] `VITE_MAINNET_SESSION_STORE`
- [ ] Verify mainnet token addresses:
  - [ ] `VITE_MAINNET_TOKEN_USDT=0x55d398326f99059fF775485246999027B3197955`
  - [ ] `VITE_MAINNET_TOKEN_USDC=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d`
  - [ ] `VITE_MAINNET_TOKEN_USD1` (set when deployed)
  - [ ] `VITE_MAINNET_TOKEN_WUSD` (set when deployed)
  - [ ] `VITE_MAINNET_TOKEN_XUSD` (set when deployed)
- [ ] Update API URLs if different for mainnet:
  - [ ] `VITE_API_URL_MAINNET`
  - [ ] `VITE_WS_URL_MAINNET`

#### Feature Flags
- [ ] Review and set feature flags:
  - [ ] `VITE_FEATURE_GASLESS` - Enable/disable gasless payments
  - [ ] `VITE_FEATURE_MULTI_TOKEN` - Enable/disable multi-token settlement
  - [ ] `VITE_FEATURE_SSE` - Enable/disable SSE realtime updates
  - [ ] `VITE_DEBUG_MODE=false` - MUST be false for production

### 2. Security Review

#### Code Security
- [ ] No `console.log` statements in production code (except error logging)
- [ ] No hardcoded private keys or secrets
- [ ] No exposed API keys in frontend code
- [ ] All user inputs are validated
- [ ] XSS prevention in place (React escaping)
- [ ] No `dangerouslySetInnerHTML` with user content

#### API Security
- [ ] All API calls use HTTPS
- [ ] Idempotency keys used for all mutations
- [ ] Error responses don't expose internal details
- [ ] Rate limiting awareness in retry logic

#### Wallet Security
- [ ] Signature verification on all transactions
- [ ] Proper EIP-712 typed data signing
- [ ] Transaction amount validation before signing
- [ ] Network validation before transactions

### 3. Contract Integration

#### Contract Verification
- [ ] PaymentRegistry contract verified on BscScan
- [ ] BNBPayRouter contract verified on BscScan
- [ ] SubscriptionManager contract verified on BscScan
- [ ] SessionStore contract verified on BscScan

#### Contract Read Operations (Safe to test on mainnet)
- [ ] Test `getInvoice()` reads
- [ ] Test `getSubscription()` reads
- [ ] Test token balance checks
- [ ] Test allowance checks

#### Contract Write Operations (Test on testnet first)
- [ ] Invoice creation flow
- [ ] Subscription plan creation
- [ ] Payment submission
- [ ] Payment verification

### 4. Testing

#### Unit Tests
```bash
npm run test
```
- [ ] All unit tests pass
- [ ] Coverage meets thresholds (80% statements, 75% branches)

#### Integration Tests
- [ ] Invoice creation → payment → verification flow
- [ ] Subscription creation → subscribe → renewal flow
- [ ] Multi-token payment selection and swap

#### E2E Tests (Manual)
- [ ] Create invoice with BNB
- [ ] Create invoice with USDT
- [ ] Create invoice with multi-token selection
- [ ] Create subscription (monthly)
- [ ] Create subscription (yearly)
- [ ] Payment link generation and QR code
- [ ] History page displays correctly
- [ ] Mobile responsiveness check

#### Browser Testing
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Mobile Safari (iOS 14+)
- [ ] Mobile Chrome (Android 10+)

### 5. Build Verification

```bash
# Clean build
rm -rf dist node_modules
npm install
npm run build
```

- [ ] Build completes without errors
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] Bundle size is reasonable (<500KB gzipped)

### 6. Infrastructure

#### Hosting
- [ ] CDN configured (Cloudflare, Vercel, etc.)
- [ ] SSL certificate valid
- [ ] Custom domain configured
- [ ] CORS headers set correctly

#### Monitoring
- [ ] Error tracking configured (Sentry, DataDog)
- [ ] Performance monitoring enabled
- [ ] Uptime monitoring configured
- [ ] Alert thresholds set

### 7. Documentation

- [ ] README updated with production setup
- [ ] API documentation current
- [ ] Environment variables documented
- [ ] Deployment process documented

---

## Deployment Steps

### 1. Pre-deployment
```bash
# Pull latest code
git pull origin main

# Install dependencies
npm ci

# Run all tests
npm run test

# Build for production
npm run build
```

### 2. Environment Setup
```bash
# Copy production env
cp .env.example .env.production

# Edit production environment
# - Set VITE_NETWORK_MODE=mainnet
# - Set VITE_MAINNET_ENABLED=true
# - Set all contract addresses
# - Disable debug mode
```

### 3. Deploy
```bash
# Preview build locally
npm run preview

# Deploy to hosting provider
# (Vercel, Netlify, AWS, etc.)
```

### 4. Post-deployment Verification
- [ ] Site loads correctly
- [ ] Wallet connection works
- [ ] Network detection is correct (mainnet)
- [ ] Invoice creation flow works
- [ ] Payment flow works
- [ ] QR codes generate correctly
- [ ] Copy buttons work
- [ ] No console errors

---

## Rollback Procedure

If issues are discovered:

1. **Immediate**: Revert to previous deployment
   ```bash
   # On Vercel
   vercel rollback

   # On Netlify
   netlify deploy --prod --alias previous
   ```

2. **Investigate**: Check error logs and monitoring

3. **Fix**: Create hotfix branch, test, deploy

---

## Mainnet Launch Checklist

### T-7 Days
- [ ] Complete testnet testing
- [ ] Security audit complete
- [ ] Contract deployment finalized
- [ ] Documentation complete

### T-3 Days
- [ ] Staging deployment with mainnet config
- [ ] Full regression testing
- [ ] Performance benchmarks
- [ ] Load testing complete

### T-1 Day
- [ ] Final code review
- [ ] Monitoring alerts configured
- [ ] Support team briefed
- [ ] Rollback plan reviewed

### Launch Day
- [ ] Deploy during low-traffic window
- [ ] Monitor for 2 hours post-deploy
- [ ] Verify all critical flows
- [ ] Announce launch

### T+1 Day
- [ ] Review error logs
- [ ] Check performance metrics
- [ ] Address any issues
- [ ] Post-mortem if needed

---

## Emergency Contacts

- **DevOps Lead**: [Contact]
- **Backend Lead**: [Contact]
- **Smart Contract Lead**: [Contact]
- **Product Owner**: [Contact]

---

## Environment Variables Reference

```env
# Network Configuration
VITE_NETWORK_MODE=mainnet
VITE_MAINNET_ENABLED=true

# Mainnet Contract Addresses
VITE_MAINNET_PAYMENT_REGISTRY=0x...
VITE_MAINNET_BNBPAY_ROUTER=0x...
VITE_MAINNET_SUBSCRIPTION_MANAGER=0x...
VITE_MAINNET_SESSION_STORE=0x...

# Mainnet Token Addresses
VITE_MAINNET_TOKEN_USDT=0x55d398326f99059fF775485246999027B3197955
VITE_MAINNET_TOKEN_USDC=0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d
VITE_MAINNET_TOKEN_USD1=0x...
VITE_MAINNET_TOKEN_WUSD=0x...
VITE_MAINNET_TOKEN_XUSD=0x...

# API Configuration
VITE_API_URL_MAINNET=https://api.bnbpay.org
VITE_WS_URL_MAINNET=wss://api.bnbpay.org
VITE_API_TIMEOUT=30000
VITE_API_RETRY_ATTEMPTS=3

# Feature Flags
VITE_FEATURE_GASLESS=true
VITE_FEATURE_MULTI_TOKEN=true
VITE_FEATURE_SSE=true
VITE_DEBUG_MODE=false
```
