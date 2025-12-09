import { useState, useEffect } from 'react';
import { InvoiceCreator } from './components/InvoiceCreator';
import { SubscriptionCreator } from './components/SubscriptionCreator';
import { AgentFlowPanel } from './components/AgentFlowPanel';
import { Header } from './components/Header';
import { InvoicePage } from './components/InvoicePage';
import { SubscriptionPage } from './components/SubscriptionPage';
import { FloatingParticles } from './components/FloatingParticles';
import type { InvoiceData, SubscriptionData } from './lib/types';
import type { NetworkType } from './lib/web3';
import { getCurrentNetwork } from './lib/web3';

// Simple router to handle /invoice/:id and /subscription/:id routes
function useRoute() {
  const [route, setRoute] = useState<{ type: 'home' | 'invoice' | 'subscription'; id?: string }>({ type: 'home' });

  useEffect(() => {
    const handleRoute = () => {
      const path = window.location.pathname;

      // Match /invoice/:id
      const invoiceMatch = path.match(/^\/invoice\/(.+)$/);
      if (invoiceMatch) {
        setRoute({ type: 'invoice', id: invoiceMatch[1] });
        return;
      }

      // Match /subscription/:id
      const subscriptionMatch = path.match(/^\/subscription\/(.+)$/);
      if (subscriptionMatch) {
        setRoute({ type: 'subscription', id: subscriptionMatch[1] });
        return;
      }

      // Default to home
      setRoute({ type: 'home' });
    };

    handleRoute();
    window.addEventListener('popstate', handleRoute);
    return () => window.removeEventListener('popstate', handleRoute);
  }, []);

  return route;
}

function App() {
  const route = useRoute();

  // Render invoice page
  if (route.type === 'invoice' && route.id) {
    return <InvoicePage invoiceId={route.id} />;
  }

  // Render subscription page
  if (route.type === 'subscription' && route.id) {
    return <SubscriptionPage subscriptionId={route.id} />;
  }

  // Render home page
  return <HomePage />;
}

