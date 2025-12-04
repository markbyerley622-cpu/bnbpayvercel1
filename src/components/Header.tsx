import { useState } from 'react';
import { WalletConnect } from './WalletConnect';
import { NetworkToggle } from './NetworkToggle';
import type { NetworkType } from '../lib/web3';

interface HeaderProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  onWalletChanged?: (address: string | null) => void;
  title?: string;
  showNav?: boolean;
}

export function Header({
  network,
  onNetworkChange,
  onWalletChanged,
  title,
  showNav = true
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="bg-bnb-dark/95 backdrop-blur-sm border-b border-bnb-gray py-4 px-4 md:px-6 sticky top-0 z-[200] animate-fade-in">
      <div className="max-w-7xl mx-auto">
        {/* Desktop Header */}
        <div className="flex items-center justify-between">
          {/* Left: Logo and Nav */}
          <div className="flex items-center space-x-4 md:space-x-6">
            <a href="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
              <img src="/10.png" alt="BNB Pay" className="h-8 md:h-10 w-auto" />
            </a>

            {title && (
              <h1 className="text-lg md:text-2xl font-bold text-white hidden sm:block">{title}</h1>
            )}

            {/* Desktop Navigation */}
            {showNav && (
              <nav className="hidden md:flex items-center space-x-4">
                <a
                  href="/history.html"
                  className="flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow transition-colors font-semibold"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>History</span>
                </a>
                <a
                  href="/calendar.html"
                  className="flex items-center space-x-2 text-gray-400 hover:text-bnb-yellow transition-colors font-semibold"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span>Calendar</span>
                </a>
              </nav>
            )}
          </div>

          {/* Right: Wallet, Network, Status */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Desktop: Full controls */}
            <div className="hidden md:flex items-center space-x-4">
              <WalletConnect network={network} onWalletChanged={onWalletChanged} />
              <NetworkToggle network={network} onNetworkChange={onNetworkChange} />
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-green-500' : 'bg-bnb-yellow'}`}></div>
                <span className="text-sm text-gray-400">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
              </div>
            </div>

            {/* Mobile: Compact wallet */}
            <div className="md:hidden">
              <WalletConnect network={network} onWalletChanged={onWalletChanged} compact />
            </div>

            {/* Mobile: Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-gray-400 hover:text-bnb-yellow transition-colors"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path>
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-bnb-gray animate-slide-up">
            {/* Mobile Title */}
            {title && (
              <h1 className="text-xl font-bold text-white mb-4 sm:hidden">{title}</h1>
            )}

            {/* Mobile Navigation */}
            {showNav && (
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
                <a
                  href="/history.html"
                  className="flex items-center space-x-3 text-gray-300 hover:text-bnb-yellow transition-colors font-semibold py-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>Payment History</span>
                </a>
                <a
                  href="/calendar.html"
                  className="flex items-center space-x-3 text-gray-300 hover:text-bnb-yellow transition-colors font-semibold py-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span>Payment Calendar</span>
                </a>
              </nav>
            )}

            {/* Mobile Network Toggle */}
            <div className="py-3 border-t border-bnb-gray">
              <p className="text-xs text-gray-500 mb-2">Network</p>
              <NetworkToggle network={network} onNetworkChange={onNetworkChange} />
            </div>

            {/* Mobile Status */}
            <div className="py-3 border-t border-bnb-gray flex items-center justify-between">
              <span className="text-sm text-gray-400">Status</span>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-green-500' : 'bg-bnb-yellow'}`}></div>
                <span className="text-sm text-bnb-yellow font-semibold">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
