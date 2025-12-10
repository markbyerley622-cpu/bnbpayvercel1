import { useState } from 'react';
import { WalletConnectButton } from './WalletConnection';
import { NetworkToggle } from './NetworkToggle';
import type { NetworkType } from '../lib/web3';

interface HeaderProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
  onWalletChanged?: (address: string | null) => void;
  title?: string;
  showNav?: boolean;
  activePage?: 'home' | 'history' | 'calendar' | 'giftcard-create' | 'giftcard-redeem' | 'giftcard-history';
}

export function Header({
  network,
  onNetworkChange,
  onWalletChanged,
  title,
  showNav = true,
  activePage = 'home'
}: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isGiftCardPage = activePage?.startsWith('giftcard');

  // Navigate function that uses history API for SPA routing
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    setMobileMenuOpen(false);
  };

  return (
    <header className="bg-bnb-dark/80 backdrop-blur-md border-b border-bnb-yellow/10 py-4 px-4 md:px-6 sticky top-0 z-[200] animate-fade-in">
      <div className="max-w-7xl mx-auto">
        {/* Desktop Header */}
        <div className="flex items-center justify-between">
          {/* Left: Logo and Nav */}
          <div className="flex items-center space-x-4 md:space-x-6">
            <button
              onClick={() => navigate('/')}
              className="flex items-center space-x-3 hover:opacity-80 transition-opacity"
            >
              <img src="/10.png" alt="BNB Pay" className="h-8 md:h-10 w-auto" />
            </button>

            {title && (
              <h1 className="text-lg md:text-2xl font-bold text-white hidden sm:block">{title}</h1>
            )}

            {/* Desktop Navigation */}
            {showNav && (
              <nav className="hidden lg:flex items-center space-x-1">
                {/* Main Nav Items */}
                <button
                  onClick={() => navigate('/history.html')}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                    activePage === 'history'
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-400 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>History</span>
                </button>
                <button
                  onClick={() => navigate('/calendar.html')}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                    activePage === 'calendar'
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-400 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span>Calendar</span>
                </button>

                {/* Gift Cards - Single link (no dropdown) */}
                <button
                  onClick={() => navigate('/giftcard/history')}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg transition-colors font-medium ${
                    isGiftCardPage
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-400 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                  <span>Gift Cards</span>
                </button>
              </nav>
            )}
          </div>

          {/* Right: Wallet, Network, Status */}
          <div className="flex items-center space-x-2 md:space-x-4">
            {/* Desktop: Full controls */}
            <div className="hidden md:flex items-center space-x-4">
              <WalletConnectButton
                network={network}
                onConnect={onWalletChanged || undefined}
                onDisconnect={() => onWalletChanged?.(null)}
              />
              <NetworkToggle network={network} onNetworkChange={onNetworkChange} />
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full animate-pulse ${network === 'mainnet' ? 'bg-green-500' : 'bg-bnb-yellow'}`}></div>
                <span className="text-sm text-gray-400">{network === 'mainnet' ? 'Mainnet' : 'Testnet'}</span>
              </div>
            </div>

            {/* Mobile: Compact wallet */}
            <div className="md:hidden">
              <WalletConnectButton
                network={network}
                onConnect={onWalletChanged || undefined}
                onDisconnect={() => onWalletChanged?.(null)}
                compact
              />
            </div>

            {/* Mobile: Hamburger Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-gray-400 hover:text-bnb-yellow transition-colors"
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
          <div className="lg:hidden mt-4 pt-4 border-t border-bnb-gray animate-slide-up">
            {/* Mobile Title */}
            {title && (
              <h1 className="text-xl font-bold text-white mb-4 sm:hidden">{title}</h1>
            )}

            {/* Mobile Navigation */}
            {showNav && (
              <nav className="space-y-1 mb-4">
                <button
                  onClick={() => navigate('/')}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors font-medium ${
                    activePage === 'home'
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                  </svg>
                  <span>Home</span>
                </button>
                <button
                  onClick={() => navigate('/history.html')}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors font-medium ${
                    activePage === 'history'
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <span>Payment History</span>
                </button>
                <button
                  onClick={() => navigate('/calendar.html')}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors font-medium ${
                    activePage === 'calendar'
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path>
                  </svg>
                  <span>Payment Calendar</span>
                </button>

                {/* Gift Cards - Single link in mobile menu */}
                <button
                  onClick={() => navigate('/giftcard/history')}
                  className={`w-full flex items-center space-x-3 px-3 py-3 rounded-lg transition-colors font-medium ${
                    isGiftCardPage
                      ? 'text-bnb-yellow bg-bnb-yellow/10'
                      : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                  }`}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                  </svg>
                  <span>Gift Cards</span>
                </button>
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
