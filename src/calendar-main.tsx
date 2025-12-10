import React from 'react';
import ReactDOM from 'react-dom/client';
import { CalendarPage } from './components/CalendarPage';
import { ErrorBoundary, PageErrorFallback } from './components/ErrorBoundary';
import { ToastProvider } from './contexts/ToastContext';
import './index.css';

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
        <CalendarPage />
      </ErrorBoundary>
    </ToastProvider>
  </React.StrictMode>
);
