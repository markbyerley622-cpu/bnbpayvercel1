/**
 * React Error Boundary Component
 *
 * Catches unhandled errors in the React component tree and displays a
 * safe, user-friendly fallback UI. NEVER exposes internal error details.
 *
 * Usage:
 * <ErrorBoundary fallback={<CustomFallback />}>
 *   <YourComponent />
 * </ErrorBoundary>
 */

import React, { Component, ReactNode, ErrorInfo } from 'react';
import {
  ErrorCode,
  getSafeMessage,
  logInternalError,
  generateReferenceId,
} from '../lib/error-codes';

// ============================================================================
// Types
// ============================================================================

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI to render when an error occurs */
  fallback?: ReactNode;
  /** Called when an error is caught (for analytics/logging) */
  onError?: (error: Error, errorInfo: ErrorInfo, referenceId: string) => void;
  /** Whether to show retry button */
  showRetry?: boolean;
  /** Custom title for the error display */
  title?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  referenceId: string | null;
}

// ============================================================================
// Error Boundary Component
// ============================================================================

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      referenceId: null,
    };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    // Update state so the next render shows the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log the error internally - NEVER expose to UI
    const referenceId = logInternalError(
      ErrorCode.UNKNOWN_ERROR,
      error,
      {
        componentStack: errorInfo.componentStack,
        errorBoundary: true,
      }
    );

    this.setState({ referenceId });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo, referenceId);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, referenceId: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // If custom fallback is provided, use it
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <ErrorFallback
          referenceId={this.state.referenceId}
          onRetry={this.props.showRetry !== false ? this.handleRetry : undefined}
          title={this.props.title}
        />
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Default Fallback UI
// ============================================================================

interface ErrorFallbackProps {
  referenceId: string | null;
  onRetry?: () => void;
  title?: string;
}

function ErrorFallback({ referenceId, onRetry, title }: ErrorFallbackProps) {
  return (
    <div
      className="min-h-[200px] flex items-center justify-center p-6"
      role="alert"
      aria-live="assertive"
    >
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 px-6 py-4 border-b border-red-100">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-900">
              {title || 'Something went wrong'}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-600 text-sm">
            {getSafeMessage(ErrorCode.UNKNOWN_ERROR)}
          </p>
          <p className="text-gray-500 text-sm mt-2">
            We've been notified and are looking into it. Please try again.
          </p>
          {referenceId && (
            <p className="text-xs text-gray-400 mt-4">
              Reference: {referenceId}
            </p>
          )}
        </div>

        {/* Actions */}
        {onRetry && (
          <div className="px-6 pb-5">
            <button
              onClick={onRetry}
              className="w-full py-3 bg-bnb-yellow text-gray-900 rounded-xl font-bold hover:bg-yellow-500 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-center">
          <p className="text-xs text-gray-500">
            Powered by <span className="font-semibold text-bnb-yellow">BNBPay</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Page-Level Error Fallback (Full Screen)
// ============================================================================

interface PageErrorFallbackProps {
  referenceId?: string;
  onRetry?: () => void;
  onGoHome?: () => void;
}

export function PageErrorFallback({ referenceId, onRetry, onGoHome }: PageErrorFallbackProps) {
  const ref = referenceId || generateReferenceId();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full text-center">
        {/* Icon */}
        <div className="mx-auto w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
          <svg
            className="w-10 h-10 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-3">
          Something went wrong
        </h1>

        {/* Message */}
        <p className="text-gray-400 mb-6">
          An unexpected error occurred. We've been notified and are looking into it.
        </p>

        {/* Reference ID */}
        <p className="text-xs text-gray-500 mb-8">
          Reference: {ref}
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {onRetry && (
            <button
              onClick={onRetry}
              className="px-6 py-3 bg-bnb-yellow text-gray-900 rounded-xl font-bold hover:bg-yellow-500 transition-colors"
            >
              Try Again
            </button>
          )}
          {onGoHome && (
            <button
              onClick={onGoHome}
              className="px-6 py-3 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600 transition-colors"
            >
              Go to Home
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center">
          <p className="text-sm text-gray-500">
            Powered by{' '}
            <span className="text-bnb-yellow font-semibold">BNBPay</span>
            {' • '}
            <span className="text-gray-400">x402 Flex</span>
          </p>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Hook for Programmatic Error Handling
// ============================================================================

interface UseErrorBoundaryReturn {
  showBoundary: (error: Error) => void;
}

/**
 * Hook to programmatically trigger the nearest error boundary.
 * Useful for handling async errors in event handlers.
 *
 * @example
 * const { showBoundary } = useErrorBoundary();
 *
 * const handleClick = async () => {
 *   try {
 *     await riskyOperation();
 *   } catch (error) {
 *     showBoundary(error);
 *   }
 * };
 */
export function useErrorBoundary(): UseErrorBoundaryReturn {
  const [, setError] = React.useState<Error | null>(null);

  const showBoundary = React.useCallback((error: Error) => {
    setError(() => {
      throw error;
    });
  }, []);

  return { showBoundary };
}

// ============================================================================
// HOC for Wrapping Components with Error Boundary
// ============================================================================

/**
 * Higher-Order Component that wraps a component with an ErrorBoundary.
 *
 * @example
 * const SafeComponent = withErrorBoundary(RiskyComponent, {
 *   fallback: <CustomFallback />,
 * });
 */
export function withErrorBoundary<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>
): React.FC<P> {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const WithErrorBoundary: React.FC<P> = (props) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );

  WithErrorBoundary.displayName = `withErrorBoundary(${displayName})`;

  return WithErrorBoundary;
}

// ============================================================================
// Async Error Boundary (for Suspense-like patterns)
// ============================================================================

interface AsyncErrorBoundaryProps extends ErrorBoundaryProps {
  /** Loading component while async operation is pending */
  loading?: ReactNode;
}

/**
 * Error boundary with built-in loading state support.
 * Useful for components that load data asynchronously.
 */
export class AsyncErrorBoundary extends Component<
  AsyncErrorBoundaryProps,
  ErrorBoundaryState & { isLoading: boolean }
> {
  constructor(props: AsyncErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      referenceId: null,
      isLoading: false,
    };
  }

  static getDerivedStateFromError(): Partial<ErrorBoundaryState> {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    const referenceId = logInternalError(
      ErrorCode.UNKNOWN_ERROR,
      error,
      {
        componentStack: errorInfo.componentStack,
        asyncErrorBoundary: true,
      }
    );

    this.setState({ referenceId });
    this.props.onError?.(error, errorInfo, referenceId);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, referenceId: null, isLoading: true });
    // Small delay to allow UI to update
    setTimeout(() => {
      this.setState({ isLoading: false });
    }, 100);
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <ErrorFallback
          referenceId={this.state.referenceId}
          onRetry={this.props.showRetry !== false ? this.handleRetry : undefined}
          title={this.props.title}
        />
      );
    }

    if (this.state.isLoading && this.props.loading) {
      return this.props.loading;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
