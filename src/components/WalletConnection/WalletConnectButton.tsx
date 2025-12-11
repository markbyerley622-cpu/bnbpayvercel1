/**
 * Wallet Connect Button Component
 * Main wallet connection UI with "Powered by Pepay" branding
 * Supports desktop and mobile wallets via Reown AppKit
 */

import { useEffect, useCallback, useState, useRef } from 'react';
import { useAppKit, useAppKitState } from '@reown/appkit/react';
import { useAccount, useDisconnect, useBalance, useSwitchChain } from 'wagmi';
import { bsc, bscTestnet } from 'wagmi/chains';
import { useToast } from '../../contexts/ToastContext';

interface WalletConnectButtonProps {
  /** Network to connect to */
  network?: 'mainnet' | 'testnet';
  /** Callback when wallet connects */
  onConnect?: (address: string) => void;
  /** Callback when wallet disconnects */
  onDisconnect?: () => void;
  /** Compact mode for mobile/header */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
  /** Show balance in button */
  showBalance?: boolean;
}

export function WalletConnectButton({
  network = 'testnet',
  onConnect,
  onDisconnect: onDisconnectCallback,
  compact = false,
  className = '',
  showBalance = false,
}: WalletConnectButtonProps) {
  const { open } = useAppKit();
  const { open: isModalOpen } = useAppKitState();
  // Use chainId from useAccount() to get the actual wallet's connected chain
  // Note: useChainId() returns the config's state chain, not the wallet's actual chain
  const { isConnected, address, isConnecting, isReconnecting, chainId } = useAccount();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const toast = useToast();

  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get balance if requested
  const { data: balance } = useBalance({
    address: address,
    chainId: network === 'mainnet' ? bsc.id : bscTestnet.id,
  });

  // Target chain based on network prop
  const targetChainId = network === 'mainnet' ? bsc.id : bscTestnet.id;

  // Check if on wrong network - only if connected AND chainId is valid AND doesn't match target
  // Note: chainId can be undefined or 0 during initial connection, so we only check when it's a valid chain
  const isWrongNetwork = isConnected && chainId !== undefined && chainId !== 0 && chainId !== targetChainId;

  // Notify parent when connected
  useEffect(() => {
    if (isConnected && address) {
      onConnect?.(address);
    }
  }, [isConnected, address, onConnect]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle connect click
  const handleConnect = useCallback(async () => {
    try {
      await open();
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      toast.error('Failed to open wallet modal. Please try again.');
    }
  }, [open, toast]);

  // Handle disconnect
  const handleDisconnect = useCallback(() => {
    disconnect();
    setShowDropdown(false);
    onDisconnectCallback?.();
    toast.info('Wallet disconnected');
  }, [disconnect, onDisconnectCallback, toast]);

  // Handle network switch
  const handleSwitchNetwork = useCallback(async () => {
    try {
      await switchChain({ chainId: targetChainId });
      toast.success(`Switched to ${network === 'mainnet' ? 'BNB Mainnet' : 'BNB Testnet'}`);
    } catch (error: any) {
      console.error('Network switch error:', error);
      if (error?.code === 4001) {
        toast.info('Network switch cancelled');
      } else {
        toast.error('Failed to switch network. Please try manually.');
      }
    }
  }, [switchChain, targetChainId, network, toast]);

  // Copy address to clipboard
  const copyAddress = useCallback(() => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success('Address copied to clipboard');
      setShowDropdown(false);
    }
  }, [address, toast]);

  // Format address for display
  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  // Format balance for display
  const formatBalance = (bal: typeof balance) => {
    if (!bal) return '0.00';
    try {
      // Use value (bigint) and decimals to format
      const value = Number(bal.value) / Math.pow(10, bal.decimals);
      return isNaN(value) ? '0.00' : value.toFixed(4);
    } catch {
      return '0.00';
    }
  };

  // Loading state
  const isLoading = isConnecting || isReconnecting || isSwitching;

  // Wrong network warning button
  if (isConnected && isWrongNetwork) {
    return (
      <button
        onClick={handleSwitchNetwork}
        disabled={isSwitching}
        className={`
          flex items-center space-x-2 px-4 py-2 rounded-xl
          bg-orange-500/20 border border-orange-500/50 text-orange-400
          hover:bg-orange-500/30 transition-all
          ${isSwitching ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
          ${className}
        `}
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm font-semibold">
          {isSwitching ? 'Switching...' : 'Wrong Network'}
        </span>
      </button>
    );
  }

  // Connected state
  if (isConnected && address) {
    // Compact mode for mobile
    if (compact) {
      return (
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className={`
              flex items-center space-x-2 px-3 py-2 rounded-lg
              bg-bnb-yellow/10 border border-bnb-yellow/30
              hover:bg-bnb-yellow/20 transition-colors
              ${className}
            `}
          >
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs font-semibold text-bnb-yellow">{formatAddress(address)}</span>
          </button>

          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-bnb-gray border border-bnb-yellow/20 rounded-xl shadow-2xl z-[9999] overflow-hidden">
              <div className="px-4 py-3 border-b border-bnb-yellow/10">
                <p className="text-xs text-gray-400 mb-1">Wallet</p>
                <p className="text-xs text-white font-mono break-all">{address}</p>
                {showBalance && balance && (
                  <p className="text-xs text-bnb-yellow mt-1">
                    {formatBalance(balance)} {balance.symbol}
                  </p>
                )}
              </div>
              <div className="py-1">
                <button
                  onClick={copyAddress}
                  className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-gray-300 hover:bg-bnb-yellow/10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>Copy</span>
                </button>
                <button
                  onClick={handleDisconnect}
                  className="w-full flex items-center space-x-2 px-4 py-2 text-sm text-red-400 hover:bg-red-500/10"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span>Disconnect</span>
                </button>
              </div>
              {/* Powered by Pepay footer */}
              <div className="px-4 py-2 bg-bnb-dark/50 border-t border-bnb-yellow/10">
                <p className="text-[10px] text-gray-500 text-center">
                  Powered by <span className="text-bnb-yellow">Pepay</span>
                </p>
              </div>
            </div>
          )}
        </div>
      );
    }

    // Full mode for desktop
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className={`
            flex items-center space-x-3 px-4 py-2 rounded-xl
            bg-bnb-yellow/10 border border-bnb-yellow/30
            hover:bg-bnb-yellow/20 transition-colors cursor-pointer
            ${className}
          `}
        >
          <div className="w-8 h-8 bg-bnb-yellow/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <div className="flex flex-col text-left">
            <span className="text-xs text-gray-400">Connected</span>
            <span className="text-sm font-semibold text-bnb-yellow">{formatAddress(address)}</span>
          </div>
          {showBalance && balance && (
            <span className="text-xs text-gray-400 ml-2">
              {formatBalance(balance)} {balance.symbol}
            </span>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-72 bg-bnb-gray border border-bnb-yellow/20 rounded-xl shadow-2xl z-[9999] overflow-hidden">
            <div className="px-4 py-3 border-b border-bnb-yellow/10">
              <p className="text-xs text-gray-400 mb-1">Wallet Address</p>
              <p className="text-sm text-white font-mono break-all">{address}</p>
              {showBalance && balance && (
                <p className="text-sm text-bnb-yellow mt-2">
                  Balance: {formatBalance(balance)} {balance.symbol}
                </p>
              )}
            </div>

            <div className="py-1">
              <button
                onClick={copyAddress}
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-300 hover:bg-bnb-yellow/10 hover:text-white transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <span>Copy Address</span>
              </button>

              <a
                href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-gray-300 hover:bg-bnb-yellow/10 hover:text-white transition-colors"
                onClick={() => setShowDropdown(false)}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>View on Explorer</span>
              </a>

              <button
                onClick={handleDisconnect}
                className="w-full flex items-center space-x-3 px-4 py-3 text-left text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>Disconnect</span>
              </button>
            </div>

            {/* Powered by Pepay footer */}
            <div className="px-4 py-2 bg-bnb-dark/50 border-t border-bnb-yellow/10">
              <p className="text-xs text-gray-500 text-center">
                Powered by <span className="text-bnb-yellow font-semibold">Pepay</span>
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Disconnected state - Connect button
  return (
    <button
      onClick={handleConnect}
      disabled={isLoading || isModalOpen}
      className={`
        flex items-center justify-center space-x-2
        bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark
        font-semibold px-6 py-2 rounded-xl
        transition-all disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
      <span>
        {isLoading ? 'Connecting...' : 'Connect Wallet'}
      </span>
    </button>
  );
}

/**
 * Simple hook to get wallet state
 * Use this for components that just need to check connection status
 */
export function useWallet() {
  // Use chainId from useAccount() to get the actual wallet's connected chain
  const { isConnected, address, isConnecting, chainId } = useAccount();
  const { disconnect } = useDisconnect();

  return {
    isConnected,
    address,
    isConnecting,
    chainId,
    disconnect,
    isMainnet: chainId === bsc.id,
    isTestnet: chainId === bscTestnet.id,
    networkType: chainId === bsc.id ? 'mainnet' as const : 'testnet' as const,
  };
}

export default WalletConnectButton;
