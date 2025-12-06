import { useState, useEffect, useRef } from 'react';
import { ethers } from 'ethers';
import QRCode from 'qrcode';
import type { InvoiceData } from '../lib/types';
import type { NetworkType } from '../lib/web3';
import { getCurrentNetwork, formatAddress, connectWallet, NETWORKS, payInvoiceThroughRouter, getProvider, getSigner } from '../lib/web3';
import { getTokenImagePath, getTokenDisplayName, getTokensForNetwork, type Token, convertFromUSD, convertToUSD, formatAmount } from '../lib/price-utils';
import { FloatingParticles } from './FloatingParticles';
import { AgentFlowPanel } from './AgentFlowPanel';
import { PaymentReceipt } from './PaymentReceipt';
import { getInvoice, getInvoiceStatus, subscribeToInvoiceSSE, confirmInvoicePayment, getTokenCapabilities, type Invoice as ApiInvoice, type NetworkKey } from '../lib/bnbpay-api';
import { payInvoiceGasless, isPermit2Approved, approvePermit2, supportsEIP2612, supportsEIP3009 } from '../lib/gasless-payments';

interface InvoicePageProps {
  invoiceId: string;
}

type PaymentStatus = 'pending' | 'processing' | 'paid' | 'failed';

export function InvoicePage({ invoiceId }: InvoicePageProps) {
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [_apiInvoice, setApiInvoice] = useState<ApiInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('pending');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [selectedPayToken, setSelectedPayToken] = useState<Token>('BNB');
  const [showReceipt, setShowReceipt] = useState(false);
  const [paidAt, setPaidAt] = useState<number | null>(null);
  const [paidToken, setPaidToken] = useState<string | null>(null);
  const [paidAmount, setPaidAmount] = useState<string | null>(null);
  const qrCanvasDesktopRef = useRef<HTMLCanvasElement>(null);
  const qrCanvasMobileRef = useRef<HTMLCanvasElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Payment mode: 'gas' (user pays gas) or 'gasless' (relayer pays gas)
  // Gasless mode uses EIP-3009/EIP-2612/Permit2 + witness signatures
  const [paymentMode, setPaymentMode] = useState<'gas' | 'gasless'>('gas');
  const [permit2Approved, setPermit2Approved] = useState<boolean>(false);
  const [checkingPermit2, setCheckingPermit2] = useState<boolean>(false);
  const [supportsPermit, setSupportsPermit] = useState<boolean>(false);
  const [supportsEip3009, setSupportsEip3009] = useState<boolean>(false);
  const [supportsEip2612, setSupportsEip2612] = useState<boolean>(false);

  // Generate QR code for payment page URL - Desktop
  // Uses the full payment link URL so any QR scanner can open the payment page
  useEffect(() => {
    if (qrCanvasDesktopRef.current && invoice) {
      // Use the current page URL which includes the ?data= parameter
      const paymentUrl = window.location.href;
      QRCode.toCanvas(
        qrCanvasDesktopRef.current,
        paymentUrl,
        {
          width: 200,
          margin: 2,
          color: {
            dark: '#0B0E11',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error (desktop):', error);
        }
      );
    }
  }, [invoice]);

  // Generate QR code for payment page URL - Mobile
  useEffect(() => {
    if (qrCanvasMobileRef.current && invoice) {
      const paymentUrl = window.location.href;
      QRCode.toCanvas(
        qrCanvasMobileRef.current,
        paymentUrl,
        {
          width: 160,
          margin: 2,
          color: {
            dark: '#0B0E11',
            light: '#FFFFFF',
          },
        },
        (error) => {
          if (error) console.error('QR Code generation error (mobile):', error);
        }
      );
    }
  }, [invoice]);

  useEffect(() => {
    setMounted(true);
    getCurrentNetwork().then(detectedNetwork => {
      setNetwork(detectedNetwork);
    });
  }, []);

  useEffect(() => {
    loadInvoice();
  }, [invoiceId]);

  // Subscribe to SSE for real-time payment status updates
  useEffect(() => {
    if (!invoiceId || paymentStatus === 'paid') return;

    // Try to fetch invoice from API first
    const fetchApiInvoice = async () => {
      try {
        const inv = await getInvoice(invoiceId);
        setApiInvoice(inv);

        // Merge API invoice data with local invoice
        // API has the authoritative merchant address and payment details
        if (invoice) {
          const updatedInvoice: InvoiceData = {
            ...invoice,
            merchantAddress: inv.merchantId,  // ✅ Use API merchant, not local
            payeeWalletAddress: invoice.payeeWalletAddress, // Keep local payer
            status: inv.status as any,
            txHash: inv.txHash,
            paymentId: inv.paymentId,
            resourceId: inv.resourceId,
          };
          setInvoice(updatedInvoice);

          // Update localStorage with correct merchant
          localStorage.setItem(`invoice_${invoiceId}`, JSON.stringify(updatedInvoice));
        }

        // Check if already paid
        if (inv.status === 'paid') {
          setPaymentStatus('paid');
          setTxHash(inv.txHash || null);
          setPaidAt(new Date(inv.updatedAt).getTime());
          return;
        }

        // Subscribe to SSE for updates
        const sse = subscribeToInvoiceSSE(invoiceId);
        sseRef.current = sse;

        sse.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            console.log('SSE update:', data);

            if (data.event === 'update' || data.event === 'snapshot') {
              const invoiceData = data.data || data;
              if (invoiceData.status === 'paid') {
                setPaymentStatus('paid');
                setTxHash(invoiceData.txHash || null);
                setPaidAt(invoiceData.updatedAt ? new Date(invoiceData.updatedAt).getTime() : Date.now());

                // Update local storage
                const storedInvoice = localStorage.getItem(`invoice_${invoiceId}`);
                if (storedInvoice) {
                  const parsed = JSON.parse(storedInvoice);
                  localStorage.setItem(`invoice_${invoiceId}`, JSON.stringify({
                    ...parsed,
                    status: 'paid',
                    txHash: invoiceData.txHash,
                    paidAt: Date.now(),
                  }));
                }
              }
            }
          } catch (err) {
            console.error('Error parsing SSE message:', err);
          }
        };

        sse.onerror = (err) => {
          console.error('SSE error:', err);
          // Don't close - EventSource will auto-reconnect
        };
      } catch (err) {
        console.log('Invoice not found in API, using local data');
      }
    };

    fetchApiInvoice();

    // Cleanup
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, [invoiceId, paymentStatus]);

  const loadInvoice = () => {
    setLoading(true);
    setError(null);

    let foundInvoice: InvoiceData | null = null;

    // First, try to decode invoice data from URL query parameter
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const encodedData = urlParams.get('data');
      if (encodedData) {
        // Handle URL encoding - the data might be double-encoded or have + signs
        let cleanData = encodedData;
        // Replace + with space (URL encoding quirk)
        cleanData = cleanData.replace(/\+/g, ' ');
        // Decode URI component first
        try {
          cleanData = decodeURIComponent(cleanData);
        } catch {
          // Already decoded or invalid encoding, continue
        }
        // Handle potential padding issues with base64
        while (cleanData.length % 4 !== 0) {
          cleanData += '=';
        }

        const decodedJson = atob(cleanData);
        const urlData = JSON.parse(decodedJson);

        // Reconstruct invoice from URL data
        // Parse allowed tokens from URL data, ensuring WUSD is always included
        const baseTokens = urlData.al || ['BNB', 'USDT', 'USDC', 'USD1'];
        const allowedTokens = baseTokens.includes('WUSD') ? baseTokens : [...baseTokens, 'WUSD'];

        foundInvoice = {
          type: 'invoice',
          invoiceId: urlData.id,
          merchantAddress: urlData.m,
          amount: urlData.a,
          paymentAmount: urlData.a,
          paymentToken: urlData.t,
          currency: urlData.t,
          settlement: urlData.t,
          description: urlData.d,
          dueDate: urlData.dd || undefined,
          payeeWalletAddress: urlData.pw || undefined,
          createdAt: urlData.c,
          customer: {
            name: urlData.pw ? 'Restricted to Payer' : 'Any Wallet',
            email: urlData.pw || 'open',
          },
          supports_multi_token: true, // Enable multi-token payments
          allowedTokens: allowedTokens,
          paymentLink: window.location.href,
          resourceId: urlData.ri || undefined, // resourceId for payment matching
          referenceId: urlData.ref || undefined, // reference string
        };

        // Set default selected token to first allowed token
        if (allowedTokens.length > 0) {
          setSelectedPayToken(allowedTokens[0] as Token);
        }

        // Save to localStorage for future access with the correct invoice ID
        const storedInvoiceId = urlData.id || invoiceId;
        localStorage.setItem(`invoice_${storedInvoiceId}`, JSON.stringify(foundInvoice));
        console.log('Invoice loaded from URL data:', storedInvoiceId);
      }
    } catch (e) {
      console.error('Failed to decode invoice from URL:', e);
    }

    // If not found in URL, check individual invoice storage
    if (!foundInvoice) {
      try {
        const individualInvoice = localStorage.getItem(`invoice_${invoiceId}`);
        if (individualInvoice) {
          foundInvoice = JSON.parse(individualInvoice);
          console.log('Invoice loaded from localStorage:', invoiceId);
        }
      } catch (e) {
        console.error('Failed to parse individual invoice:', e);
      }
    }

    // If still not found, search through merchant invoice lists
    if (!foundInvoice) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('invoices_')) {
          try {
            const invoices: InvoiceData[] = JSON.parse(localStorage.getItem(key) || '[]');
            const found = invoices.find(inv => inv.invoiceId === invoiceId);
            if (found) {
              foundInvoice = found;
              console.log('Invoice found in merchant list:', key);
              break;
            }
          } catch (e) {
            console.error('Failed to parse invoices from', key, e);
          }
        }
      }
    }

    if (foundInvoice) {
      setInvoice(foundInvoice);

      // Check if invoice was already paid (from localStorage)
      if ((foundInvoice as any).status === 'paid' || (foundInvoice as any).txHash) {
        setPaymentStatus('paid');
        setTxHash((foundInvoice as any).txHash || null);
      }
    } else {
      // Check if we're on a URL without data parameter - provide helpful message
      const hasDataParam = window.location.search.includes('data=');
      if (!hasDataParam) {
        setError('This invoice link is incomplete. The link needs to include the invoice data parameter (?data=...). Please ask the sender for the full payment link.');
      } else {
        setError('Invoice data could not be decoded. The link may be corrupted or expired. Please ask the sender for a new payment link.');
      }
    }

    setLoading(false);
  };

  // Check for payments to merchant address on-chain
  const checkOnChainPayment = async () => {
    if (!invoice) return;

    const merchant = invoice.merchantAddress || invoice.payeeWalletAddress;
    if (!merchant) return;

    try {
      const config = NETWORKS[network];
      const provider = new ethers.JsonRpcProvider(config.rpcUrl);

      // For now, we'll check the localStorage for payment record
      // In production, you'd use an indexer or scan Transfer events
      // A full implementation would scan for Transfer events
      const paymentKey = `payment_${invoice.invoiceId}`;
      const storedPayment = localStorage.getItem(paymentKey);
      if (storedPayment) {
        const payment = JSON.parse(storedPayment);
        if (payment.txHash) {
          // Verify the transaction on-chain
          const tx = await provider.getTransaction(payment.txHash);
          if (tx && tx.to?.toLowerCase() === merchant.toLowerCase()) {
            setPaymentStatus('paid');
            setTxHash(payment.txHash);

            // Update invoice
            const updatedInvoice = {
              ...invoice,
              status: 'paid' as const,
              txHash: payment.txHash,
              paidAt: payment.paidAt,
            };
            setInvoice(updatedInvoice);
            localStorage.setItem(`invoice_${invoice.invoiceId}`, JSON.stringify(updatedInvoice));
          }
        }
      }
    } catch (err) {
      console.error('Error checking on-chain payment:', err);
    }
  };

  // Check for payments periodically while pending
  useEffect(() => {
    if (paymentStatus === 'pending' && invoice) {
      checkOnChainPayment();

      // Poll every 10 seconds
      const interval = setInterval(checkOnChainPayment, 10000);
      return () => clearInterval(interval);
    }
  }, [paymentStatus, invoice]);

  // Check if selected token supports gasless payments and if Permit2 is approved
  useEffect(() => {
    const checkGaslessSupport = async () => {
      // Native BNB never supports gasless
      if (selectedPayToken === 'BNB') {
        setSupportsPermit(false);
        setSupportsEip3009(false);
        setSupportsEip2612(false);
        setPermit2Approved(false);
        setPaymentMode('gas'); // Force gas mode for BNB
        return;
      }

      // Only check if wallet is connected
      if (!walletAddress) {
        return;
      }

      try {
        setCheckingPermit2(true);

        const config = NETWORKS[network];
        const tokens = config.tokens as Record<string, string>;
        const tokenAddress = tokens[selectedPayToken] || tokens[selectedPayToken.toUpperCase()];

        if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
          setSupportsPermit(false);
          setSupportsEip3009(false);
          setSupportsEip2612(false);
          setPermit2Approved(false);
          return;
        }

        const provider = getProvider();
        if (!provider) {
          setSupportsPermit(false);
          setSupportsEip3009(false);
          setSupportsEip2612(false);
          setPermit2Approved(false);
          return;
        }

        // Fetch token capabilities from API (authoritative source)
        const networkKey: NetworkKey = network === 'mainnet' ? 'bnb' : 'bnbTestnet';
        const tokenCapabilities = await getTokenCapabilities(selectedPayToken, networkKey);

        let hasEip3009 = false;
        let hasEip2612 = false;
        let hasPermit2 = false;

        if (tokenCapabilities) {
          // Use API capabilities (authoritative)
          hasEip3009 = tokenCapabilities.supportsEIP3009 || false;
          hasEip2612 = tokenCapabilities.supportsEIP2612 || false;
          hasPermit2 = tokenCapabilities.supportsPermit2 || false;
          console.log(`Token ${selectedPayToken} capabilities from API:`, {
            eip3009: hasEip3009,
            eip2612: hasEip2612,
            permit2: hasPermit2,
          });
        } else {
          // Fallback to on-chain detection if token not in API
          console.log(`Token ${selectedPayToken} not found in API, using on-chain detection`);
          [hasEip3009, hasEip2612] = await Promise.all([
            supportsEIP3009(tokenAddress, provider),
            supportsEIP2612(tokenAddress, provider),
          ]);
        }

        // Check Permit2 approval status (always on-chain)
        const isApproved = hasPermit2 ? await isPermit2Approved(tokenAddress, walletAddress, provider) : false;

        console.log(`Token ${selectedPayToken} gasless support:`, {
          eip3009: hasEip3009,
          eip2612: hasEip2612,
          permit2Approved: isApproved,
        });

        // Track individual support types
        setSupportsEip3009(hasEip3009);
        setSupportsEip2612(hasEip2612);
        // EIP-3009 is preferred, then EIP-2612, then Permit2
        setSupportsPermit(hasEip3009 || hasEip2612 || isApproved);
        setPermit2Approved(isApproved);
      } catch (error) {
        console.error('Failed to check gasless support:', error);
        setSupportsPermit(false);
        setSupportsEip3009(false);
        setSupportsEip2612(false);
        setPermit2Approved(false);
      } finally {
        setCheckingPermit2(false);
      }
    };

    checkGaslessSupport();
  }, [selectedPayToken, walletAddress, network]);

  // Calculate the amount to pay in the selected token
  const getPaymentAmountInToken = (token: Token): string => {
    if (!invoice) return '0';
    const settlementToken = (invoice.paymentToken || invoice.settlement || 'BNB') as Token;
    const settlementAmount = parseFloat(invoice.amount);

    // If paying with the same token as settlement, return the original amount
    if (token === settlementToken) {
      return invoice.amount;
    }

    // Convert: settlement amount -> USD -> target token amount
    const usdValue = convertToUSD(settlementToken, settlementAmount);
    const tokenAmount = convertFromUSD(token, usdValue);

    // Format based on token type
    if (token === 'BNB') {
      return formatAmount(tokenAmount, 6);
    }
    return formatAmount(tokenAmount, 2);
  };

  const handlePayNow = async () => {
    if (!invoice) return;

    // Check if wallet is connected
    let currentWallet = walletAddress;
    if (!currentWallet) {
      try {
        const address = await connectWallet(network);
        setWalletAddress(address);
        currentWallet = address;
      } catch (err) {
        console.error('Failed to connect wallet:', err);
        return;
      }
    }

    // Check if payment is restricted to a specific wallet
    if (invoice.payeeWalletAddress) {
      const payeeAddress = invoice.payeeWalletAddress.toLowerCase();
      const connectedAddress = currentWallet.toLowerCase();
      if (payeeAddress !== connectedAddress) {
        setError(`This invoice can only be paid by wallet: ${invoice.payeeWalletAddress}`);
        setPaymentStatus('failed');
        return;
      }
    }

    setPaymentStatus('processing');
    setError(null);

    try {
      // Get merchant address and payment details
      const merchant = invoice.merchantAddress || invoice.payeeWalletAddress;
      if (!merchant) {
        throw new Error('No merchant address specified');
      }

      // Use selected token for payment
      const tokenSymbol = selectedPayToken;
      const amount = getPaymentAmountInToken(selectedPayToken);

      // Get settlement token (what the merchant wants to receive)
      const settlementToken = invoice.paymentToken || invoice.settlement || 'BNB';

      console.log('Processing payment:', {
        merchant,
        amount,
        paymentToken: tokenSymbol,
        settlementToken,
        invoiceId: invoice.invoiceId,
        network,
        mode: paymentMode,
      });

      let result: { txHash: string; paymentId: string };

      // Check if using gasless mode
      if (paymentMode === 'gasless' && selectedPayToken !== 'BNB') {
        // Gasless payment using Permit2/EIP-2612 + Relay
        console.log('🚀 Using gasless payment flow...');
        console.log('Selected token:', selectedPayToken);
        console.log('Amount:', amount);
        console.log('Merchant:', merchant);
        console.log('Invoice ID:', invoice.invoiceId);

        const config = NETWORKS[network];
        const tokens = config.tokens as Record<string, string>;
        const tokenAddress = tokens[tokenSymbol] || tokens[tokenSymbol.toUpperCase()];

        console.log('Token address:', tokenAddress);

        if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
          throw new Error(`Invalid token address for ${tokenSymbol} gasless payment`);
        }

        // Get signer and provider
        const signer = await getSigner();
        const provider = getProvider();

        if (!provider) {
          throw new Error('Provider not available');
        }

        // Check if Permit2 approval is needed
        if (!permit2Approved && !supportsPermit) {
          throw new Error(
            `Permit2 not approved and ${tokenSymbol} does not support EIP-2612. Please switch to "Pay with Gas" mode or approve Permit2 first.`
          );
        }

        console.log('✅ Starting gasless payment with:', {
          merchant,
          amount,
          token: tokenSymbol,
          tokenAddress,
          invoiceId: invoice.invoiceId,
          network,
        });

        result = await payInvoiceGasless({
          merchantAddress: merchant,
          amount,
          paymentToken: tokenSymbol,
          tokenAddress,
          invoiceId: invoice.invoiceId || '',
          resourceId: invoice.resourceId,
          network,
          signer,
          provider,
        });

        console.log('✅ Gasless payment successful:', result);
      } else {
        // Regular payment with gas (user pays)
        console.log('Using regular payment flow (user pays gas)...');

        result = await payInvoiceThroughRouter({
          merchantAddress: merchant,
          amount: amount,
          paymentToken: tokenSymbol,
          settlementToken: settlementToken,
          invoiceId: invoice.invoiceId || '',
          resourceId: invoice.resourceId,
          network,
        });

        console.log('Payment successful:', result);
      }

      const now = Date.now();
      setTxHash(result.txHash);
      setPaymentStatus('paid');
      setPaidAt(now);
      setPaidToken(tokenSymbol);
      setPaidAmount(amount);

      // Notify API of payment (so it updates database immediately)
      // This is a fallback for when the event indexer doesn't match automatically
      const notifyApiOfPayment = async () => {
        try {
          console.log('Notifying API of payment confirmation...');
          await confirmInvoicePayment(invoice.invoiceId || '', {
            txHash: result.txHash,
            paymentId: result.paymentId,
            resourceId: invoice.resourceId,
            paidBy: currentWallet,
            paidAmount: amount,
            paidToken: tokenSymbol,
          });
          console.log('API notified of payment - invoice status updated to paid');
        } catch (err) {
          console.log('Failed to notify API (invoice may not exist in API or already paid):', err);
          // Fall back to polling if direct notification fails
          const maxAttempts = 5;
          const pollInterval = 3000;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              const status = await getInvoiceStatus(invoice.invoiceId || '');
              if (status.status === 'paid') {
                console.log('Invoice status confirmed as paid by API');
                return;
              }
            } catch {
              // Ignore polling errors
            }
            await new Promise(resolve => setTimeout(resolve, pollInterval));
          }
        }
      };

      // Notify API in background (don't block UI)
      notifyApiOfPayment().catch(console.error);

      // Update invoice in localStorage to mark as paid (DO NOT delete - keep in history)
      try {
        const invoiceKey = `invoice_${invoice.invoiceId}`;
        const paymentKey = `payment_${invoice.invoiceId}`;

        const paymentRecord = {
          invoiceId: invoice.invoiceId,
          txHash: result.txHash,
          paymentId: result.paymentId,
          paidBy: currentWallet,
          paidAt: now,
          amount: amount,
          token: tokenSymbol,
          settlementAmount: invoice.amount,
          settlementToken: settlementToken,
          merchant: merchant,
          network: network,
          routedThroughContract: true, // Flag to indicate payment went through router
        };

        // Store payment record separately for easy lookup
        localStorage.setItem(paymentKey, JSON.stringify(paymentRecord));

        // Update individual invoice - keep it but mark as paid
        const updatedInvoice = {
          ...invoice,
          status: 'paid' as const,
          paidAt: now,
          paidBy: currentWallet,
          txHash: result.txHash,
          paymentId: result.paymentId,
          paidToken: tokenSymbol,
          paidAmount: amount,
        };
        localStorage.setItem(invoiceKey, JSON.stringify(updatedInvoice));

        // Update in merchant's invoices list (keep invoice, just mark as paid)
        const merchantAddress = invoice.merchantAddress;
        if (merchantAddress) {
          const merchantInvoicesKey = `invoices_${merchantAddress}`;
          const existingMerchantInvoices = localStorage.getItem(merchantInvoicesKey);
          if (existingMerchantInvoices) {
            const invoices = JSON.parse(existingMerchantInvoices);
            const updatedList = invoices.map((inv: any) =>
              inv.invoiceId === invoice.invoiceId
                ? { ...inv, status: 'paid', paidAt: now, paidBy: currentWallet, txHash: result.txHash, paymentId: result.paymentId, paidToken: tokenSymbol, paidAmount: amount }
                : inv
            );
            localStorage.setItem(merchantInvoicesKey, JSON.stringify(updatedList));
          }
        }

        // Also update in generic invoices list if exists
        const genericInvoicesKey = 'bnbpay_invoices';
        const existingGenericInvoices = localStorage.getItem(genericInvoicesKey);
        if (existingGenericInvoices) {
          const invoices = JSON.parse(existingGenericInvoices);
          const updatedList = invoices.map((inv: any) =>
            inv.invoiceId === invoice.invoiceId
              ? { ...inv, status: 'paid', paidAt: now, paidBy: currentWallet, txHash: result.txHash, paymentId: result.paymentId, paidToken: tokenSymbol, paidAmount: amount }
              : inv
          );
          localStorage.setItem(genericInvoicesKey, JSON.stringify(updatedList));
        }

        // Store in payments history for analytics
        const paymentsHistoryKey = 'bnbpay_payments_history';
        const paymentsHistory = JSON.parse(localStorage.getItem(paymentsHistoryKey) || '[]');
        paymentsHistory.unshift(paymentRecord);
        // Keep last 100 payments
        if (paymentsHistory.length > 100) paymentsHistory.pop();
        localStorage.setItem(paymentsHistoryKey, JSON.stringify(paymentsHistory));

        // Update invoice state
        setInvoice(updatedInvoice);

        // Show receipt
        setShowReceipt(true);
      } catch (e) {
        console.error('Failed to update invoice in localStorage:', e);
      }
    } catch (err: any) {
      console.error('Payment failed:', err);
      setPaymentStatus('failed');

      // User rejected transaction
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setError('Transaction rejected by user');
      } else if (err.message?.includes('insufficient funds')) {
        setError('Insufficient funds for this transaction');
      } else if (err.message?.includes('allowance')) {
        setError('Token approval failed. Please try again.');
      } else {
        setError(err.message || 'Payment failed. Please try again.');
      }
    }
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (loading) {
    return (
      <>
        <FloatingParticles />
        <div className="min-h-screen bg-bnb-dark flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-bnb-yellow border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-400">Loading invoice...</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !invoice) {
    return (
      <>
        <FloatingParticles />
        <div className="min-h-screen bg-bnb-dark flex items-center justify-center">
          <div className="text-center max-w-md mx-auto px-6">
            <svg className="w-20 h-20 mx-auto text-red-400/50 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
            <h2 className="text-2xl font-bold text-white mb-4">Invoice Not Found</h2>
            <p className="text-gray-400 mb-6">{error}</p>
            <a
              href="/"
              className="inline-flex items-center space-x-2 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold px-6 py-3 rounded-xl transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              <span>Go Home</span>
            </a>
          </div>
        </div>
      </>
    );
  }

  if (!invoice) return null;

  const merchantAddress = invoice.merchantAddress || invoice.payeeWalletAddress || '';
  const paymentAmount = invoice.paymentAmount || invoice.amount;
  const paymentToken = invoice.paymentToken || invoice.settlement || 'BNB';
  const allowedTokens = (invoice as any).allowedTokens || getTokensForNetwork(network);

  // Payment Success Screen
  if (paymentStatus === 'paid') {
    const displayPaidToken = paidToken || paymentToken;
    const displayPaidAmount = paidAmount || paymentAmount;

    return (
      <>
        <FloatingParticles />
        {/* Receipt Modal */}
        {showReceipt && txHash && (
          <PaymentReceipt
            invoiceId={invoice.invoiceId || ''}
            description={invoice.description || 'Payment'}
            amount={paymentAmount}
            token={paymentToken}
            paidToken={displayPaidToken}
            paidAmount={displayPaidAmount}
            merchantAddress={merchantAddress}
            merchantName={(invoice as any).merchantName}
            payerAddress={walletAddress || ''}
            txHash={txHash}
            network={network}
            paidAt={paidAt || Date.now()}
            onClose={() => setShowReceipt(false)}
          />
        )}
        <div className="min-h-screen bg-bnb-dark content-wrapper flex items-center justify-center relative">
          {/* Background glow */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl"></div>
            <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-bnb-yellow/5 rounded-full blur-3xl"></div>
          </div>

          <div className={`max-w-md mx-auto px-6 text-center relative z-10 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Success Icon */}
            <div className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-12 h-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path>
              </svg>
            </div>

            <h1 className="text-3xl font-bold text-white mb-2">Payment Successful!</h1>
            <p className="text-gray-400 mb-8">Your payment has been sent to the merchant.</p>

            {/* Payment Details */}
            <div className="card-shadow rounded-2xl p-6 mb-6">
              <div className="flex items-center justify-center space-x-3 mb-4">
                <span className="text-4xl font-bold text-green-500">{displayPaidAmount}</span>
                <img
                  src={getTokenImagePath(displayPaidToken)}
                  alt={displayPaidToken}
                  className="h-10 w-10 rounded-full"
                />
              </div>
              {displayPaidToken !== paymentToken && (
                <p className="text-gray-500 text-xs mb-2">
                  Settled as {paymentAmount} {paymentToken}
                </p>
              )}
              <p className="text-gray-400 text-sm mb-4">Paid to {formatAddress(merchantAddress)}</p>

              {txHash && (
                <a
                  href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/tx/${txHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center space-x-2 text-bnb-yellow hover:text-yellow-500 text-sm"
                >
                  <span>View Transaction</span>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                  </svg>
                </a>
              )}

              {/* Invoice Link - always visible */}
              <div className="mt-4 pt-4 border-t border-bnb-gray/30">
                <p className="text-gray-500 text-xs mb-2">Invoice Link</p>
                <div className="flex items-center space-x-2">
                  <code className="flex-1 bg-bnb-gray/30 text-gray-400 text-xs font-mono px-3 py-2 rounded-lg overflow-hidden text-ellipsis whitespace-nowrap">
                    {window.location.href}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href);
                    }}
                    className="px-3 py-2 bg-bnb-yellow/20 hover:bg-bnb-yellow text-bnb-yellow hover:text-bnb-dark rounded-lg transition-all text-xs font-semibold flex-shrink-0"
                  >
                    Copy
                  </button>
                </div>
              </div>
            </div>

            {/* View Receipt Button */}
            <button
              onClick={() => setShowReceipt(true)}
              className="w-full flex items-center justify-center space-x-2 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold py-4 px-6 rounded-xl transition-all mb-4"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
              </svg>
              <span>View Receipt</span>
            </button>

            <a
              href="/"
              className="inline-flex items-center space-x-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
              </svg>
              <span>Back to Home</span>
            </a>

            {/* Powered by Footer */}
            <div className="mt-12">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <span>Powered by</span>
                <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                  <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Floating Particles Background */}
      <FloatingParticles />

      <div className="min-h-screen bg-bnb-dark content-wrapper relative">
        {/* Background glow effects */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-bnb-yellow/5 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-bnb-yellow/3 rounded-full blur-3xl"></div>
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-bnb-yellow/5 to-transparent rounded-full"></div>
        </div>

        {/* Main Content */}
        <main className="relative z-10 min-h-screen flex items-center justify-center px-4 py-8 md:py-12">
          {/* Desktop Layout (lg and up) */}
          <div className={`hidden lg:grid lg:grid-cols-2 gap-8 max-w-5xl w-full ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Left Column - Invoice Details */}
            <div className="space-y-6">
              {/* Header Card */}
              <div className="card-shadow rounded-2xl overflow-hidden">
                <div className="bg-gradient-to-r from-bnb-yellow/20 to-bnb-yellow/5 p-6 border-b border-bnb-gray">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-12 h-12 bg-bnb-yellow/20 rounded-xl flex items-center justify-center">
                        <svg className="w-6 h-6 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                      </div>
                      <div>
                        <span className="text-bnb-yellow font-semibold text-sm">Invoice Payment</span>
                        <p className="text-gray-500 text-xs">{network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}</p>
                      </div>
                    </div>
                    <img src="/bnbpay-logo.png" alt="BNBPay" className="h-10 w-auto" />
                  </div>
                  <h1 className="text-2xl font-bold text-white">{invoice.description}</h1>
                  {invoice.dueDate && (
                    <p className="text-gray-400 text-sm mt-2">Due: {invoice.dueDate}</p>
                  )}
                </div>

                {/* Amount Display */}
                <div className="p-8 text-center bg-gradient-to-b from-bnb-gray/20 to-transparent">
                  <p className="text-gray-400 text-sm mb-3">Amount Due</p>
                  <div className="flex items-center justify-center space-x-4">
                    <span className="text-6xl font-bold text-white">{paymentAmount}</span>
                    <div className="flex flex-col items-center">
                      <img
                        src={getTokenImagePath(paymentToken)}
                        alt={paymentToken}
                        className="h-14 w-14 rounded-full mb-1"
                      />
                      <span className="text-lg font-semibold text-gray-300">{getTokenDisplayName(paymentToken)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Invoice Details Card */}
              <div className="card-shadow rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Invoice Details
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-bnb-gray/20 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Invoice ID</p>
                    <p className="text-white font-mono text-sm truncate">{invoice.invoiceId}</p>
                  </div>
                  <div className="p-3 bg-bnb-gray/20 rounded-xl">
                    <p className="text-gray-500 text-xs mb-1">Created</p>
                    <p className="text-white text-sm">{formatDate(invoice.createdAt)}</p>
                  </div>
                  <div className="p-3 bg-bnb-gray/20 rounded-xl col-span-2">
                    <p className="text-gray-500 text-xs mb-1">Merchant Address</p>
                    <div className="flex items-center justify-between">
                      <p className="text-white font-mono text-sm">{merchantAddress}</p>
                      <a
                        href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/address/${merchantAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-bnb-yellow hover:text-yellow-500 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                        </svg>
                      </a>
                    </div>
                  </div>
                  {invoice.customer?.name && (
                    <div className="p-3 bg-bnb-gray/20 rounded-xl">
                      <p className="text-gray-500 text-xs mb-1">Customer</p>
                      <p className="text-white text-sm">{invoice.customer.name}</p>
                    </div>
                  )}
                  {invoice.payeeWalletAddress && (
                    <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20 col-span-2">
                      <p className="text-amber-500 text-xs mb-1">Payer</p>
                      <div className="flex items-center justify-between">
                        <p className="text-amber-400 font-mono text-sm">{invoice.payeeWalletAddress}</p>
                        <a
                          href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/address/${invoice.payeeWalletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-500 hover:text-amber-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                          </svg>
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Payee Restriction Notice (Desktop) */}
              {invoice.payeeWalletAddress && (
                <div className="card-shadow rounded-2xl p-5 bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-500 font-semibold text-sm mb-1">Restricted Payment</p>
                      <p className="text-amber-400/80 text-xs mb-2">This invoice can only be paid by:</p>
                      <code className="block bg-bnb-dark/50 px-3 py-2 rounded-lg text-amber-400 font-mono text-xs break-all">
                        {invoice.payeeWalletAddress}
                      </code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Right Column - Payment Action */}
            <div className="space-y-6">
              {/* QR Code Card */}
              <div className="card-shadow rounded-2xl p-6">
                <div className="flex flex-col items-center text-center mb-6">
                  <p className="text-white font-semibold mb-1">Scan to Pay</p>
                  <p className="text-gray-500 text-xs mb-4">Scan with any camera app to open payment page</p>
                  <div className="bg-white p-4 rounded-2xl shadow-lg">
                    <canvas
                      ref={qrCanvasDesktopRef}
                      style={{ width: '200px', height: '200px', display: 'block' }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs mt-3">Pay to: <span className="font-mono">{formatAddress(merchantAddress)}</span></p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={window.location.href}
                      readOnly
                      className="flex-1 px-3 py-2.5 bg-bnb-gray border border-bnb-gray text-gray-400 text-xs font-mono rounded-xl truncate"
                    />
                    <button
                      onClick={copyLink}
                      className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                        linkCopied
                          ? 'bg-green-500 text-white'
                          : 'bg-bnb-yellow text-bnb-dark hover:bg-yellow-500'
                      }`}
                    >
                      {linkCopied ? 'Copied!' : 'Copy Link'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Token Selection Card */}
              <div className="card-shadow rounded-2xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                  <svg className="w-5 h-5 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Pay With
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {allowedTokens.map((token: string) => {
                    const amount = getPaymentAmountInToken(token as Token);
                    const isSelected = selectedPayToken === token;
                    return (
                      <button
                        key={token}
                        onClick={() => setSelectedPayToken(token as Token)}
                        className={`p-4 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-bnb-yellow bg-bnb-yellow/10'
                            : 'border-bnb-gray bg-bnb-gray/20 hover:border-bnb-yellow/50'
                        }`}
                      >
                        <div className="flex items-center space-x-3">
                          <img
                            src={getTokenImagePath(token)}
                            alt={token}
                            className="h-8 w-8 rounded-full"
                          />
                          <div className="text-left">
                            <p className={`font-bold ${isSelected ? 'text-bnb-yellow' : 'text-white'}`}>
                              {amount}
                            </p>
                            <p className="text-gray-400 text-xs">{token}</p>
                          </div>
                        </div>
                        {isSelected && (
                          <div className="mt-2 flex items-center justify-center">
                            <svg className="w-4 h-4 text-bnb-yellow" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                            </svg>
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
                {selectedPayToken !== paymentToken && (
                  <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="flex items-start space-x-2">
                      <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <div className="text-xs">
                        <p className="text-amber-400 font-semibold mb-1">Different Token Selected</p>
                        <p className="text-amber-400/80">
                          Merchant requested <strong>{paymentAmount} {paymentToken}</strong> but will receive <strong>{getPaymentAmountInToken(selectedPayToken)} {selectedPayToken}</strong>.
                        </p>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-gray-500 text-xs mt-3 text-center">
                  Invoice requested: {paymentAmount} {paymentToken}
                </p>
              </div>

              {/* BNB Gas Info - Native payments always need gas */}
              {selectedPayToken === 'BNB' && (
                <div className="card-shadow rounded-2xl p-6">
                  <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 bg-amber-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-500 font-semibold text-sm mb-1">Native BNB Payment</p>
                      <p className="text-gray-400 text-xs">
                        Native BNB transfers always require gas to be paid by the sender. This is a blockchain limitation.
                        For gasless payments, switch to ERC20 tokens like USDT, USDC, USD1, WUSD, or XUSD.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Mode Toggle (Gas vs Gasless) - Show for ERC20 tokens */}
              {selectedPayToken !== 'BNB' && (
                <div className="card-shadow rounded-2xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center">
                    <svg className="w-5 h-5 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                    Payment Mode {!walletAddress && <span className="text-xs text-gray-400 ml-2">(Connect wallet to enable)</span>}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {/* Pay with Gas */}
                    <button
                      onClick={() => setPaymentMode('gas')}
                      disabled={!walletAddress}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMode === 'gas'
                          ? 'border-bnb-yellow bg-bnb-yellow/10'
                          : 'border-bnb-gray bg-bnb-gray/20 hover:border-bnb-yellow/50'
                      } ${!walletAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex flex-col items-center">
                        <svg className={`w-8 h-8 mb-2 ${paymentMode === 'gas' ? 'text-bnb-yellow' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V6a2 2 0 012-2h6a2 2 0 012 2v2z"></path>
                        </svg>
                        <p className={`font-bold text-sm ${paymentMode === 'gas' ? 'text-bnb-yellow' : 'text-white'}`}>
                          Pay with Gas
                        </p>
                        <p className="text-gray-400 text-xs mt-1">You pay gas</p>
                      </div>
                      {paymentMode === 'gas' && (
                        <div className="mt-2 flex items-center justify-center">
                          <svg className="w-4 h-4 text-bnb-yellow" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                          </svg>
                        </div>
                      )}
                    </button>

                    {/* Gasless Payment */}
                    <button
                      onClick={() => setPaymentMode('gasless')}
                      disabled={!walletAddress || (!supportsPermit && !permit2Approved)}
                      className={`p-4 rounded-xl border-2 transition-all ${
                        paymentMode === 'gasless'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-bnb-gray bg-bnb-gray/20 hover:border-green-500/50'
                      } ${(!walletAddress || (!supportsPermit && !permit2Approved)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title={!walletAddress ? 'Connect wallet first' : (!supportsPermit && !permit2Approved) ? 'Requires Permit2 approval or EIP-2612 support' : 'Pay with gasless relay'}
                    >
                      <div className="flex flex-col items-center">
                        <svg className={`w-8 h-8 mb-2 ${paymentMode === 'gasless' ? 'text-green-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                        <p className={`font-bold text-sm ${paymentMode === 'gasless' ? 'text-green-500' : 'text-white'}`}>
                          Gasless
                        </p>
                        <p className="text-gray-400 text-xs mt-1">Relayer pays gas</p>
                      </div>
                      {paymentMode === 'gasless' && (
                        <div className="mt-2 flex items-center justify-center">
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                          </svg>
                        </div>
                      )}
                    </button>
                  </div>

                  {/* Gasless info/warnings */}
                  {walletAddress && !supportsPermit && !permit2Approved && (
                    <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                      <div className="flex items-start space-x-2">
                        <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <div className="flex-1">
                          <p className="text-amber-400 text-xs font-semibold mb-1">
                            Permit2 Approval Required for Gasless
                          </p>
                          <p className="text-amber-300/80 text-xs">
                            To use gasless payments with {selectedPayToken}, you need to approve Permit2 first (one-time setup per token).
                            Use <span className="font-semibold">"Pay with Gas"</span> mode or approve Permit2 to enable gasless.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {walletAddress && (supportsPermit || permit2Approved) && (
                    <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <div className="flex items-start space-x-2">
                        <svg className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="text-green-400 text-xs">
                          ✨ {selectedPayToken} supports gasless payments! {supportsEip3009 ? 'EIP-3009 (TransferWithAuthorization) enabled.' : supportsEip2612 ? 'EIP-2612 permit enabled.' : 'Permit2 approved.'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Gasless info/warnings */}
                  {!walletAddress && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div className="flex items-start space-x-2">
                        <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                        </svg>
                        <p className="text-blue-400 text-xs">
                          Connect your wallet to choose payment mode. {selectedPayToken} supports both gas and gasless options.
                        </p>
                      </div>
                    </div>
                  )}

                  {checkingPermit2 && walletAddress && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-blue-400 text-xs text-center flex items-center justify-center">
                        <svg className="animate-spin w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        Checking gasless support...
                      </p>
                    </div>
                  )}

                  {!checkingPermit2 && !supportsPermit && !permit2Approved && walletAddress && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <div className="flex flex-col space-y-2">
                        <div className="flex items-start space-x-2">
                          <svg className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                          </svg>
                          <div className="flex-1">
                            <p className="text-blue-400 text-xs mb-2">
                              <strong>Gasless payments:</strong> To enable gasless payments for this token, you need to approve Permit2 (one-time setup).
                            </p>
                            <button
                              onClick={async () => {
                                try {
                                  setCheckingPermit2(true);
                                  const config = NETWORKS[network];
                                  const tokens = config.tokens as Record<string, string>;
                                  const tokenAddress = tokens[selectedPayToken] || tokens[selectedPayToken.toUpperCase()];

                                  const signer = await getSigner();
                                  await approvePermit2(tokenAddress, signer);

                                  // Recheck gasless support
                                  const provider = getProvider();
                                  if (provider && walletAddress) {
                                    const isApproved = await isPermit2Approved(tokenAddress, walletAddress, provider);
                                    setPermit2Approved(isApproved);
                                    setSupportsPermit(isApproved);
                                    if (isApproved) {
                                      setPaymentMode('gasless'); // Auto-switch to gasless mode
                                    }
                                  }

                                  alert('✅ Permit2 approved! Gasless payments are now enabled for this token.');
                                } catch (error: any) {
                                  console.error('Failed to approve Permit2:', error);

                                  // Handle different error types
                                  let errorMsg = 'Failed to approve Permit2';
                                  if (error.code === 4001 || error.code === 'ACTION_REJECTED') {
                                    errorMsg = 'Transaction rejected. You can still pay using "Pay with Gas" mode.';
                                  } else if (error.message) {
                                    errorMsg = `Failed to approve Permit2: ${error.message}`;
                                  }

                                  setError(errorMsg);
                                  setTimeout(() => setError(null), 5000); // Clear error after 5s
                                } finally {
                                  setCheckingPermit2(false);
                                }
                              }}
                              disabled={checkingPermit2}
                              className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white text-xs rounded-lg font-semibold transition-all disabled:cursor-not-allowed flex items-center space-x-2"
                            >
                              {checkingPermit2 ? (
                                <>
                                  <svg className="animate-spin w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                  </svg>
                                  <span>Approving...</span>
                                </>
                              ) : (
                                <span>Approve Permit2 for {selectedPayToken}</span>
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {supportsPermit && !checkingPermit2 && (
                    <div className="mt-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                      <div className="flex items-start space-x-2">
                        <svg className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <p className="text-green-400 text-xs">
                          {permit2Approved ? 'Gasless ready: Permit2 approved' : supportsEip3009 ? 'Gasless ready: Token supports EIP-3009' : 'Gasless ready: Token supports EIP-2612'}
                        </p>
                      </div>
                    </div>
                  )}

                  {paymentMode === 'gasless' && (
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                      <p className="text-blue-400 text-xs">
                        <strong>Gasless payment:</strong> {supportsEip3009 ? 'Sign a transfer authorization message (EIP-3009).' : 'Sign a permit message to authorize payment.'} No approve transaction needed, relayer pays all gas.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Pay Button Card */}
              <div className="card-shadow rounded-2xl p-6">
                {paymentStatus === 'failed' && error && (
                  <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm text-center">{error}</p>
                  </div>
                )}

                {walletAddress && invoice.payeeWalletAddress &&
                 walletAddress.toLowerCase() !== invoice.payeeWalletAddress.toLowerCase() && (
                  <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400 text-sm text-center">
                      <span className="font-semibold">Wrong wallet connected.</span><br />
                      <span className="text-xs">Please connect wallet: {formatAddress(invoice.payeeWalletAddress)}</span>
                    </p>
                  </div>
                )}

                {/* Connect Wallet Button - Show prominently when not connected */}
                {!walletAddress ? (
                  <button
                    onClick={async () => {
                      try {
                        const address = await connectWallet(network);
                        setWalletAddress(address);
                      } catch (err) {
                        console.error('Failed to connect wallet:', err);
                        setError('Failed to connect wallet. Please try again.');
                      }
                    }}
                    className="w-full flex items-center justify-center space-x-3 bg-gradient-to-r from-bnb-yellow to-yellow-500 hover:from-yellow-500 hover:to-bnb-yellow text-bnb-dark font-bold text-lg py-5 px-6 rounded-xl transition-all hover:scale-[1.02] shadow-lg"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
                    </svg>
                    <span>Connect Wallet to Pay</span>
                  </button>
                ) : (
                  <button
                    onClick={handlePayNow}
                    disabled={paymentStatus === 'processing'}
                    className="w-full flex items-center justify-center space-x-3 bg-bnb-yellow hover:bg-yellow-500 disabled:bg-bnb-yellow/50 text-bnb-dark font-bold text-lg py-5 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed shadow-lg"
                  >
                    {paymentStatus === 'processing' ? (
                      <>
                        <div className="w-6 h-6 border-3 border-bnb-dark border-t-transparent rounded-full animate-spin"></div>
                        <span>Processing...</span>
                      </>
                    ) : (
                      <>
                        <span>
                          Pay {getPaymentAmountInToken(selectedPayToken)} {selectedPayToken}
                          {selectedPayToken !== 'BNB' && paymentMode === 'gasless' && ' (Gasless)'}
                        </span>
                        <img src="/2.png" alt="Coin" className="h-10 w-10" />
                      </>
                    )}
                  </button>
                )}

                {!walletAddress && (
                  <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                    <div className="flex items-center justify-center space-x-2 text-sm text-blue-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                      <span>Connect your wallet first to enable payment options</span>
                    </div>
                  </div>
                )}
                {walletAddress && invoice.payeeWalletAddress &&
                 walletAddress.toLowerCase() === invoice.payeeWalletAddress.toLowerCase() && (
                  <p className="text-green-500 text-sm text-center mt-4 flex items-center justify-center">
                    <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"></path>
                    </svg>
                    Authorized wallet connected
                  </p>
                )}
              </div>

              {/* Agent/MCP Panel */}
              <AgentFlowPanel data={invoice} walletAddress={walletAddress} network={network} />

              {/* Powered by Footer */}
              <div className="text-center">
                <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                  <span>Powered by</span>
                  <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                    <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-center space-x-1 text-xs text-gray-600">
                  <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                  </svg>
                  <span>Secured by BNB Chain</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Layout (below lg) */}
          <div className={`lg:hidden max-w-lg w-full ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Invoice Payment Card */}
            <div className="card-shadow rounded-2xl overflow-hidden">
              {/* Header */}
              <div className="bg-gradient-to-r from-bnb-yellow/20 to-bnb-yellow/5 p-6 border-b border-bnb-gray">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <svg className="w-6 h-6 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                    </svg>
                    <span className="text-bnb-yellow font-semibold">Invoice Payment</span>
                  </div>
                  <img src="/bnbpay-logo.png" alt="BNBPay" className="h-8 w-auto" />
                </div>
                <h1 className="text-xl font-bold text-white">{invoice.description}</h1>
                {invoice.dueDate && (
                  <p className="text-gray-400 text-sm mt-1">Due: {invoice.dueDate}</p>
                )}
              </div>

              {/* Amount Section */}
              <div className="p-8 text-center border-b border-bnb-gray">
                <p className="text-gray-400 text-sm mb-2">Amount Due</p>
                <div className="flex items-center justify-center space-x-4">
                  <span className="text-5xl font-bold text-white">{paymentAmount}</span>
                  <div className="flex items-center space-x-2">
                    <img
                      src={getTokenImagePath(paymentToken)}
                      alt={paymentToken}
                      className="h-12 w-12 rounded-full"
                    />
                    <span className="text-xl font-semibold text-white">{getTokenDisplayName(paymentToken)}</span>
                  </div>
                </div>
              </div>

              {/* Merchant Info */}
              <div className="p-6 bg-bnb-gray/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-500 text-sm mb-1">Pay to</p>
                    <p className="text-white font-mono">{formatAddress(merchantAddress)}</p>
                  </div>
                  <a
                    href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/address/${merchantAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-bnb-yellow hover:text-yellow-500 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                    </svg>
                  </a>
                </div>
              </div>

              {/* QR Code Section */}
              <div className="p-6 border-t border-bnb-gray">
                <div className="flex flex-col items-center text-center">
                  <p className="text-gray-400 text-sm mb-1">Scan to Pay</p>
                  <p className="text-gray-500 text-xs mb-4">Scan with any camera app to open payment page</p>
                  <div className="bg-white p-3 rounded-xl shadow-lg inline-block">
                    <canvas
                      ref={qrCanvasMobileRef}
                      style={{ width: '160px', height: '160px', display: 'block' }}
                    />
                  </div>
                  <p className="text-gray-500 text-xs mt-3">Pay to: <span className="font-mono">{formatAddress(merchantAddress)}</span></p>
                </div>
                <div className="mt-4 flex items-center space-x-2">
                  <input
                    type="text"
                    value={window.location.href}
                    readOnly
                    className="flex-1 px-3 py-2 bg-bnb-gray border border-bnb-gray text-gray-400 text-xs font-mono rounded-lg truncate"
                  />
                  <button
                    onClick={copyLink}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                      linkCopied
                        ? 'bg-green-500 text-white'
                        : 'bg-bnb-yellow text-bnb-dark hover:bg-yellow-500'
                    }`}
                  >
                    {linkCopied ? 'Copied!' : 'Copy Link'}
                  </button>
                </div>
              </div>

              {/* Token Selection (Mobile) */}
              <div className="p-6 border-t border-bnb-gray">
                <h3 className="text-md font-semibold text-white mb-3 flex items-center">
                  <svg className="w-4 h-4 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  Pay With
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {allowedTokens.map((token: string) => {
                    const amount = getPaymentAmountInToken(token as Token);
                    const isSelected = selectedPayToken === token;
                    return (
                      <button
                        key={token}
                        onClick={() => setSelectedPayToken(token as Token)}
                        className={`p-3 rounded-lg border-2 transition-all ${
                          isSelected
                            ? 'border-bnb-yellow bg-bnb-yellow/10'
                            : 'border-bnb-gray bg-bnb-gray/20 hover:border-bnb-yellow/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2">
                          <img
                            src={getTokenImagePath(token)}
                            alt={token}
                            className="h-6 w-6 rounded-full"
                          />
                          <div className="text-left">
                            <p className={`text-sm font-bold ${isSelected ? 'text-bnb-yellow' : 'text-white'}`}>
                              {amount}
                            </p>
                            <p className="text-gray-400 text-xs">{token}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {selectedPayToken !== paymentToken && (
                  <div className="mt-3 p-2 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                    <p className="text-amber-400/80 text-xs text-center">
                      <strong className="text-amber-400">Note:</strong> Merchant will receive {getPaymentAmountInToken(selectedPayToken)} {selectedPayToken}
                    </p>
                  </div>
                )}
                <p className="text-gray-500 text-xs mt-2 text-center">
                  Invoice requested: {paymentAmount} {paymentToken}
                </p>
              </div>

              {/* BNB Gas Info (Mobile) */}
              {selectedPayToken === 'BNB' && (
                <div className="p-6 border-t border-bnb-gray">
                  <div className="flex items-start space-x-2">
                    <div className="w-8 h-8 bg-amber-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-amber-500 font-semibold text-xs mb-1">Native BNB Payment</p>
                      <p className="text-gray-400 text-xs">
                        Native BNB transfers always require gas. For gasless, use USDT, USDC, USD1, WUSD, or XUSD.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Payment Mode Toggle (Mobile) - Show for ERC20 tokens */}
              {selectedPayToken !== 'BNB' && (
                <div className="p-6 border-t border-bnb-gray">
                  <h3 className="text-md font-semibold text-white mb-3 flex items-center">
                    <svg className="w-4 h-4 text-bnb-yellow mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                    </svg>
                    Payment Mode
                    {!walletAddress && <span className="text-xs text-gray-400 ml-2">(Connect wallet)</span>}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {/* Pay with Gas */}
                    <button
                      onClick={() => setPaymentMode('gas')}
                      disabled={!walletAddress}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        paymentMode === 'gas'
                          ? 'border-bnb-yellow bg-bnb-yellow/10'
                          : 'border-bnb-gray bg-bnb-gray/20'
                      } ${!walletAddress ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex flex-col items-center">
                        <svg className={`w-6 h-6 mb-1 ${paymentMode === 'gas' ? 'text-bnb-yellow' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a2 2 0 01-2-2V6a2 2 0 012-2h6a2 2 0 012 2v2z"></path>
                        </svg>
                        <p className={`text-xs font-bold ${paymentMode === 'gas' ? 'text-bnb-yellow' : 'text-white'}`}>
                          Pay with Gas
                        </p>
                        <p className="text-gray-400 text-xs">You pay</p>
                      </div>
                    </button>

                    {/* Gasless */}
                    <button
                      onClick={() => setPaymentMode('gasless')}
                      disabled={!walletAddress || (!supportsPermit && !permit2Approved)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        paymentMode === 'gasless'
                          ? 'border-green-500 bg-green-500/10'
                          : 'border-bnb-gray bg-bnb-gray/20'
                      } ${!walletAddress || (!supportsPermit && !permit2Approved) ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex flex-col items-center">
                        <svg className={`w-6 h-6 mb-1 ${paymentMode === 'gasless' ? 'text-green-500' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                        </svg>
                        <p className={`text-xs font-bold ${paymentMode === 'gasless' ? 'text-green-500' : 'text-white'}`}>
                          Gasless
                        </p>
                        <p className="text-gray-400 text-xs">Relayer pays</p>
                      </div>
                    </button>
                  </div>

                  {/* Status indicators */}
                  {!walletAddress && (
                    <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-blue-400 text-xs text-center">
                        Connect wallet to choose payment mode
                      </p>
                    </div>
                  )}

                  {checkingPermit2 && walletAddress && (
                    <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-blue-400 text-xs text-center flex items-center justify-center">
                        <svg className="animate-spin w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                        </svg>
                        Checking...
                      </p>
                    </div>
                  )}

                  {!checkingPermit2 && !supportsPermit && !permit2Approved && walletAddress && (
                    <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg space-y-2">
                      <p className="text-blue-400 text-xs text-center">
                        Enable gasless by approving Permit2
                      </p>
                      <button
                        onClick={async () => {
                          try {
                            const config = NETWORKS[network];
                            const tokens = config.tokens as Record<string, string>;
                            const tokenAddress = tokens[selectedPayToken] || tokens[selectedPayToken.toUpperCase()];

                            const signer = await getSigner();
                            await approvePermit2(tokenAddress, signer);
                            alert('Permit2 approved! Gasless payments enabled.');
                            // Recheck gasless support
                            const provider = getProvider();
                            if (provider && walletAddress) {
                              const isApproved = await isPermit2Approved(tokenAddress, walletAddress, provider);
                              setPermit2Approved(isApproved);
                              setSupportsPermit(isApproved);
                            }
                          } catch (error: any) {
                            console.error('Failed to approve Permit2:', error);
                            alert(`Failed: ${error.message || 'Unknown error'}`);
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg font-semibold transition-all"
                      >
                        Approve Permit2
                      </button>
                    </div>
                  )}

                  {supportsPermit && !checkingPermit2 && (
                    <div className="mt-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <p className="text-green-400 text-xs text-center">
                        ✓ Gasless ready
                      </p>
                    </div>
                  )}

                  {paymentMode === 'gasless' && (
                    <div className="mt-2 p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-blue-400 text-xs text-center">
                        Sign permit message, relayer pays gas
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Pay Button */}
              <div className="p-6 border-t border-bnb-gray">
                {paymentStatus === 'failed' && error && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                    <p className="text-red-400 text-sm text-center">{error}</p>
                  </div>
                )}

                <button
                  onClick={handlePayNow}
                  disabled={paymentStatus === 'processing'}
                  className="w-full flex items-center justify-center space-x-3 bg-bnb-yellow hover:bg-yellow-500 disabled:bg-bnb-yellow/50 text-bnb-dark font-bold text-lg py-4 px-6 rounded-xl transition-all hover:scale-[1.02] disabled:hover:scale-100 disabled:cursor-not-allowed"
                >
                  {paymentStatus === 'processing' ? (
                    <>
                      <div className="w-6 h-6 border-3 border-bnb-dark border-t-transparent rounded-full animate-spin"></div>
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        Pay {getPaymentAmountInToken(selectedPayToken)} {selectedPayToken}
                        {selectedPayToken !== 'BNB' && paymentMode === 'gasless' && ' (Gasless)'}
                      </span>
                      <img src="/2.png" alt="Coin" className="h-10 w-10" />
                    </>
                  )}
                </button>

                {!walletAddress && (
                  <p className="text-gray-500 text-sm text-center mt-3">
                    Connect your wallet to pay
                  </p>
                )}
                {walletAddress && invoice.payeeWalletAddress &&
                 walletAddress.toLowerCase() !== invoice.payeeWalletAddress.toLowerCase() && (
                  <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
                    <p className="text-amber-400 text-sm text-center">
                      <span className="font-semibold">Wrong wallet connected.</span><br />
                      <span className="text-xs">Please connect wallet: {formatAddress(invoice.payeeWalletAddress)}</span>
                    </p>
                  </div>
                )}
                {walletAddress && invoice.payeeWalletAddress &&
                 walletAddress.toLowerCase() === invoice.payeeWalletAddress.toLowerCase() && (
                  <p className="text-green-500 text-sm text-center mt-3">
                    Authorized wallet connected
                  </p>
                )}
              </div>

              {/* Payee Restriction Notice */}
              {invoice.payeeWalletAddress && (
                <div className="p-4 bg-amber-500/10 border-t border-amber-500/30">
                  <div className="flex items-start space-x-3">
                    <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                    <div className="flex-1">
                      <p className="text-amber-500 font-semibold text-sm mb-1">Restricted Payment</p>
                      <p className="text-amber-400/80 text-xs mb-2">This invoice can only be paid by the specified wallet address:</p>
                      <div className="flex items-center space-x-2">
                        <code className="bg-bnb-dark/50 px-3 py-1.5 rounded-lg text-amber-400 font-mono text-xs">
                          {invoice.payeeWalletAddress}
                        </code>
                        <a
                          href={`${network === 'mainnet' ? 'https://bscscan.com' : 'https://testnet.bscscan.com'}/address/${invoice.payeeWalletAddress}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-amber-500 hover:text-amber-400 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                          </svg>
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Invoice Details */}
              <div className="p-6 border-t border-bnb-gray bg-bnb-gray/10">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500 mb-1">Invoice ID</p>
                    <p className="text-white font-mono text-xs">{invoice.invoiceId?.slice(0, 20)}...</p>
                  </div>
                  <div>
                    <p className="text-gray-500 mb-1">Created</p>
                    <p className="text-white">{formatDate(invoice.createdAt)}</p>
                  </div>
                  {invoice.customer?.name && (
                    <div>
                      <p className="text-gray-500 mb-1">Customer</p>
                      <p className="text-white">{invoice.customer.name}</p>
                    </div>
                  )}
                  {invoice.payeeWalletAddress && (
                    <div>
                      <p className="text-gray-500 mb-1">Payee Wallet</p>
                      <p className="text-amber-400 font-mono text-xs">{formatAddress(invoice.payeeWalletAddress)}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-gray-500 mb-1">Network</p>
                    <p className="text-white">{network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Agent/MCP Panel */}
            <div className="mt-8">
              <AgentFlowPanel data={invoice} walletAddress={walletAddress} network={network} />
            </div>

            {/* Powered by Footer */}
            <div className="text-center mt-12">
              <div className="flex items-center justify-center space-x-2 text-sm text-gray-500">
                <span>Powered by</span>
                <div className="bg-bnb-gray/50 rounded-full px-4 py-2 border border-bnb-yellow/10">
                  <img src="/pepaylabs.png" alt="Pepay Labs" className="h-5 w-auto opacity-90" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-center space-x-1 text-xs text-gray-600">
                <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                </svg>
                <span>Secured by BNB Chain</span>
              </div>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
