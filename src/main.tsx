import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Import debug utilities (available in browser console)
import './lib/debug-payment.ts'

// Import error boundary for production-ready error handling
import { ErrorBoundary, PageErrorFallback } from './components/ErrorBoundary.tsx'

// Import Toast context provider for global notifications
import { ToastProvider } from './contexts/ToastContext.tsx'

// Import Wallet Provider with Wagmi + React Query
import { WalletProvider } from './components/WalletConnection'

// Import TokenImage preloader for better UX
import { TokenImagePreloader } from './components/TokenImage.tsx'

// Import token preload function
import { preloadTokenImages } from './lib/price-utils.ts'

// Preload token images early
preloadTokenImages('testnet')
preloadTokenImages('mainnet')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <WalletProvider>
        <ErrorBoundary
          fallback={
            <PageErrorFallback
              onRetry={() => window.location.reload()}
              onGoHome={() => window.location.href = '/'}
            />
          }
        >
          <TokenImagePreloader />
          <App />
        </ErrorBoundary>
      </WalletProvider>
    </ToastProvider>
  </React.StrictMode>,
)
