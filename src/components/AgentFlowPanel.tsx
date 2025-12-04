import { useState, useEffect } from 'react';
import type { InvoiceData, SubscriptionData } from '../lib/types';
import { generateMCPExamples, generateCleanPayload, contractStubs } from '../lib/contract-stubs';
import { useNetworks, useApiHealth, useTokensByNetwork, useWalletPayments, useSessions } from '../lib/useBNBPayApi';
import {
  bnbpayApi,
  type BuildIntentRequest,
  type RelayPaymentRequest,
  type PaymentScheme,
  type NetworkKey,
  safeStringify,
} from '../lib/bnbpay-api';
import { NETWORKS } from '../lib/web3';

interface AgentFlowPanelProps {
  data: InvoiceData | SubscriptionData | null;
  walletAddress?: string | null;
  network?: 'testnet' | 'mainnet';
}

interface LocalPayment {
  invoiceId: string;
  txHash: string;
  paidBy: string;
  paidAt: number;
  amount: string;
  token: string;
  merchant: string;
  network: string;
  blockNumber?: number;
}

export function AgentFlowPanel({ data, walletAddress, network = 'testnet' }: AgentFlowPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeTab, setActiveTab] = useState<'json' | 'mcp' | 'settlement' | 'analytics'>('settlement');
  const [simulationResult, setSimulationResult] = useState<string>('');
  const [buildIntentResult, setBuildIntentResult] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [localPayments, setLocalPayments] = useState<LocalPayment[]>([]);

  // Load local payments history from localStorage
  useEffect(() => {
    try {
      const paymentsHistory = JSON.parse(localStorage.getItem('bnbpay_payments_history') || '[]');
      setLocalPayments(paymentsHistory);
    } catch (e) {
      console.error('Failed to load local payments:', e);
    }
  }, []);

  // Fetch network config from API
  const { data: networksData, loading: networksLoading } = useNetworks();
  const { data: healthData, loading: healthLoading, error: healthError } = useApiHealth();

  const networkKey: NetworkKey = network === 'mainnet' ? 'bnb' : 'bnbTestnet';
  const currentNetwork = networksData?.networks?.find(n => n.key === networkKey);

  // Fetch tokens for the current network
  const { data: tokensData, loading: tokensLoading } = useTokensByNetwork(networkKey);

  // Fetch wallet payments if wallet is connected (for analytics)
  const { data: paymentsData, loading: paymentsLoading } = useWalletPayments(
    walletAddress || null,
    { pageSize: 10, role: 'merchant', network: networkKey },
    { enabled: !!walletAddress }
  );

  // Fetch sessions for the wallet (for analytics)
  const { data: sessionsData, loading: sessionsLoading } = useSessions(
    walletAddress ? { wallet: walletAddress, network: networkKey } : null,
    { enabled: !!walletAddress }
  );

  const mcpExamples = data ? generateMCPExamples(data) : [];

  // Generate API examples based on the data
  const generateApiExamples = () => {
    if (!data) return [];

    const examples: { method: string; endpoint: string; description: string; payload: object | string }[] = [];

    // Build Intent example
    if (data.type === 'invoice' && walletAddress) {
      const invoiceData = data as InvoiceData;
      const buildIntentPayload: BuildIntentRequest = {
        mode: 'minimal',
        network: networkKey,
        merchant: walletAddress,
        token: invoiceData.paymentToken || 'USDT',
        amount: invoiceData.amount || '0',
        referenceId: invoiceData.invoiceId,
        scheme: 'permit2' as PaymentScheme,
        deadlineSeconds: 3600, // 1 hour
        decimals: 18,
      };

      examples.push({
        method: 'POST',
        endpoint: '/payments/build-intent',
        description: 'Build payment intent for signing (gas-free)',
        payload: buildIntentPayload,
      });
    }

    // Can Pay check example
    if (walletAddress) {
      examples.push({
        method: 'GET',
        endpoint: '/can-pay',
        description: 'Check if payer can make payment (gas-free)',
        payload: `?network=${networkKey}&from=0x...payer&to=${walletAddress}&token=USDT&amount=${data.type === 'invoice' ? (data as InvoiceData).amount : (data as SubscriptionData).price}`,
      });
    }

    // Get wallet payments
    if (walletAddress) {
      examples.push({
        method: 'GET',
        endpoint: `/wallets/${walletAddress}/payments`,
        description: 'List payments by wallet (gas-free)',
        payload: '?role=merchant&pageSize=20',
      });
    }

    // Relay payment example
    examples.push({
      method: 'POST',
      endpoint: '/relay/payment',
      description: 'Relay signed payment to chain (on-chain tx)',
      payload: {
        network: networkKey,
        scheme: 'permit2',
        intent: {
          paymentId: '0x...',
          merchant: walletAddress || '0x...',
          token: '0x...tokenAddress',
          amount: '1000000000000000000',
          deadline: Math.floor(Date.now() / 1000) + 3600,
          resourceId: '0x...',
        },
        witness: {
          schemeId: '0x...',
          intentHash: '0x...',
          payer: '0x...payerAddress',
          salt: '0x...',
        },
        witnessSignature: '0x...',
        reference: data.type === 'invoice' ? (data as InvoiceData).invoiceId : (data as SubscriptionData).subscriptionId,
      } as RelayPaymentRequest,
    });

    return examples;
  };

  const apiExamples = generateApiExamples();

  const handleSimulateSwap = async () => {
    setIsLoading(true);
    try {
      const result = await contractStubs.simulateMultiTokenSwap('USDT', 'BNB', '100');
      setSimulationResult(result);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBuildIntent = async () => {
    if (!data || !walletAddress) return;

    setIsLoading(true);
    try {
      const invoiceData = data as InvoiceData;

      // Get token address from NETWORKS config
      const config = NETWORKS[network];
      const tokenSymbol = invoiceData.paymentToken || 'USDT';
      const tokens = config.tokens as Record<string, string>;
      const tokenAddress = tokens[tokenSymbol] || tokens[tokenSymbol.toUpperCase()];

      if (!tokenAddress) {
        throw new Error(`Token address not found for ${tokenSymbol}`);
      }

      const response = await bnbpayApi.buildPaymentIntent({
        mode: 'minimal',
        network: networkKey,
        merchant: invoiceData.merchantAddress || walletAddress,
        token: tokenAddress, // Use token address, not symbol
        amount: invoiceData.amount || '10',
        invoiceId: invoiceData.invoiceId, // Use invoiceId, not referenceId
        payer: invoiceData.payeeWalletAddress || walletAddress, // Add payer field
        scheme: 'permit2',
        deadlineSeconds: 3600, // 1 hour deadline
        decimals: 18,
      });
      setBuildIntentResult(safeStringify(response, 2));
    } catch (error: any) {
      setBuildIntentResult(safeStringify({ error: error.message }, 2));
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="animate-slide-up" style={{ animationDelay: '0.5s' }}>
      <div className="bg-bnb-gray/50 rounded-xl overflow-hidden border border-bnb-gray">
        {/* Collapsible Header */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between p-4 hover:bg-bnb-gray/70 transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
              </svg>
            </div>
            <div className="text-left">
              <h3 className="text-white font-semibold">Agent / MCP Panel</h3>
              <p className="text-gray-500 text-xs">Developer tools & API integration</p>
            </div>
          </div>
          <div className="flex items-center space-x-3">
            {/* API Status Indicator */}
            <div className="flex items-center space-x-2">
              {healthLoading ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></div>
                  <span className="text-xs text-gray-500">Connecting...</span>
                </>
              ) : healthError ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-500">Error</span>
                </>
              ) : healthData?.status === 'ok' ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500"></div>
                  <span className="text-xs text-gray-500">Online</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-red-500"></div>
                  <span className="text-xs text-gray-500">Offline</span>
                </>
              )}
            </div>
            {/* Chevron */}
            <svg
              className={`w-5 h-5 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
            </svg>
          </div>
        </button>

        {/* Collapsible Content */}
        {isExpanded && (
          <div className="p-4 pt-0 space-y-4 border-t border-bnb-gray">
            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-600 mt-4">
              <button
                onClick={() => setActiveTab('json')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'json'
                    ? 'text-bnb-yellow border-b-2 border-bnb-yellow'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                JSON Payload
              </button>
              <button
                onClick={() => setActiveTab('mcp')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'mcp'
                    ? 'text-bnb-yellow border-b-2 border-bnb-yellow'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                MCP Calls
              </button>
              <button
                onClick={() => setActiveTab('settlement')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'settlement'
                    ? 'text-bnb-yellow border-b-2 border-bnb-yellow'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Settlement
              </button>
              <button
                onClick={() => setActiveTab('analytics')}
                className={`px-4 py-2 font-semibold transition-colors ${
                  activeTab === 'analytics'
                    ? 'text-bnb-yellow border-b-2 border-bnb-yellow'
                    : 'text-gray-400 hover:text-gray-300'
                }`}
              >
                Analytics
              </button>
            </div>

            {/* Tab Content */}
            <div className="min-h-[300px]">
              {activeTab === 'json' && (
                <div>
                  <h4 className="font-semibold text-white mb-3">JSON Payload</h4>
                  {data ? (
                    <div className="space-y-4">
                      <div className="relative">
                        <pre className="bg-bnb-dark border border-gray-700 rounded-lg p-4 overflow-x-auto text-sm text-gray-300">
                          {safeStringify(generateCleanPayload(data), 2)}
                        </pre>
                        <button
                          onClick={() => copyToClipboard(safeStringify(generateCleanPayload(data), 2))}
                          className="absolute top-2 right-2 px-2 py-1 bg-bnb-gray hover:bg-bnb-yellow hover:text-bnb-dark text-gray-400 text-xs rounded transition-colors"
                        >
                          Copy
                        </button>
                      </div>

                      {/* API Endpoints Section */}
                      <div className="mt-6">
                        <h4 className="font-semibold text-white mb-3">BNBPay API Endpoints</h4>
                        <div className="space-y-3">
                          {apiExamples.map((example, index) => (
                            <div key={index} className="bg-bnb-dark border border-gray-700 rounded-lg p-4">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <span className={`px-2 py-0.5 text-xs font-bold rounded ${
                                    example.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'
                                  }`}>
                                    {example.method}
                                  </span>
                                  <code className="text-sm font-mono text-gray-300">{example.endpoint}</code>
                                </div>
                                <button
                                  onClick={() => copyToClipboard(typeof example.payload === 'string' ? example.payload : safeStringify(example.payload, 2))}
                                  className="text-xs text-gray-500 hover:text-bnb-yellow transition-colors"
                                >
                                  Copy
                                </button>
                              </div>
                              <p className="text-xs text-gray-500 mb-2">{example.description}</p>
                              {typeof example.payload === 'object' && (
                                <pre className="bg-bnb-gray/50 rounded p-2 text-xs overflow-x-auto max-h-32 text-gray-400">
                                  {safeStringify(example.payload, 2)}
                                </pre>
                              )}
                              {typeof example.payload === 'string' && (
                                <code className="text-xs text-gray-400 bg-bnb-gray/50 px-2 py-1 rounded">{example.payload}</code>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      Create an invoice or subscription to see the JSON payload
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'mcp' && (
                <div>
                  <h4 className="font-semibold text-white mb-3">Example MCP Calls</h4>
                  {mcpExamples.length > 0 ? (
                    <div className="space-y-4">
                      {mcpExamples.map((example, index) => (
                        <div key={index} className="bg-bnb-dark border border-gray-700 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <code className="text-bnb-yellow font-semibold">{example.method}</code>
                            <button
                              onClick={() => copyToClipboard(safeStringify(example.payload, 2))}
                              className="text-sm text-gray-500 hover:text-bnb-yellow transition-colors"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-sm text-gray-400 mb-2">{example.description}</p>
                          <pre className="bg-bnb-gray/50 rounded p-2 text-xs overflow-x-auto text-gray-400">
                            {safeStringify(example.payload, 2)}
                          </pre>
                        </div>
                      ))}

                      {/* API-based MCP Examples */}
                      <div className="mt-4 p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                        <h5 className="font-semibold text-purple-400 mb-2">BNBPay API MCP Tools</h5>
                        <div className="space-y-2 text-sm text-purple-300">
                          <div className="flex items-start space-x-2">
                            <span className="text-purple-400">-</span>
                            <div>
                              <code className="font-mono text-xs bg-purple-500/20 px-1 rounded text-purple-300">bnbpay.buildIntent()</code>
                              <p className="text-xs mt-1 text-gray-400">Build payment intent for permit2/session flows</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <span className="text-purple-400">-</span>
                            <div>
                              <code className="font-mono text-xs bg-purple-500/20 px-1 rounded text-purple-300">bnbpay.relayPayment()</code>
                              <p className="text-xs mt-1 text-gray-400">Relay signed payment to chain (gas sponsored)</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <span className="text-purple-400">-</span>
                            <div>
                              <code className="font-mono text-xs bg-purple-500/20 px-1 rounded text-purple-300">bnbpay.getPaymentStatus()</code>
                              <p className="text-xs mt-1 text-gray-400">Check payment settlement status</p>
                            </div>
                          </div>
                          <div className="flex items-start space-x-2">
                            <span className="text-purple-400">-</span>
                            <div>
                              <code className="font-mono text-xs bg-purple-500/20 px-1 rounded text-purple-300">bnbpay.getSessions()</code>
                              <p className="text-xs mt-1 text-gray-400">List agent sessions for autonomous payments</p>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <h5 className="font-semibold text-green-400 mb-2">Automation Examples</h5>
                        <ul className="text-sm text-green-300 space-y-1">
                          {data?.type === 'subscription' ? (
                            <>
                              <li>- Auto-charge subscriptions on schedule</li>
                              <li>- Retry failed subscription charges after 24h</li>
                              <li>- Send dunning emails after 3 failed attempts</li>
                              <li>- Cancel subscription after max retries</li>
                              <li>- Subscribe to subscription status via WebSocket</li>
                            </>
                          ) : (
                            <>
                              <li>- Retry failed payments after 24h</li>
                              <li>- Send dunning emails after 3 failed attempts</li>
                              <li>- Process multi-token payments (BNB, USDT, USDC, USD1)</li>
                              <li>- Trigger webhook on settlement complete</li>
                              <li>- Subscribe to invoice status via SSE/WebSocket</li>
                            </>
                          )}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500 text-center py-8">
                      Create an invoice or subscription to see MCP examples
                    </p>
                  )}
                </div>
              )}

              {activeTab === 'settlement' && (
                <div>
                  <h4 className="font-semibold text-white mb-3">Multi-Token Settlement</h4>
                  <div className="bg-bnb-dark border border-gray-700 rounded-lg p-6 space-y-4">
                    {/* Network Contracts Info */}
                    {currentNetwork && (
                      <div className="p-4 bg-bnb-gray/50 border border-gray-700 rounded-lg">
                        <h5 className="font-semibold text-white mb-3">Network Contracts ({currentNetwork.name})</h5>
                        <div className="grid grid-cols-1 gap-2 text-xs font-mono">
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Registry:</span>
                            <a
                              href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/${currentNetwork.registry}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-bnb-yellow hover:text-yellow-400"
                            >
                              {currentNetwork.registry?.slice(0, 10)}...{currentNetwork.registry?.slice(-6)}
                            </a>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Router:</span>
                            <a
                              href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/${currentNetwork.router}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-bnb-yellow hover:text-yellow-400"
                            >
                              {currentNetwork.router?.slice(0, 10)}...{currentNetwork.router?.slice(-6)}
                            </a>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">SubscriptionManager:</span>
                            <a
                              href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/0x45e1857002F4A91831ada123302ED739B9E7c467`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-bnb-yellow hover:text-yellow-400"
                            >
                              0x45e18570...E7c467
                            </a>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">SessionStore:</span>
                            <a
                              href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/${currentNetwork.sessionStore}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-bnb-yellow hover:text-yellow-400"
                            >
                              {currentNetwork.sessionStore?.slice(0, 10)}...{currentNetwork.sessionStore?.slice(-6)}
                            </a>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-gray-500">Permit2:</span>
                            <a
                              href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/address/${currentNetwork.permit2}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-bnb-yellow hover:text-yellow-400"
                            >
                              {currentNetwork.permit2?.slice(0, 10)}...{currentNetwork.permit2?.slice(-6)}
                            </a>
                          </div>
                        </div>
                      </div>
                    )}

                    {networksLoading && (
                      <div className="p-4 bg-bnb-gray/50 border border-gray-700 rounded-lg animate-pulse">
                        <div className="h-4 bg-gray-700 rounded w-1/2 mb-2"></div>
                        <div className="h-3 bg-gray-700 rounded w-full"></div>
                      </div>
                    )}

                    <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <h5 className="font-semibold text-blue-400 mb-2">How It Works</h5>
                      <ol className="text-sm text-blue-300 space-y-2">
                        <li>1. Customer pays with any supported token (BNB, USDT, USDC, USD1)</li>
                        <li>2. Payment is verified on-chain via PaymentRegistry</li>
                        <li>3. BNBPayRouter processes the payment</li>
                        <li>4. Tokens are settled to merchant wallet</li>
                        <li>5. Invoice status updates via SSE/WebSocket</li>
                      </ol>
                    </div>

                    {/* Payment Schemes */}
                    <div className="p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-lg">
                      <h5 className="font-semibold text-indigo-400 mb-2">Supported Payment Schemes</h5>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2 bg-bnb-gray/50 rounded border border-gray-700">
                          <code className="text-xs font-mono text-indigo-400">permit2</code>
                          <p className="text-xs text-gray-500 mt-1">Uniswap Permit2 approvals</p>
                        </div>
                        <div className="p-2 bg-bnb-gray/50 rounded border border-gray-700">
                          <code className="text-xs font-mono text-indigo-400">eip2612</code>
                          <p className="text-xs text-gray-500 mt-1">EIP-2612 permit signatures</p>
                        </div>
                        <div className="p-2 bg-bnb-gray/50 rounded border border-gray-700">
                          <code className="text-xs font-mono text-indigo-400">session</code>
                          <p className="text-xs text-gray-500 mt-1">Agent session spending</p>
                        </div>
                        <div className="p-2 bg-bnb-gray/50 rounded border border-gray-700">
                          <code className="text-xs font-mono text-indigo-400">push_signed</code>
                          <p className="text-xs text-gray-500 mt-1">Pre-signed transactions</p>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleSimulateSwap}
                      disabled={isLoading}
                      className="w-full py-3 bg-bnb-yellow text-bnb-dark font-semibold rounded-lg hover:-translate-y-0.5 transition-transform disabled:opacity-50"
                    >
                      {isLoading ? 'Simulating...' : 'Simulate Multi-Token Swap'}
                    </button>

                    {simulationResult && (
                      <div className="mt-4">
                        <h5 className="font-semibold text-white mb-2">Simulation Result</h5>
                        <pre className="bg-bnb-gray/50 border border-gray-700 rounded-lg p-4 text-sm overflow-x-auto text-gray-300">
                          {JSON.stringify(JSON.parse(simulationResult), null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Build Intent Button (only if data and wallet) */}
                    {data && walletAddress && (
                      <>
                        <button
                          onClick={handleBuildIntent}
                          disabled={isLoading}
                          className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                        >
                          {isLoading ? 'Building...' : 'Build Payment Intent (via API)'}
                        </button>

                        {buildIntentResult && (
                          <div className="mt-4">
                            <h5 className="font-semibold text-white mb-2">Build Intent Response</h5>
                            <pre className="bg-bnb-gray/50 border border-gray-700 rounded-lg p-4 text-sm overflow-x-auto max-h-48 text-gray-300">
                              {buildIntentResult}
                            </pre>
                          </div>
                        )}
                      </>
                    )}

                    <div className="mt-4 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <p className="text-sm text-yellow-500">
                        <strong>Enterprise Features:</strong> Controlled payouts, batch settlements,
                        multi-token support, POS integration, WordPress plugins
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'analytics' && (
                <div>
                  <h4 className="font-semibold text-white mb-3">Payment Analytics</h4>
                  <div className="space-y-4">
                    {/* API Status Card */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                        <div className="flex items-center space-x-2 mb-2">
                          <div className={`w-2 h-2 rounded-full ${
                            healthLoading ? 'bg-yellow-500 animate-pulse' :
                            healthError ? 'bg-red-500' :
                            healthData?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'
                          }`}></div>
                          <span className="text-sm font-semibold text-white">API Status</span>
                        </div>
                        <p className="text-xl font-bold text-bnb-yellow">
                          {healthLoading ? 'Connecting...' :
                           healthError ? 'Error' :
                           healthData?.status === 'ok' ? 'Online' : 'Offline'}
                        </p>
                        <p className="text-xs text-gray-500">api.bnbpay.org</p>
                      </div>
                      <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                        <span className="text-sm font-semibold text-white block mb-2">Network</span>
                        <p className="text-xl font-bold text-bnb-yellow">{network === 'mainnet' ? 'BNB Chain' : 'BNB Testnet'}</p>
                        <p className="text-xs text-gray-500">Chain ID: {currentNetwork?.chainId || '...'}</p>
                      </div>
                    </div>

                    {/* Tokens Available */}
                    <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                      <h5 className="font-semibold text-white mb-3">Supported Tokens</h5>
                      {tokensLoading ? (
                        <div className="animate-pulse h-8 bg-gray-700 rounded"></div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {tokensData?.map((token, idx) => (
                            <span
                              key={idx}
                              className="px-3 py-1 bg-bnb-gray/50 text-bnb-yellow text-sm font-mono rounded-full border border-bnb-yellow/30"
                            >
                              {token.symbol}
                            </span>
                          )) || <span className="text-gray-500">No tokens loaded</span>}
                        </div>
                      )}
                    </div>

                    {/* Wallet Analytics (only if wallet connected) */}
                    {walletAddress ? (
                      <>
                        {/* Payment Stats */}
                        <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                          <h5 className="font-semibold text-white mb-3">Payment Activity</h5>
                          {paymentsLoading ? (
                            <div className="animate-pulse space-y-2">
                              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                              <div className="h-4 bg-gray-700 rounded w-1/3"></div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-2xl font-bold text-white">{paymentsData?.total || 0}</p>
                                <p className="text-xs text-gray-500">Total Payments</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-white">{paymentsData?.data?.length || 0}</p>
                                <p className="text-xs text-gray-500">Recent (last 10)</p>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Recent Payments */}
                        <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                          <h5 className="font-semibold text-white mb-3">Recent Payments</h5>
                          {paymentsLoading ? (
                            <div className="animate-pulse space-y-2">
                              <div className="h-12 bg-gray-700 rounded"></div>
                              <div className="h-12 bg-gray-700 rounded"></div>
                            </div>
                          ) : paymentsData?.data && paymentsData.data.length > 0 ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto">
                              {paymentsData.data.slice(0, 5).map((payment, idx) => (
                                <div key={idx} className="flex justify-between items-center p-2 bg-bnb-gray/30 rounded">
                                  <div>
                                    <p className="text-sm font-mono text-gray-300">
                                      {payment.paymentId?.slice(0, 10)}...{payment.paymentId?.slice(-6)}
                                    </p>
                                    <p className="text-xs text-gray-500">{payment.reference || 'No reference'}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm text-bnb-yellow font-semibold">
                                      {bnbpayApi.formatPaymentAmount(payment.amount, 18)}
                                    </p>
                                    <a
                                      href={`https://${network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${payment.txHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-xs text-blue-400 hover:text-blue-300"
                                    >
                                      View Tx
                                    </a>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-gray-500 text-center py-4">No payments found</p>
                          )}
                        </div>

                        {/* Sessions */}
                        <div className="p-4 bg-bnb-dark border border-gray-700 rounded-lg">
                          <h5 className="font-semibold text-white mb-3">Agent Sessions</h5>
                          {sessionsLoading ? (
                            <div className="animate-pulse space-y-2">
                              <div className="h-4 bg-gray-700 rounded w-1/2"></div>
                            </div>
                          ) : (
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <p className="text-2xl font-bold text-white">{sessionsData?.total || 0}</p>
                                <p className="text-xs text-gray-500">Total Sessions</p>
                              </div>
                              <div>
                                <p className="text-2xl font-bold text-green-400">
                                  {sessionsData?.data?.filter(s => s.isActive).length || 0}
                                </p>
                                <p className="text-xs text-gray-500">Active Sessions</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="p-6 bg-bnb-dark border border-gray-700 rounded-lg text-center">
                        <svg className="w-12 h-12 text-gray-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
                        </svg>
                        <p className="text-gray-400 mb-2">Connect your wallet to view analytics</p>
                        <p className="text-xs text-gray-500">Payment history, sessions, and more</p>
                      </div>
                    )}

                    {/* Local/Direct Payments History */}
                    {localPayments.length > 0 && (
                      <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
                        <h5 className="font-semibold text-green-400 mb-3">Direct Payments (Local)</h5>
                        <p className="text-xs text-gray-500 mb-3">
                          Payments made directly through this browser (not via API relay)
                        </p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {localPayments.slice(0, 10).map((payment, idx) => (
                            <div key={idx} className="flex justify-between items-center p-2 bg-bnb-dark/50 rounded">
                              <div>
                                <p className="text-sm font-mono text-gray-300">
                                  {payment.invoiceId?.slice(0, 12)}...
                                </p>
                                <p className="text-xs text-gray-500">
                                  {new Date(payment.paidAt).toLocaleDateString()} {new Date(payment.paidAt).toLocaleTimeString()}
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-green-400 font-semibold">
                                  {payment.amount} {payment.token?.replace(/^T/, '')}
                                </p>
                                <a
                                  href={`https://${payment.network === 'mainnet' ? '' : 'testnet.'}bscscan.com/tx/${payment.txHash}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-blue-400 hover:text-blue-300"
                                >
                                  View Tx
                                </a>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          {localPayments.length} total direct payment{localPayments.length !== 1 ? 's' : ''}
                        </p>
                      </div>
                    )}

                    {/* API Endpoints Reference */}
                    <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                      <h5 className="font-semibold text-purple-400 mb-3">BNBPay API Endpoints</h5>

                      {/* Invoice Endpoints */}
                      <p className="text-xs text-purple-300 font-semibold mb-2">Invoices (Gas-Free)</p>
                      <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">POST</span>
                          <code className="text-gray-400">/invoices</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/invoices/{'{id}'}</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/invoices/{'{id}'}/status</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">POST</span>
                          <code className="text-gray-400">/invoices/{'{id}'}/cancel</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">SSE</span>
                          <code className="text-gray-400">/invoices/{'{id}'}/stream-sse</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">WS</span>
                          <code className="text-gray-400">/invoices/{'{id}'}/stream</code>
                        </div>
                      </div>

                      {/* Payment Endpoints */}
                      <p className="text-xs text-purple-300 font-semibold mb-2">Payments & Sessions</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/payments</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/sessions</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/tokens</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/networks</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">POST</span>
                          <code className="text-gray-400">/relay/payment</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">POST</span>
                          <code className="text-gray-400">/relay/session/open</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded">GET</span>
                          <code className="text-gray-400">/can-pay</code>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">POST</span>
                          <code className="text-gray-400">/payments/build-intent</code>
                        </div>
                      </div>
                      <p className="text-xs text-gray-500 mt-3">
                        Full docs: <a href="https://api.bnbpay.org/docs" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">api.bnbpay.org/docs</a>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
