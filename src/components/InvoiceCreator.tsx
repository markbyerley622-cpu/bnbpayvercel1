import { useState, useEffect } from 'react';
import type { InvoiceData } from '../lib/types';
import { InvoiceModal } from './InvoiceModal';
import { isMetaMaskInstalled, type NetworkType } from '../lib/web3';
import { getTokensForNetwork, getTokenImagePath, type Token } from '../lib/price-utils';
import { createInvoice, type NetworkKey } from '../lib/bnbpay-api';
import { ethers } from 'ethers';

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
    token: availableTokens[0], // Default to first token (BNB)
    payeeWalletAddress: '', // Wallet that will pay the invoice
  });

  // Update token when network changes
  useEffect(() => {
    const tokens = getTokensForNetwork(network);
    setFormData(prev => ({ ...prev, token: tokens[0] }));
  }, [network]);

  const [loading, setLoading] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<InvoiceData | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Check if MetaMask is installed
    if (!isMetaMaskInstalled()) {
      alert('MetaMask is not installed. Please install MetaMask to create invoices.');
      return;
    }

    setLoading(true);

    try {
      // Use the selected token for settlement
      const settlementToken = formData.token as Token;

      // Step 1: Get connected wallet address (merchant/invoicer)
      if (!window.ethereum) {
        throw new Error('MetaMask not available');
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
        paymentToken: formData.token as Token,
        paymentAmount: formData.amount,
        allowedTokens: tokenAllowlist, // All tokens that can be used for payment
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
        t: formData.token, // token
        d: formData.description, // description
        dd: formData.dueDate || '', // due date
        pw: formData.payeeWalletAddress || '', // payee wallet
        c: Date.now(), // created at
        al: tokenAllowlist, // allowed tokens for payment
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
    } catch (error: any) {
      console.error('Failed to create invoice:', error);
      console.error('Error details:', error?.details);
      // Show more detailed error message - check for validation errors
      let errorMessage = 'Failed to create invoice. Please try again.';
      if (error?.details) {
        // API validation error
        if (typeof error.details === 'object') {
          errorMessage = JSON.stringify(error.details, null, 2);
        } else {
          errorMessage = String(error.details);
        }
      } else if (error?.message) {
        errorMessage = error.message;
      }
      alert(`Failed to create invoice:\n${errorMessage}`);
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
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors text-sm"
            />
          </div>
          <div className="form-group">
            <label className="block mb-2 text-gray-300 font-semibold text-sm">Payer Email (Optional)</label>
            <input
              type="email"
              name="payerEmail"
              value={formData.payerEmail}
              onChange={handleChange}
              placeholder="payer@example.com"
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors text-sm"
            />
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
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors resize-none"
          />
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Amount & Settlement Token</label>
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
              className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors pr-40"
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center space-x-2 border-l-2 border-bnb-yellow/20 pl-3">
              <img
                src={getTokenImagePath(formData.token as Token)}
                alt={formData.token}
                className="h-6 w-6 rounded-full"
              />
              <select
                name="token"
                value={formData.token}
                onChange={handleChange}
                className="bg-bnb-gray text-white pr-6 py-2 rounded-lg focus:outline-none cursor-pointer appearance-none font-semibold"
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%23F0B90B'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 0.25rem center', backgroundSize: '1rem' }}
              >
                {availableTokens.map(token => (
                  <option key={token} value={token}>{token}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="mt-2 text-xs text-gray-400">Invoice will be paid in {formData.token}</p>
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Payee Wallet Address (Optional)</label>
          <input
            type="text"
            name="payeeWalletAddress"
            value={formData.payeeWalletAddress}
            onChange={handleChange}
            placeholder="0x... (leave empty for any wallet)"
            pattern="^0x[a-fA-F0-9]{40}$"
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors font-mono text-sm"
          />
          <p className="mt-2 text-xs text-gray-400">Specify who can pay this invoice. Leave empty to allow any wallet.</p>
        </div>

        <div className="form-group">
          <label className="block mb-2 text-gray-300 font-semibold text-sm">Due Date (Optional)</label>
          <input
            type="date"
            name="dueDate"
            value={formData.dueDate}
            onChange={handleChange}
            className="w-full px-4 py-3 bg-bnb-gray border-2 border-bnb-gray text-white placeholder-gray-500 rounded-xl focus:outline-none focus:border-bnb-yellow transition-colors"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold text-lg rounded-xl transition-all btn-glow glow-effect disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
        >
          <span>{loading ? 'Generating Invoice...' : 'Create Invoice'}</span>
          {!loading && <img src="/2.png" alt="Coin" className="h-10 w-10" />}
        </button>

        <div className="mt-4 p-4 bg-bnb-yellow/10 border border-bnb-yellow/20 rounded-xl text-sm">
          <p className="text-gray-300">
            <strong className="text-bnb-yellow">x402 Flex Payment:</strong> This invoice will be paid in <strong className="text-bnb-yellow">{formData.token}</strong> directly to your wallet.
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
