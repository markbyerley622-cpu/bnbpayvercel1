/**
 * Customer Header Component
 *
 * BNB Pay navbar for customers paying invoices/subscriptions.
 * Features:
 * - Connect Wallet button with MetaMask integration
 * - Receipt History link (replaces History/Calendar for payers)
 * - Testnet/Mainnet toggle based on merchant settings
 * - Same visual design as main header
 */

import { useState } from 'react';
import { WalletConnectButton } from './WalletConnection';
import type { NetworkType } from '../lib/web3';

interface CustomerHeaderProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  onWalletChanged?: (address: string | null) => void;
  walletAddress?: string | null;
  onOpenReceiptHistory?: () => void;
  title?: string;
  merchantName?: string;
  /** If true, shows network toggle. If false, network is read-only (merchant-set) */
  allowNetworkChange?: boolean;
}

export function CustomerHeader({
  network,
  onNetworkChange,
  onWalletChanged,
  // walletAddress and onOpenReceiptHistory kept for API compatibility
  // but header now uses direct link to /receipt-history.html
  walletAddress: _walletAddress,
  onOpenReceiptHistory: _onOpenReceiptHistory,
  title,
  merchantName,
  allowNetworkChange: _allowNetworkChange = true,
}: CustomerHeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const allowNetworkChange = _allowNetworkChange;
  // Suppress unused variable warnings
  void _walletAddress;
  void _onOpenReceiptHistory;

  return (
    <header className="bg-bnb-dark/80 backdrop-blur-md border-b border-bnb-yellow/10 py-4 px-4 md:px-6 sticky top-0 z-[200] animate-fade-in">
      <div className="max-w-7xl mx-auto">
        {/* Desktop Header */}
        <div className="flex items-center justify-between">
          {/* Left: Logo and Nav */}
          <div className="flex items-center space-x-4 md:space-x-6">
            <a href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <img src="/10.png" alt="BNB Pay" className="h-8 md:h-10 w-auto" />
            </a>

            {/* Title or Merchant Name */}
            {merchantName && (
              <div className="hidden sm:flex items-center space-x-2">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Paying to</span>
                <span className="text-lg font-bold text-white">{merchantName}</span>
              </div>
            )}
            {title && !merchantName && (
              <h1 className="hidden sm:block text-lg md:text-2xl font-bold text-white">{title}</h1>
            )}

          </div>

          {/* Right: Wallet + Network + Status */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Desktop: Full controls */}
            <div className="hidden md:flex items-center space-x-4">
              {/* Wallet Connect */}
              <WalletConnectButton
                network={network}
                onConnect={onWalletChanged || undefined}
                onDisconnect={() => onWalletChanged?.(null)}
                onNetworkChange={allowNetworkChange ? onNetworkChange : undefined}
              />

              {/* Network indicator - highlights active network */}
              <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                network === 'mainnet'
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-bnb-yellow/20 border border-bnb-yellow/30'
              }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-green-500' : 'bg-bnb-yellow'}`}></div>
                <span className={`text-sm font-semibold ${network === 'mainnet' ? 'text-green-400' : 'text-bnb-yellow'}`}>
                  {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
                </span>
              </div>
            </div>

            {/* Mobile: Compact wallet */}
            <div className="md:hidden">
              <WalletConnectButton
                network={network}
                onConnect={onWalletChanged || undefined}
                onDisconnect={() => onWalletChanged?.(null)}
                onNetworkChange={allowNetworkChange ? onNetworkChange : undefined}
                compact
              />
            </div>

            {/* Mobile: Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-bnb-yellow transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-bnb-gray animate-slide-up">
            {/* Mobile Title */}
            {merchantName && (
              <div className="mb-4 sm:hidden">
                <span className="text-xs text-gray-500 uppercase tracking-wide">Paying to</span>
                <p className="text-lg font-bold text-white mt-1">{merchantName}</p>
              </div>
            )}
            {title && !merchantName && (
              <h1 className="text-xl font-bold text-white mb-4 sm:hidden">{title}</h1>
            )}

            {/* Mobile Navigation */}
            <nav className="space-y-3 mb-4">
              <a
                href="/"
                className="flex items-center space-x-3 text-gray-300 hover:text-bnb-yellow transition-colors font-semibold py-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                </svg>
                <span>Home</span>
              </a>
            </nav>

            {/* Mobile Network Status */}
            <div className="py-3 border-t border-bnb-gray flex items-center justify-between">
              <span className="text-sm text-gray-400">Network</span>
              <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg ${
                network === 'mainnet'
                  ? 'bg-green-500/20 border border-green-500/30'
                  : 'bg-bnb-yellow/20 border border-bnb-yellow/30'
              }`}>
                <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-green-500' : 'bg-bnb-yellow'}`}></div>
                <span className={`text-sm font-semibold ${network === 'mainnet' ? 'text-green-400' : 'text-bnb-yellow'}`}>
                  {network === 'mainnet' ? 'Mainnet' : 'Testnet'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

// ============================================================================
// Payment Badge Component (for payment link pages)
// ============================================================================

interface PaymentBadgeProps {
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
}

export function PaymentBadge({ status }: PaymentBadgeProps) {
  const styles = {
    pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
    paid: 'bg-green-500/10 text-green-500 border-green-500/20',
    expired: 'bg-red-500/10 text-red-500 border-red-500/20',
    cancelled: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
  };

  const labels = {
    pending: 'Payment Pending',
    paid: 'Paid',
    expired: 'Expired',
    cancelled: 'Cancelled',
  };

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${styles[status]}`}
    >
      {status === 'paid' && (
        <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            clipRule="evenodd"
          />
        </svg>
      )}
      {labels[status]}
    </span>
  );
}

export default CustomerHeader;
