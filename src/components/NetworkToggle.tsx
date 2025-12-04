import type { NetworkType } from '../lib/web3';

interface NetworkToggleProps {
  network: NetworkType;
  onNetworkChange: (network: NetworkType) => void;
}

export function NetworkToggle({ network, onNetworkChange }: NetworkToggleProps) {
  return (
    <div className="inline-flex items-center space-x-2 bg-bnb-gray/50 rounded-xl p-1 border border-bnb-yellow/20">
      <button
        onClick={() => onNetworkChange('testnet')}
        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center space-x-2 ${
          network === 'testnet'
            ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${network === 'testnet' ? 'bg-bnb-dark' : 'bg-yellow-500'}`}></div>
        <span>Testnet</span>
      </button>
      <button
        onClick={() => onNetworkChange('mainnet')}
        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all flex items-center space-x-2 ${
          network === 'mainnet'
            ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
            : 'text-gray-400 hover:text-white'
        }`}
      >
        <div className={`w-2 h-2 rounded-full ${network === 'mainnet' ? 'bg-bnb-dark' : 'bg-green-500'}`}></div>
        <span>Mainnet</span>
      </button>
    </div>
  );
}