function HomePage() {
  const [activeTab, setActiveTab] = useState<'invoice' | 'subscription'>('invoice');
  const [mode, setMode] = useState<'basic' | 'agent'>('basic');
  const [network, setNetwork] = useState<NetworkType>('testnet');
  const [lastCreatedData, setLastCreatedData] = useState<InvoiceData | SubscriptionData | null>(null);
  const [mounted, setMounted] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);

    // Detect current network from wallet
    getCurrentNetwork().then(detectedNetwork => {
      setNetwork(detectedNetwork);
    });
  }, []);

  return (
    <>
      {/* Floating Particles Background */}
      <FloatingParticles />

      <div className="min-h-screen bg-bnb-dark content-wrapper">
        {/* Header */}
        <Header
          network={network}
          onNetworkChange={setNetwork}
          onWalletChanged={setWalletAddress}
          showNav={true}
        />

        {/* Main Content */}
        <main className="max-w-6xl mx-auto px-6 py-12">
          {/* Hero Section */}
          <div className={`text-center mb-12 ${mounted ? 'animate-slide-up' : 'opacity-0'}`}>
            {/* Title */}
            <div className="mb-4">
              <h1 className="text-5xl font-bold text-white mb-2">
                BNBPay <span className="text-bnb-yellow">&</span> X402 Flex
              </h1>
            </div>

            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Multi-token acceptance • BNB, USDT, USDC, XUSD, WUSD, USD1 • X402 Flex Protocol
            </p>
          </div>

          {/* Main Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Generate Invoice Card */}
            <button
              onClick={() => setActiveTab('invoice')}
              className={`card-shadow rounded-2xl p-8 text-left hover-lift transition-all ${
                activeTab === 'invoice' ? 'ring-2 ring-bnb-yellow' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 bg-bnb-yellow/10 rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                  </svg>
                </div>
              </div>
              <div className="flex items-center space-x-3 mb-2">
                <h2 className="text-2xl font-bold text-white">Generate Invoice</h2>
              </div>
              <p className="text-gray-400 text-sm">
                Create invoices with multi-token acceptance (BNB, USDT, USDC, XUSD, WUSD, USD1)
              </p>
              <div className="mt-4 inline-flex items-center text-bnb-yellow text-sm font-semibold">
                <span>Create Invoice</span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </button>

            {/* Create Subscription Card */}
            <button
              onClick={() => setActiveTab('subscription')}
              className={`card-shadow rounded-2xl p-8 text-left hover-lift transition-all ${
                activeTab === 'subscription' ? 'ring-2 ring-bnb-yellow' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="w-14 h-14 bg-bnb-yellow/10 rounded-xl flex items-center justify-center">
                  <svg className="w-8 h-8 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                  </svg>
                </div>
              </div>
              <div className="flex items-center space-x-3 mb-2">
                <h2 className="text-2xl font-bold text-white">Create Subscription</h2>
              </div>
              <p className="text-gray-400 text-sm">
                Set up recurring payments with automatic retries (BNB, USDT, USDC, XUSD, WUSD, USD1)
              </p>
              <div className="mt-4 inline-flex items-center text-bnb-yellow text-sm font-semibold">
                <span>Create Plan</span>
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7"></path>
                </svg>
              </div>
            </button>
          </div>

          {/* Mode Toggle */}
          <div className={`text-center mb-8 ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{animationDelay: '0.3s'}}>
            <div className="inline-flex items-center space-x-2 bg-bnb-gray/50 rounded-xl p-1 border border-bnb-yellow/20">
              <button
                onClick={() => setMode('basic')}
                className={`px-6 py-2.5 rounded-lg font-semibold transition-all ${
                  mode === 'basic'
                    ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Basic Mode
              </button>
              <button
                onClick={() => setMode('agent')}
                className={`px-6 py-2.5 rounded-lg font-semibold transition-all ${
                  mode === 'agent'
                    ? 'bg-bnb-yellow text-bnb-dark shadow-lg'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                Agent Mode
              </button>
            </div>
          </div>

          {/* Content Area */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left: Form */}
            <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'} relative group`} style={{animationDelay: '0.4s'}}>
              <div className="card-shadow rounded-2xl p-8">
                <h3 className="text-xl font-bold text-white mb-6 flex items-center">
                  {activeTab === 'invoice' ? (
                    <>
                      <svg className="w-6 h-6 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                      </svg>
                      Invoice Details
                    </>
                  ) : (
                    <>
                      <svg className="w-6 h-6 text-bnb-yellow mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                      </svg>
                      Subscription Details
                    </>
                  )}
                </h3>

                {activeTab === 'invoice' ? (
                  <InvoiceCreator network={network} onInvoiceCreated={setLastCreatedData} />
                ) : (
                  <SubscriptionCreator network={network} onSubscriptionCreated={setLastCreatedData} />
                )}
              </div>

              {/* Wallet Connection Overlay - shown on hover when no wallet is connected */}
              {!walletAddress && (
                <div className="absolute inset-0 bg-bnb-dark/95 backdrop-blur-sm rounded-2xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none group-hover:pointer-events-auto">
                  <div className="text-center px-8">
                    <img src="/bnbpay-logo.png" alt="BNBPay" className="h-20 w-auto mx-auto mb-6" />
                    <h3 className="text-2xl font-bold text-white mb-3">Connect Your Wallet</h3>
                    <p className="text-gray-400 mb-6">
                      Connect your wallet to create {activeTab === 'invoice' ? 'invoices' : 'subscriptions'}
                    </p>
                    <button
                      onClick={() => {
                        const walletBtn = document.querySelector('[class*="WalletConnect"] button');
                        if (walletBtn) (walletBtn as HTMLButtonElement).click();
                      }}
                      className="inline-flex items-center space-x-3 bg-bnb-yellow hover:bg-yellow-500 text-bnb-dark font-bold px-8 py-4 rounded-xl transition-all shadow-lg hover:shadow-xl hover:scale-105"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"></path>
                      </svg>
                      <span>Connect Wallet</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: Info/Agent Panel */}
            <div className={`${mounted ? 'animate-slide-up' : 'opacity-0'}`} style={{animationDelay: '0.5s'}}>
              {mode === 'basic' ? (
                <div className="card-shadow rounded-2xl p-8 h-full">
                  <h2 className="text-2xl font-bold text-white mb-6">What BNBPay Provides</h2>
                  <div className="space-y-4 text-gray-300">
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>Multi-token acceptance with settlement to your chosen currency</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>Subscriptions with retries, proration, dunning, refunds</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>Controlled enterprise payouts</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>SDKs, WordPress plugins, e-commerce connectors, POS rails</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>BNBPay + x402 Flex rails for BNB chain</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>Designed for remittance & direct token bank routes</p>
                    </div>
                    <div className="flex items-start">
                      <div className="w-6 h-6 bg-bnb-yellow/20 rounded-lg flex items-center justify-center flex-shrink-0 mr-3 mt-0.5">
                        <svg className="w-4 h-4 text-bnb-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                      </div>
                      <p>Flexible settlement in your preferred token across the stack</p>
                    </div>
                  </div>
                </div>
              ) : (
                <AgentFlowPanel data={lastCreatedData} walletAddress={walletAddress} network={network} />
              )}
            </div>
          </div>

          {/* Powered by Footer */}
          <div className={`text-center mt-12 ${mounted ? 'animate-fade-in' : 'opacity-0'}`} style={{animationDelay: '0.6s'}}>
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
        </main>
      </div>
    </>
  );
}

export default App;
