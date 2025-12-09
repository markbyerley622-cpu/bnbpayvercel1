/**
 * Customer Payment Components Export
 *
 * Re-exports all customer-facing payment link components.
 */

// Customer Header
export { CustomerHeader, PaymentBadge } from './CustomerHeader';

// Customer Layout (wraps payment pages)
export { CustomerPaymentLayout, useSaveReceipt } from './CustomerPaymentLayout';
export type { SaveReceiptParams } from './CustomerPaymentLayout';

// Receipt History
export { ReceiptHistory } from './ReceiptHistory';

// Receipt Viewer
export { ReceiptViewer } from './ReceiptViewer';

// Error UI (re-export for convenience)
export { AlertBanner, InlineError, PaymentErrorDisplay } from './ErrorUI';
