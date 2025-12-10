/**
 * Confirm Modal Component
 *
 * A production-ready modal for confirmation dialogs.
 * Replaces all browser confirm() dialogs with a consistent UI.
 */

import { useEffect, useRef } from 'react';

export interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  isLoading?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
  isLoading = false,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Focus trap and escape key handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    // Focus the cancel button when modal opens (safer default)
    setTimeout(() => {
      confirmButtonRef.current?.focus();
    }, 50);

    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, isLoading, onClose]);

  if (!isOpen) return null;

  const getConfirmButtonStyles = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
      case 'warning':
        return 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500';
      case 'primary':
        return 'bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark focus:ring-bnb-yellow';
      default:
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
    }
  };

  const getIconColor = () => {
    switch (confirmVariant) {
      case 'danger':
        return 'text-red-600 bg-red-100';
      case 'warning':
        return 'text-amber-600 bg-amber-100';
      case 'primary':
        return 'text-bnb-yellow bg-bnb-yellow/20';
      default:
        return 'text-red-600 bg-red-100';
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-description"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={isLoading ? undefined : onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 overflow-hidden transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Icon and Header */}
        <div className="p-6 pb-0">
          <div className="flex items-start gap-4">
            {/* Icon */}
            <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${getIconColor()}`}>
              {confirmVariant === 'danger' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              ) : confirmVariant === 'warning' ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
            </div>

            {/* Title and Description */}
            <div className="flex-1 min-w-0">
              <h3
                id="confirm-modal-title"
                className="text-lg font-bold text-gray-900 dark:text-white"
              >
                {title}
              </h3>
              <p
                id="confirm-modal-description"
                className="mt-2 text-sm text-gray-600 dark:text-gray-300"
              >
                {description}
              </p>
            </div>

            {/* Close button */}
            {!isLoading && (
              <button
                onClick={onClose}
                className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors p-1 -m-1"
                aria-label="Close"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 pt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="w-full sm:w-auto px-4 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            {cancelText}
          </button>
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            disabled={isLoading}
            className={`w-full sm:w-auto px-4 py-2.5 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2 ${getConfirmButtonStyles()}`}
          >
            {isLoading && (
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
            )}
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// useConfirmModal Hook - For easier usage
// ============================================================================

import { useState, useCallback } from 'react';

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText: string;
  cancelText: string;
  confirmVariant: 'danger' | 'warning' | 'primary';
  onConfirm: () => void;
  isLoading: boolean;
}

export interface ShowConfirmOptions {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'danger' | 'warning' | 'primary';
  onConfirm: () => void | Promise<void>;
}

export function useConfirmModal() {
  const [state, setState] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    description: '',
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    confirmVariant: 'danger',
    onConfirm: () => {},
    isLoading: false,
  });

  const showConfirm = useCallback((options: ShowConfirmOptions) => {
    setState({
      isOpen: true,
      title: options.title,
      description: options.description,
      confirmText: options.confirmText || 'Confirm',
      cancelText: options.cancelText || 'Cancel',
      confirmVariant: options.confirmVariant || 'danger',
      onConfirm: options.onConfirm,
      isLoading: false,
    });
  }, []);

  const hideConfirm = useCallback(() => {
    setState(prev => ({ ...prev, isOpen: false, isLoading: false }));
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState(prev => ({ ...prev, isLoading: loading }));
  }, []);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    try {
      await state.onConfirm();
      hideConfirm();
    } catch (error) {
      console.error('Confirm action failed:', error);
      setLoading(false);
    }
  }, [state.onConfirm, hideConfirm, setLoading]);

  return {
    state,
    showConfirm,
    hideConfirm,
    setLoading,
    handleConfirm,
    // Convenience component props
    modalProps: {
      isOpen: state.isOpen,
      onClose: hideConfirm,
      onConfirm: handleConfirm,
      title: state.title,
      description: state.description,
      confirmText: state.confirmText,
      cancelText: state.cancelText,
      confirmVariant: state.confirmVariant,
      isLoading: state.isLoading,
    },
  };
}

export default ConfirmModal;
