import { useState, useEffect, useRef } from 'react';
import {
  connectWallet,
  formatAddress,
  getWalletAddress,
  BSC_MAINNET_CHAIN_ID,
  BSC_TESTNET_CHAIN_ID,
  type NetworkType,
} from '../lib/web3';
import { useToast } from '../contexts/ToastContext';

interface WalletConnectProps {
  network: NetworkType;
  onWalletChanged?: (address: string | null) => void;
  onNetworkChanged?: (network: NetworkType) => void;
  compact?: boolean;
}

export function WalletConnect({ network, onWalletChanged, onNetworkChanged, compact = false }: WalletConnectProps) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    checkWalletConnection();

    // Listen for account changes
    if (window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        const newAddress = accounts[0] || null;
        setWalletAddress(newAddress);
        if (onWalletChanged) {
          onWalletChanged(newAddress);
        }
      };

      const handleChainChanged = (chainId: string) => {
        let nextNetwork: NetworkType = network;
        if (chainId === BSC_MAINNET_CHAIN_ID) {
          nextNetwork = 'mainnet';
        } else if (chainId === BSC_TESTNET_CHAIN_ID) {
          nextNetwork = 'testnet';
        }
        onNetworkChanged?.(nextNetwork);
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        if (window.ethereum && window.ethereum.removeListener) {
          window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
          window.ethereum.removeListener('chainChanged', handleChainChanged);
        }
      };
    }

    return undefined;
  }, [network, onNetworkChanged, onWalletChanged]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const checkWalletConnection = async () => {
    const address = await getWalletAddress();
    setWalletAddress(address);
    if (onWalletChanged) {
      onWalletChanged(address);
    }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const address = await connectWallet(network);
      setWalletAddress(address);
      if (onWalletChanged) {
        onWalletChanged(address);
      }
    } catch (error: any) {
      console.error('Failed to connect wallet:', error);
      toast.error(error.message || 'Failed to connect wallet. Please try again.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = () => {
    setWalletAddress(null);
    setShowDropdown(false);
    if (onWalletChanged) {
      onWalletChanged(null);
    }
  };

  const copyAddress = () => {
    if (walletAddress) {
      navigator.clipboard.writeText(walletAddress);
      setShowDropdown(false);
    }
  };

  if (walletAddress) {
    // Compact mode for mobile
    if (compact) {
      return (
        <div className="relative isolate" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center space-x-2 bg-bnb-yellow/10 border border-bnb-yellow/30 rounded-lg px-3 py-2 hover:bg-bnb-yellow/20 transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
            <span className="text-xs font-semibold text-bnb-yellow">{formatAddress(walletAddress)}</span>
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-bnb-gray border border-bnb-yellow/20 rounded-xl shadow-2xl z-[100] overflow-hidden">
              <div className="px-4 py-3 border-b border-bnb-yellow/10">
                <p className="text-xs text-gray-400 mb-1">Wallet</p>
                <p className="text-xs text-white font-mono break-all">{walletAddress}</p>
              </div>
              <div className="py-1">
                <button onClick={copyAddress} className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-300 hover:bg-bnb-yellow/10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                  <span>Copy</span>
                </button>
                <button onClick={handleDisconnect} className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                  </svg>
                  <span>Disconnect</span>
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Full mode for desktop
    return (
      <div className="relative isolate" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center space-x-3 bg-bnb-yellow/10 border border-bnb-yellow/30 rounded-xl px-4 py-2 hover:bg-bnb-yellow/20 transition-colors cursor-pointer"
        >
          <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
            </svg>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div className="flex flex-col text-left">
            <span className="text-xs text-gray-400">Connected</span>
            <span className="text-sm font-semibold text-bnb-yellow">{formatAddress(walletAddress)}</span>
          </div>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
          </svg>
        </button>

        {/* Dropdown Menu - positioned to avoid overlapping content below */}
        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-64 bg-bnb-gray border border-bnb-yellow/20 rounded-xl shadow-2xl z-[100] overflow-hidden"
            style={{ maxHeight: 'calc(100vh - 100px)' }}
          >
            {/* Wallet Info */}
            <div className="px-4 py-3 border-b border-bnb-yellow/10">
              <p className="text-xs text-gray-400 mb-1">Wallet Address</p>
              <p className="text-sm text-white font-mono break-all">{walletAddress}</p>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                onClick={copyAddress}
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-300 hover:bg-bnb-yellow/10 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                <span>Copy Address</span>
              </button>

              <a
                href={`https://testnet.bscscan.com/address/${walletAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-300 hover:bg-bnb-yellow/10 hover:text-white transition-colors"
                onClick={() => setShowDropdown(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path>
                </svg>
                <span>View on Explorer</span>
              </a>

              <button
                onClick={handleDisconnect}
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
                </svg>
                <span>Disconnect</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={handleConnect}
      disabled={connecting}
      className="flex items-center space-x-2 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-semibold px-6 py-2 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
      </svg>
      <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
    </button>
  );
}
