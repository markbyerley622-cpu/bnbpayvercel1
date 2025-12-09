/**
 * Production Error UI Components
 *
 * Bounded, overflow-safe error display components.
 * NEVER shows internal details, stack traces, or raw error data.
 */

import { useState, useEffect, useCallback } from 'react';
import { ErrorCode, getSafeMessage } from '../lib/error-codes';

// ============================================================================
// Toast Notification
// ============================================================================

export interface ToastProps {
  message: string;
  type?: 'error' | 'warning' | 'success' | 'info';
  duration?: number;
  onClose?: () => void;
  visible: boolean;
  referenceId?: string;
}

export function Toast({
  message,
  type = 'error',
  duration = 5000,
  onClose,
  visible,
  referenceId,
}: ToastProps) {
  useEffect(() => {
    if (visible && duration > 0 && onClose) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [visible, duration, onClose]);

  if (!visible) return null;

  const bgColors = {
    error: 'bg-red-50 border-red-200',
    warning: 'bg-yellow-50 border-yellow-200',
    success: 'bg-green-50 border-green-200',
    info: 'bg-blue-50 border-blue-200',
  };

  const textColors = {
    error: 'text-red-800',
    warning: 'text-yellow-800',
    success: 'text-green-800',
    info: 'text-blue-800',
  };

  const icons = {
    error: (
      <svg className="w-5 h-5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
    ),
    warning: (
      <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
          clipRule="evenodd"
        />
      </svg>
    ),
    success: (
      <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
          clipRule="evenodd"
        />
      </svg>
    ),
    info: (
      <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
          clipRule="evenodd"
        />
      </svg>
    ),
  };

  return (
    <div
      className={`fixed top-4 right-4 z-50 max-w-sm w-full transform transition-all duration-300 ease-out ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
      role="alert"
      aria-live="assertive"
    >
      <div
        className={`${bgColors[type]} border rounded-lg shadow-lg p-4 flex items-start gap-3`}
      >
        <div className="flex-shrink-0">{icons[type]}</div>
        <div className="flex-1 min-w-0">
          <p
            className={`${textColors[type]} text-sm font-medium break-words overflow-hidden`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              maxHeight: '4.5em',
            }}
          >
            {message}
          </p>
          {referenceId && (
            <p className="text-xs text-gray-500 mt-1 truncate">
              Ref: {referenceId}
            </p>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Inline Error Display
// ============================================================================

export interface InlineErrorProps {
  message?: string;
  errorCode?: ErrorCode;
  className?: string;
  showIcon?: boolean;
}

export function InlineError({
  message,
  errorCode,
  className = '',
  showIcon = true,
}: InlineErrorProps) {
  const displayMessage = message || (errorCode ? getSafeMessage(errorCode) : '');

  if (!displayMessage) return null;

  return (
    <div
      className={`flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg ${className}`}
      role="alert"
    >
      {showIcon && (
        <svg
          className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <p
        className="text-sm text-red-700 break-words overflow-hidden"
        style={{
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          maxHeight: '3em',
        }}
      >
        {displayMessage}
      </p>
    </div>
  );
}

// ============================================================================
// Alert Banner
// ============================================================================

export interface AlertBannerProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  onDismiss?: () => void;
  showRetry?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  referenceId?: string;
}

export function AlertBanner({
  message,
  type = 'error',
  onDismiss,
  showRetry = false,
  onRetry,
  retrying = false,
  referenceId,
}: AlertBannerProps) {
  const bgColors = {
    error: 'bg-red-50 border-red-300',
    warning: 'bg-yellow-50 border-yellow-300',
    info: 'bg-blue-50 border-blue-300',
  };

  const textColors = {
    error: 'text-red-800',
    warning: 'text-yellow-800',
    info: 'text-blue-800',
  };

  const buttonColors = {
    error: 'bg-red-100 hover:bg-red-200 text-red-800',
    warning: 'bg-yellow-100 hover:bg-yellow-200 text-yellow-800',
    info: 'bg-blue-100 hover:bg-blue-200 text-blue-800',
  };

  return (
    <div
      className={`${bgColors[type]} border rounded-lg p-4 max-w-full overflow-hidden`}
      role="alert"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p
            className={`${textColors[type]} text-sm font-medium break-words`}
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 3,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {message}
          </p>
          {referenceId && (
            <p className="text-xs text-gray-500 mt-1">
              Reference: {referenceId}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 p-1"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        )}
      </div>
      {showRetry && onRetry && (
        <div className="mt-3">
          <button
            onClick={onRetry}
            disabled={retrying}
            className={`${buttonColors[type]} px-3 py-1.5 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {retrying ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Retrying...
              </span>
            ) : (
              'Try Again'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Error Modal
// ============================================================================

export interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  errorCode?: ErrorCode;
  showRetry?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  referenceId?: string;
}

export function ErrorModal({
  isOpen,
  onClose,
  title = 'Error',
  message,
  errorCode,
  showRetry = false,
  onRetry,
  retrying = false,
  referenceId,
}: ErrorModalProps) {
  if (!isOpen) return null;

  const displayMessage = message || (errorCode ? getSafeMessage(errorCode) : 'Something went wrong.');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="error-modal-title"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-red-50 px-6 py-4 border-b border-red-100">
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
              <svg
                className="w-5 h-5 text-red-600"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <h2
              id="error-modal-title"
              className="text-lg font-semibold text-gray-900"
            >
              {title}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <p
            className="text-gray-600 break-words"
            style={{
              display: '-webkit-box',
              WebkitLineClamp: 5,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {displayMessage}
          </p>
          {referenceId && (
            <p className="text-xs text-gray-400 mt-3">
              Reference ID: {referenceId}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          {showRetry && onRetry && (
            <button
              onClick={onRetry}
              disabled={retrying}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {retrying ? 'Retrying...' : 'Try Again'}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Form Field Error
// ============================================================================

export interface FieldErrorProps {
  error?: string;
  touched?: boolean;
}

export function FieldError({ error, touched }: FieldErrorProps) {
  if (!error || !touched) return null;

  return (
    <p
      className="mt-1 text-xs text-red-600 truncate max-w-full"
      role="alert"
    >
      {error}
    </p>
  );
}

// ============================================================================
// Toast Container Hook
// ============================================================================

export interface ToastItem {
  id: string;
  message: string;
  type: 'error' | 'warning' | 'success' | 'info';
  referenceId?: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback(
    (
      message: string,
      type: ToastItem['type'] = 'error',
      referenceId?: string
    ) => {
      const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type, referenceId }]);
      return id;
    },
    []
  );

  const hideToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showError = useCallback(
    (message: string, referenceId?: string) => showToast(message, 'error', referenceId),
    [showToast]
  );

  const showWarning = useCallback(
    (message: string, referenceId?: string) => showToast(message, 'warning', referenceId),
    [showToast]
  );

  const showSuccess = useCallback(
    (message: string) => showToast(message, 'success'),
    [showToast]
  );

  const showInfo = useCallback(
    (message: string) => showToast(message, 'info'),
    [showToast]
  );

  const clearAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showToast,
    hideToast,
    showError,
    showWarning,
    showSuccess,
    showInfo,
    clearAll,
  };
}

// ============================================================================
// Toast Container Component
// ============================================================================

export interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <Toast
            message={toast.message}
            type={toast.type}
            visible={true}
            onClose={() => onDismiss(toast.id)}
            referenceId={toast.referenceId}
          />
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Payment Error Display
// ============================================================================

export interface PaymentErrorDisplayProps {
  errorCode?: ErrorCode;
  message?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  retrying?: boolean;
  referenceId?: string;
}

export function PaymentErrorDisplay({
  errorCode,
  message,
  showRetry = true,
  onRetry,
  retrying = false,
  referenceId,
}: PaymentErrorDisplayProps) {
  const displayMessage =
    message ||
    (errorCode ? getSafeMessage(errorCode) : 'There was an issue processing your payment. Please try again.');

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-200 overflow-hidden max-w-md mx-auto">
      {/* Error Icon */}
      <div className="bg-red-50 px-6 py-8 flex flex-col items-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-red-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 text-center">
          Payment Failed
        </h3>
      </div>

      {/* Message */}
      <div className="px-6 py-4">
        <p
          className="text-gray-600 text-center break-words"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {displayMessage}
        </p>
        {referenceId && (
          <p className="text-xs text-gray-400 text-center mt-2">
            Ref: {referenceId}
          </p>
        )}
      </div>

      {/* Actions */}
      {showRetry && onRetry && (
        <div className="px-6 pb-6">
          <button
            onClick={onRetry}
            disabled={retrying}
            className="w-full py-3 bg-bnb-yellow text-gray-900 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {retrying ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Processing...
              </>
            ) : (
              'Try Again'
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default {
  Toast,
  InlineError,
  AlertBanner,
  ErrorModal,
  FieldError,
  ToastContainer,
  PaymentErrorDisplay,
  useToast,
};
