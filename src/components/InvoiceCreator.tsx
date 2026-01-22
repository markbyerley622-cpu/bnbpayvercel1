import { useState, useEffect } from 'react';
import type { InvoiceData } from '../lib/types';
import { InvoiceModal } from './InvoiceModal';
import { isWalletInstalled, type NetworkType } from '../lib/web3';
import { getTokensForNetwork, getTokenImagePath, type Token } from '../lib/price-utils';
import { createInvoice, type NetworkKey } from '../lib/bnbpay-api';
import { ethers } from 'ethers';
import { ErrorCode, getSafeMessage, mapToErrorCode, logInternalError, generateReferenceId } from '../lib/error-codes';
import { AlertBanner } from './ErrorUI';
import { TokenSelector } from './TokenSelector';
import { DatePicker } from './DatePicker';

interface InvoiceCreatorProps {
  network: NetworkType;
  onInvoiceCreated?: (invoice: InvoiceData) => void;
}

export function InvoiceCreator({ network, onInvoiceCreated }: InvoiceCreatorProps) {
  const availableTokens = getTokensForNetwork(network);
  const [formData, setFormData] = useState({
    merchantName: '',
    merchantEmail: '', // Optional merchant email for receipt/certificate
    payerEmail: '', // Optional payer email for receipt
    description: '',
    amount: '',
    dueDate: '',
    acceptedTokens: [availableTokens[0]] as Token[], // Default to first token (BNB)
    payeeWalletAddress: '', // Wallet that will pay the invoice
  });

  // Update tokens when network changes
  useEffect(() => {
    const tokens = getTokensForNetwork(network);
    setFormData(prev => ({ ...prev, acceptedTokens: [tokens[0]] }));
  }, [network]);

  // Get the primary settlement token (first selected or BNB)
  const primaryToken = formData.acceptedTokens.length > 0 ? formData.acceptedTokens[0] : 'BNB';

  const [loading, setLoading] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceData | null>(null);

  // Error state - structured for safe display
  const [error, setError] = useState<{
    code: ErrorCode;
    message: string;
    referenceId: string;
    showRetry: boolean;
  } | null>(null);

  // Field-level validation errors
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Validate form fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.description.trim()) {
      errors.description = 'Description is required';
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      errors.amount = 'Please enter a valid amount';
    }

    if (formData.acceptedTokens.length === 0) {
      errors.tokens = 'Please select at least one token to accept';
    }

    // Validate payee wallet if provided
    if (formData.payeeWalletAddress && !/^0x[a-fA-F0-9]{40}$/.test(formData.payeeWalletAddress)) {
      errors.payeeWalletAddress = 'Invalid wallet address format';
    }

    // Validate emails if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (formData.merchantEmail && !emailRegex.test(formData.merchantEmail)) {
      errors.merchantEmail = 'Invalid email format';
    }
    if (formData.payerEmail && !emailRegex.test(formData.payerEmail)) {
      errors.payerEmail = 'Invalid email format';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle safe error display - NEVER expose internal details
  const handleError = (err: unknown, context?: Record<string, unknown>) => {
    const errorCode = mapToErrorCode(err);
    const referenceId = logInternalError(errorCode, err, context);

    // Determine if retry is appropriate
    const nonRetryableCodes = [
      ErrorCode.VALIDATION_ERROR,
      ErrorCode.INVOICE_VALIDATION_FAILED,
      ErrorCode.INVALID_INVOICE_AMOUNT,
      ErrorCode.INVALID_MERCHANT_ADDRESS,
    ];

    setError({
      code: errorCode,
      message: getSafeMessage(errorCode),
      referenceId,
      showRetry: !nonRetryableCodes.includes(errorCode),
    });
  };

  // Clear error state
  const clearError = () => {
    setError(null);
    setFieldErrors({});
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();

    // Validate form first
    if (!validateForm()) {
      return;
    }

    // Check if Web3 wallet is installed
    if (!isWalletInstalled()) {
      setError({
        code: ErrorCode.WALLET_NOT_CONNECTED,
        message: 'Please install a Web3 wallet (OKX, Trust Wallet, etc.) to create invoices.',
        referenceId: generateReferenceId(),
        showRetry: false,
      });
      return;
    }

    setLoading(true);

    try {
      // Use the first selected token for settlement (primary token)
      const settlementToken = primaryToken;

      // Step 1: Get connected wallet address (merchant/invoicer)
      if (!window.ethereum) {
        throw new Error('No Web3 wallet available');
      }
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const merchantAddress = await signer.getAddress();

      // Step 2: Get all supported tokens for this network (API tokens: BNB, USDT, USDC, USD1)
      const tokenAllowlist = getTokensForNetwork(network);

      // Step 3: Create invoice via BNBPay API
      const apiNetwork: NetworkKey = network === 'mainnet' ? 'bnb' : 'bnbTestnet';
      const expiresAt = formData.dueDate
        ? new Date(formData.dueDate + 'T23:59:59Z').toISOString()
        : undefined;

      // Use the settlement token directly (no T prefix anymore)
      const currencyToken = settlementToken;

      // Build request payload
      // Note: tokenAllowlist should be empty to use API's default allowlist (all supported tokens)
      // Format amount as clean decimal string (no trailing zeros, must have at least one digit after decimal)
      const cleanAmount = parseFloat(formData.amount).toString();
      const formattedAmount = cleanAmount.includes('.') ? cleanAmount : `${cleanAmount}.0`;

      // Generate a unique reference ID (required by API - must be unique per invoice)
      const uniqueRef = `inv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const reference = formData.payeeWalletAddress
        ? `${uniqueRef}:payee:${formData.payeeWalletAddress}`
        : uniqueRef;

      // Generate resourceId from reference (same as backend does)
      // This is used for payment matching on-chain
      const generatedResourceId = ethers.keccak256(ethers.toUtf8Bytes(reference));

      const requestPayload: {
        title: string;
        merchantId: string;
        merchantName: string;
        merchantEmail?: string;
        payerEmail?: string;
        amount: string;
        currencyToken: string;
        network: NetworkKey;
        tokenAllowlist: string[];
        expiresAt?: string;
        reference: string;
      } = {
        title: formData.description || 'Invoice',
        merchantId: merchantAddress,
        merchantName: formData.merchantName || 'BNBPay Merchant',
        amount: formattedAmount,
        currencyToken: currencyToken,
        network: apiNetwork,
        tokenAllowlist: [], // Empty = use API's default (all supported tokens for the network)
        expiresAt,
        reference, // Unique reference ID for this invoice
      };

      // Add optional email fields if provided
      if (formData.merchantEmail && formData.merchantEmail.trim()) {
        requestPayload.merchantEmail = formData.merchantEmail.trim();
      }
      if (formData.payerEmail && formData.payerEmail.trim()) {
        requestPayload.payerEmail = formData.payerEmail.trim();
      }

      console.log('Creating invoice with payload:', requestPayload);

      let apiInvoice: any = null;
      try {
        apiInvoice = await createInvoice(requestPayload);
        console.log('Invoice created via API:', apiInvoice);
      } catch (apiError: any) {
        console.warn('API invoice creation failed (falling back to local-only):', apiError);
        // Fallback: Create invoice locally without API
        // This allows invoice creation to work even if API is unavailable
        const fallbackInvoiceId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
        apiInvoice = {
          invoiceId: fallbackInvoiceId,
          reference: reference,
          resourceId: generatedResourceId,
          status: 'pending',
          network: apiNetwork,
        };
      }

      const finalInvoice: InvoiceData = {
        type: 'invoice',
        currency: settlementToken, // Settlement token (BNB, USDT, etc.)
        amount: formData.amount, // Amount in selected token
        description: formData.description,
        customer: {
          name: formData.payeeWalletAddress ? 'Specified Wallet' : 'Any Wallet',
          email: formData.payeeWalletAddress || 'open',
        },
        dueDate: formData.dueDate || undefined,
        supports_multi_token: true, // Can pay with any supported token
        settlement: settlementToken, // Settles to selected token
        referenceId: apiInvoice.reference,
        paymentToken: primaryToken,
        paymentAmount: formData.amount,
        allowedTokens: formData.acceptedTokens.length > 0 ? formData.acceptedTokens : tokenAllowlist, // Selected tokens or all if none
        payeeWalletAddress: formData.payeeWalletAddress || undefined,
        invoiceId: apiInvoice.invoiceId,
        paymentLink: '', // Will be set below with encoded data
        x402FlexHeaders: {
          'X-402-Protocol': 'flex/1.0',
          'X-402-Resource-Id': apiInvoice.resourceId || generatedResourceId,
          'X-402-Amount': formData.amount,
          'X-402-Currency': currencyToken,
          'X-402-Chain': apiNetwork === 'bnb' ? 'bnb-chain:56' : 'bnb-chain:97',
          'X-402-Merchant': merchantAddress,
          'X-402-Accepts': tokenAllowlist.join(','),
        },
        resourceId: apiInvoice.resourceId || generatedResourceId,
        merchantAddress,
        paymentId: apiInvoice.paymentId,
        createdAt: Date.now(),
        // Note: txHash will be added when the payer actually pays
      };

      // Encode essential invoice data in URL so it can be shared without backend
      const invoiceDataForUrl = {
        id: apiInvoice.invoiceId,
        m: merchantAddress, // merchant
        a: formData.amount, // amount
        t: primaryToken, // primary settlement token
        d: formData.description, // description
        dd: formData.dueDate || '', // due date
        pw: formData.payeeWalletAddress || '', // payee wallet
        c: Date.now(), // created at
        n: apiNetwork, // network key (bnb | bnbTestnet)
        al: formData.acceptedTokens.length > 0 ? formData.acceptedTokens : tokenAllowlist, // allowed tokens for payment
        ri: apiInvoice.resourceId || generatedResourceId, // resourceId for payment matching
        ref: reference, // reference string
      };
      const encodedData = btoa(JSON.stringify(invoiceDataForUrl));
      const baseUrl = window.location.origin;
      finalInvoice.paymentLink = `${baseUrl}/invoice/${apiInvoice.invoiceId}?data=${encodeURIComponent(encodedData)}`;

      // Save to localStorage - both for merchant list and individual access
      // Use lowercase address for consistency across all storage operations
      const normalizedMerchantAddress = merchantAddress.toLowerCase();
      const storageKey = `invoices_${normalizedMerchantAddress}`;

      console.log('Saving invoice to localStorage with key:', storageKey);

      const existingInvoices = JSON.parse(localStorage.getItem(storageKey) || '[]');
      existingInvoices.push(finalInvoice);
      localStorage.setItem(storageKey, JSON.stringify(existingInvoices));

      // Also save individually so anyone with the link can access
      localStorage.setItem(`invoice_${apiInvoice.invoiceId}`, JSON.stringify(finalInvoice));

      console.log('Invoice saved successfully. Total invoices for this merchant:', existingInvoices.length);

      setGeneratedInvoice(finalInvoice);

      // Notify parent component (App)
      if (onInvoiceCreated) {
        onInvoiceCreated(finalInvoice);
      }
    } catch (err: unknown) {
      // Safe error handling - NEVER expose internal details to UI
      handleError(err, {
        action: 'createInvoice',
        network,
        tokensSelected: formData.acceptedTokens,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Error Banner - bounded display */}
        {error && (
          <AlertBanner
            message={error.message}
            type="error"
            referenceId={error.referenceId}
            showRetry={error.showRetry}
            onRetry={() => {
              clearError();
              handleSubmit(new Event('submit') as unknown as React.FormEvent);
            }}
            onDismiss={clearError}
          />
        )}

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Merchant / Business Name</label>
          <input
            type="text"
            name="merchantName"
            value={formData.merchantName}
            onChange={handleChange}
            placeholder="Your business name"
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Merchant Email (Optional)</label>
            <input
              type="email"
              name="merchantEmail"
              value={formData.merchantEmail}
              onChange={handleChange}
              placeholder="merchant@example.com"
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors text-sm ${
                fieldErrors.merchantEmail ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
              }`}
            />
            {fieldErrors.merchantEmail && (
              <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.merchantEmail}</p>
            )}
          </div>
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Payer Email (Optional)</label>
            <input
              type="email"
              name="payerEmail"
              value={formData.payerEmail}
              onChange={handleChange}
              placeholder="payer@example.com"
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors text-sm ${
                fieldErrors.payerEmail ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
              }`}
            />
            {fieldErrors.payerEmail && (
              <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.payerEmail}</p>
            )}
          </div>
        </div>
        <p className="text-xs text-gray-400 -mt-3">Emails are used for payment receipts and certificates</p>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Invoice Description</label>
          <textarea
            name="description"
            value={formData.description}
            onChange={handleChange}
            placeholder="Payment for services..."
            required
            rows={3}
            className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors resize-none ${
              fieldErrors.description ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
            }`}
          />
          {fieldErrors.description && (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.description}</p>
          )}
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Amount</label>
          <div className="relative">
            <input
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              placeholder="100.00"
              step="0.01"
              min="0.01"
              required
              className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors pr-24 ${
                fieldErrors.amount ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
              }`}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2 border-l-2 border-bnb-yellow/20 pl-3">
              <img
                src={getTokenImagePath(primaryToken)}
                alt={primaryToken}
                className="h-6 w-6 rounded-full"
              />
              <span className="text-bnb-yellow font-semibold">{primaryToken}</span>
            </div>
          </div>
          {fieldErrors.amount && (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.amount}</p>
          )}
        </div>

        {/* Token Selection Cards - Multi-select */}
        <TokenSelector
          selectedTokens={formData.acceptedTokens}
          onTokensChange={(tokens) => setFormData(prev => ({ ...prev, acceptedTokens: tokens }))}
          network={network}
          showBlurEffect={true}
          multiSelect={true}
        />

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Payee Wallet Address (Optional)</label>
          <input
            type="text"
            name="payeeWalletAddress"
            value={formData.payeeWalletAddress}
            onChange={handleChange}
            placeholder="0x... (leave empty for any wallet)"
            pattern="^0x[a-fA-F0-9]{40}$"
            className={`w-full px-4 py-3 bg-bnb-gray border-2 text-white placeholder-gray-500 rounded-xl focus:outline-none transition-colors font-mono text-sm ${
              fieldErrors.payeeWalletAddress ? 'border-red-500' : 'border-bnb-gray focus:border-bnb-yellow'
            }`}
          />
          {fieldErrors.payeeWalletAddress ? (
            <p className="mt-1 text-xs text-red-400 truncate">{fieldErrors.payeeWalletAddress}</p>
          ) : (
            <p className="mt-2 text-xs text-gray-400">Specify who can pay this invoice. Leave empty to allow any wallet.</p>
          )}
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Due Date (Optional)</label>
          <DatePicker
            value={formData.dueDate}
            onChange={(value) => setFormData(prev => ({ ...prev, dueDate: value }))}
            placeholder="Select due date"
            minDate={new Date().toISOString().split('T')[0]}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold text-base sm:text-lg rounded-xl transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2 sm:space-x-3"
        >
          <span>{loading ? 'Generating Invoice...' : 'Create Invoice'}</span>
          {!loading && <img src="/2.png" alt="Coin" className="h-8 w-8 sm:h-10 sm:w-10" />}
        </button>

        <div className="mt-4 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
          <p className="text-gray-300">
            <strong className="text-bnb-yellow">x402 Flex Payment:</strong>{' '}
            {formData.acceptedTokens.length === 0 ? (
              'Please select at least one token to accept.'
            ) : formData.acceptedTokens.length === 1 ? (
              <>This invoice accepts <strong className="text-bnb-yellow">{formData.acceptedTokens[0]}</strong> only.</>
            ) : (
              <>This invoice accepts <strong className="text-bnb-yellow">{formData.acceptedTokens.join(', ')}</strong>. Payer can choose any.</>
            )}
            {formData.payeeWalletAddress && <span className="block mt-1">Payment restricted to: <code className="text-bnb-yellow">{formData.payeeWalletAddress.slice(0, 10)}...{formData.payeeWalletAddress.slice(-8)}</code></span>}
          </p>
        </div>
      </form>

      {generatedInvoice && (
        <InvoiceModal
          invoice={generatedInvoice}
          onClose={() => setGeneratedInvoice(null)}
        />
      )}
    </>
  );
}
