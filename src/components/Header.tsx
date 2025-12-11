import { useState, useRef, useEffect } from 'react';
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
  const [giftCardDropdownOpen, setGiftCardDropdownOpen] = useState(false);
  const [mobileGiftCardExpanded, setMobileGiftCardExpanded] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isGiftCardPage = activePage?.startsWith('giftcard');

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setGiftCardDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigate function - uses full page navigation for .html files, SPA routing for others
  const navigate = (path: string) => {
    setMobileMenuOpen(false);
    setGiftCardDropdownOpen(false);

    // For .html files (separate entry points), use full page navigation
    if (path.endsWith('.html')) {
      window.location.href = path;
      return;
    }

    // For SPA routes, use history API
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
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

                {/* Gift Cards - Dropdown menu */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    onClick={() => setGiftCardDropdownOpen(!giftCardDropdownOpen)}
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
                    <svg className={`w-4 h-4 transition-transform ${giftCardDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {giftCardDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-bnb-dark border border-bnb-gray rounded-xl shadow-lg overflow-hidden z-50 animate-fade-in">
                      <button
                        onClick={() => {
                          navigate('/giftcard/create');
                          setGiftCardDropdownOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors ${
                          activePage === 'giftcard-create'
                            ? 'text-bnb-yellow bg-bnb-yellow/10'
                            : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Create Gift Card</span>
                      </button>
                      <button
                        onClick={() => {
                          navigate('/giftcard/redeem');
                          setGiftCardDropdownOpen(false);
                        }}
                        className={`w-full flex items-center space-x-3 px-4 py-3 text-left transition-colors ${
                          activePage === 'giftcard-redeem'
                            ? 'text-bnb-yellow bg-bnb-yellow/10'
                            : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                        }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Redeem Gift Card</span>
                      </button>
                    </div>
                  )}
                </div>
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

                {/* Gift Cards - Expandable section in mobile menu */}
                <div className="space-y-1">
                  <button
                    onClick={() => setMobileGiftCardExpanded(!mobileGiftCardExpanded)}
                    className={`w-full flex items-center justify-between px-3 py-3 rounded-lg transition-colors font-medium ${
                      isGiftCardPage
                        ? 'text-bnb-yellow bg-bnb-yellow/10'
                        : 'text-gray-300 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                      </svg>
                      <span>Gift Cards</span>
                    </div>
                    <svg className={`w-4 h-4 transition-transform ${mobileGiftCardExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Expandable Sub-menu */}
                  {mobileGiftCardExpanded && (
                    <div className="pl-8 space-y-1 animate-slide-up">
                      <button
                        onClick={() => navigate('/giftcard/create')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                          activePage === 'giftcard-create'
                            ? 'text-bnb-yellow bg-bnb-yellow/10'
                            : 'text-gray-400 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                        <span>Create Gift Card</span>
                      </button>
                      <button
                        onClick={() => navigate('/giftcard/redeem')}
                        className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                          activePage === 'giftcard-redeem'
                            ? 'text-bnb-yellow bg-bnb-yellow/10'
                            : 'text-gray-400 hover:text-bnb-yellow hover:bg-bnb-gray/50'
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Redeem Gift Card</span>
                      </button>
                    </div>
                  )}
                </div>
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
