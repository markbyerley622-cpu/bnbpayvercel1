import type { NetworkType } from '../lib/web3';

interface NetworkToggleProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

/**
 * NetworkIndicator - Displays the current active network from wallet
 * No longer a toggle - just shows which network is detected
 */
export function NetworkToggle({ network }: NetworkToggleProps) {
  return (
    <div className="inline-flex items-center space-x-2 bg-bnb-gray/50 rounded-xl p-1 border border-bnb-yellow/20">
      {/* Testnet indicator */}
      <div
        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center space-x-2 ${
          network === 'testnet'
            ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
            : 'text-gray-500 opacity-50'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${network === 'testnet' ? 'bg-bnb-dark animate-pulse' : 'bg-gray-500'}`}></div>
        <span>Testnet</span>
      </div>
      {/* Mainnet indicator */}
      <div
        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center space-x-2 ${
          network === 'mainnet'
            ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
            : 'text-gray-500 opacity-50'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-bnb-dark animate-pulse' : 'bg-gray-500'}`}></div>
        <span>Mainnet</span>
      </div>
    </div>
  );
}
