import React from 'react';
import ReactDOM from 'react-dom/client';
import { HistoryPage } from './components/HistoryPage';
import { ErrorBoundary, PageErrorFallback } from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import { WalletProvider } from './components/WalletConnection';
import { preloadTokenImages } from './lib/price-utils';
import './index.css';

// Preload token images
preloadTokenImages('testnet');
preloadTokenImages('mainnet');

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
          <HistoryPage />
        </ErrorBoundary>
      </WalletProvider>
    </ToastProvider>
  </React.StrictMode>
);
