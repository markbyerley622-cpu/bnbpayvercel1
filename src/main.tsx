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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <ErrorBoundary
        fallback={
          <PageErrorFallback
            onRetry={() => window.location.reload()}
            onGoHome={() => window.location.href = '/'}
          />
        }
      >
        <App />
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>,
)
