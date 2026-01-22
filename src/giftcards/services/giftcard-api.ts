/**
 * Gift Card API Service
 * Uses the BNBPay API for gift card create/claim/redeem flows.
 */

import { ethers, type TypedDataField } from 'ethers';
import type { BNBPayCard, Token, GiftCardCreateResponse, GiftCardRedeemResponse, NetworkKey, GiftCardType } from '../types';
import { buildPaymentIntent, type BuildIntentResponse } from '../../lib/bnbpay-api';
import { getProvider, NETWORKS, type NetworkType } from '../../lib/web3';
import {
  getPermit2Nonce,
  getPermit2Address,
  signPermit2WithWitness,
  getEIP2612Nonce,
  signEIP2612,
  generateEIP3009Nonce,
  signEIP3009,
} from '../../lib/gasless-payments';
import { getTokenInfo } from './tokens';
import { toNetworkType } from '../types';

const API_BASE_URL = '/api';

const FLEX_WITNESS_TYPES: Record<string, TypedDataField[]> = {
  FlexWitness: [
    { name: 'schemeId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'salt', type: 'bytes32' },
  ],
};

const CLAIMABLE_SESSION_TYPES: Record<string, TypedDataField[]> = {
  RateLimit: [
    { name: 'maxTxPerMinute', type: 'uint32' },
    { name: 'maxTxPerDay', type: 'uint32' },
    { name: 'coolDownSeconds', type: 'uint32' },
  ],
  ClaimableSessionGrant: [
    { name: 'sessionId', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'merchantScope', type: 'bytes32' },
    { name: 'deadline', type: 'uint32' },
    { name: 'expiresAt', type: 'uint32' },
    { name: 'epoch', type: 'uint32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'claimSigner', type: 'address' },
    { name: 'rateLimit', type: 'RateLimit' },
    { name: 'schemesHash', type: 'bytes32' },
    { name: 'tokenCapsHash', type: 'bytes32' },
  ],
};

const CLAIM_SESSION_TYPES: Record<string, TypedDataField[]> = {
  ClaimSession: [
    { name: 'sessionId', type: 'bytes32' },
    { name: 'agent', type: 'address' },
    { name: 'epoch', type: 'uint32' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const SESSION_SPEND_TYPES: Record<string, TypedDataField[]> = {
  SessionSpendAuth: [
    { name: 'sessionId', type: 'bytes32' },
    { name: 'intentHash', type: 'bytes32' },
    { name: 'schemeId', type: 'bytes32' },
    { name: 'spendNonce', type: 'uint256' },
    { name: 'expiresAt', type: 'uint256' },
  ],
};

const TOKEN_CAP_TYPEHASH = ethers.keccak256(
  ethers.toUtf8Bytes('TokenCap(address token,uint128 cap,uint128 dailyCap)')
);

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message = payload?.error || payload?.message || response.statusText;
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function resolveTokenAddress(networkType: NetworkType, token: Token): string {
  const config = NETWORKS[networkType];
  const address = config.tokens[token];
  if (!address) {
    throw new Error(`Unsupported token ${token} on ${networkType}`);
  }
  return ethers.getAddress(address);
}

function getRouterDomain(networkType: NetworkType) {
  const config = NETWORKS[networkType];
  return {
    name: 'BNBPayRouter',
    version: '1',
    chainId: config.chainIdNumber,
    verifyingContract: config.contracts.bnbPayRouter,
  } as const;
}

function getSessionDomain(networkType: NetworkType) {
  const config = NETWORKS[networkType];
  return {
    name: 'BNBPay Session',
    version: '1',
    chainId: config.chainIdNumber,
    verifyingContract: config.contracts.sessionStore,
  } as const;
}

function hashSchemes(schemes: string[]): string {
  if (schemes.length === 0) {
    return ethers.keccak256('0x');
  }
  const encoded = schemes.map((scheme) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['bytes32'], [scheme])));
  return ethers.keccak256(ethers.concat(encoded));
}

function hashTokenCaps(caps: { token: string; cap: bigint; dailyCap: bigint }[]): string {
  if (caps.length === 0) {
    return ethers.keccak256('0x');
  }
  const encoded = caps.map((cap) =>
    ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'uint128', 'uint128'],
        [TOKEN_CAP_TYPEHASH, cap.token, cap.cap, cap.dailyCap]
      )
    )
  );
  return ethers.keccak256(ethers.concat(encoded));
}

async function getSigner() {
  const provider = await getProvider();
  if (!provider) {
    throw new Error('No Web3 wallet detected');
  }
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  const network = await provider.getNetwork();
  return {
    provider,
    signer,
    address: ethers.getAddress(address),
    chainId: Number(network.chainId),
  };
}

async function fetchTokenName(tokenAddress: string, provider: ethers.BrowserProvider): Promise<string> {
  const erc20 = new ethers.Contract(tokenAddress, ['function name() view returns (string)'], provider);
  return erc20.name();
}

async function buildGiftCardPayment(params: {
  network: NetworkKey;
  networkType: NetworkType;
  payerAddress: string;
  token: Token;
  amount: string;
  merchant: string;
  sessionId?: string;
}): Promise<{
  payload: BuildIntentResponse;
  scheme: 'permit2' | 'eip2612' | 'eip3009';
}> {
  const tokenInfo = getTokenInfo(params.token, params.networkType);
  const decimals = tokenInfo?.decimals;
  const referenceId = `giftcard_${Date.now()}`;
  const buildRequest = {
    mode: 'minimal' as const,
    network: params.network,
    merchant: params.merchant,
    token: resolveTokenAddress(params.networkType, params.token),
    amount: params.amount,
    decimals,
    scheme: 'permit2' as const,
    sessionId: params.sessionId,
    payer: params.payerAddress,
    referenceId,
    baseReference: referenceId,
  };

  const payload = await buildPaymentIntent(buildRequest);
  const scheme = (payload.hints?.schemeSelected ?? payload.input.scheme) as string;
  if (scheme !== 'permit2' && scheme !== 'eip2612' && scheme !== 'eip3009') {
    throw new Error(`Unsupported scheme for gift cards: ${scheme}`);
  }
  return { payload, scheme };
}

async function signWitness(params: {
  signer: ethers.Signer;
  payload: BuildIntentResponse;
  scheme: string;
  payerAddress: string;
  routerDomain: { name: string; version: string; chainId: number; verifyingContract: string };
}) {
  const schemeId = ethers.keccak256(ethers.toUtf8Bytes(params.scheme));
  const salt = ethers.zeroPadValue(params.payload.input.salt, 32);
  const witness = {
    schemeId,
    intentHash: params.payload.derived.intentHash,
    payer: params.payerAddress,
    salt,
  };
  const signature = await params.signer.signTypedData(params.routerDomain, FLEX_WITNESS_TYPES, witness);
  return { witness, signature };
}

async function signPermitPayload(params: {
  signer: ethers.Signer;
  provider: ethers.BrowserProvider;
  scheme: 'permit2' | 'eip2612' | 'eip3009';
  tokenAddress: string;
  amountWei: bigint;
  payerAddress: string;
  routerAddress: string;
  networkType: NetworkType;
  chainId: number;
  permit2WitnessTypeString?: string;
  witness: { schemeId: string; intentHash: string; payer: string; salt: string };
}) {
  const now = Math.floor(Date.now() / 1000);
  if (params.scheme === 'permit2') {
    const nonce = await getPermit2Nonce(params.payerAddress, params.provider, params.networkType);
    const deadline = now + 3600;
    const permit2Address = getPermit2Address(params.networkType);
    const signature = await signPermit2WithWitness({
      tokenAddress: params.tokenAddress,
      amount: params.amountWei,
      spender: params.routerAddress,
      deadline,
      nonce,
      chainId: params.chainId,
      permit2Address,
      permit2WitnessTypeString: params.permit2WitnessTypeString,
      witness: params.witness,
      signer: params.signer,
    });

    return {
      permit: {
        permitted: {
          token: params.tokenAddress,
          amount: params.amountWei.toString(),
        },
        nonce,
        deadline,
      },
      transferDetails: {
        to: params.routerAddress,
        requestedAmount: params.amountWei.toString(),
      },
      signature,
    };
  }

  const tokenName = await fetchTokenName(params.tokenAddress, params.provider);
  if (params.scheme === 'eip2612') {
    const nonce = await getEIP2612Nonce(params.tokenAddress, params.payerAddress, params.provider);
    const deadline = now + 3600;
    const sig = await signEIP2612({
      tokenAddress: params.tokenAddress,
      amount: params.amountWei,
      spender: params.routerAddress,
      deadline,
      nonce,
      chainId: params.chainId,
      tokenName,
      signer: params.signer,
    });
    return {
      deadline,
      v: sig.v,
      r: sig.r,
      s: sig.s,
    };
  }

  const authNonce = generateEIP3009Nonce();
  const validAfter = 0;
  const validBefore = now + 3600;
  const sig = await signEIP3009({
    tokenAddress: params.tokenAddress,
    to: params.routerAddress,
    amount: params.amountWei,
    validAfter,
    validBefore,
    nonce: authNonce,
    chainId: params.chainId,
    tokenName,
    signer: params.signer,
  });
  return {
    validAfter,
    validBefore,
    authNonce,
    v: sig.v,
    r: sig.r,
    s: sig.s,
  };
}

async function buildClaimableSessionGrant(params: {
  signer: ethers.Signer;
  networkType: NetworkType;
  payer: string;
  sessionId: string;
  claimSigner: string;
  schemeId: string;
  tokenAddress: string;
  amountWei: bigint;
  expiresAt: number;
}) {
  const deadline = Math.floor(Date.now() / 1000) + 900;
  const rateLimit = { maxTxPerMinute: 0, maxTxPerDay: 0, coolDownSeconds: 0 };
  const tokenCaps = [{ token: params.tokenAddress, cap: params.amountWei, dailyCap: params.amountWei }];
  const allowedSchemes = [params.schemeId];
  const merchantScope = ethers.ZeroHash;

  const grant = {
    sessionId: params.sessionId,
    payer: params.payer,
    merchantScope,
    deadline,
    expiresAt: params.expiresAt,
    epoch: 1,
    nonce: 1n,
    claimSigner: params.claimSigner,
    rateLimit,
    allowedSchemes,
    tokenCaps: tokenCaps.map((cap) => ({
      token: cap.token,
      cap: cap.cap.toString(),
      dailyCap: cap.dailyCap.toString(),
    })),
  };

  const message = {
    sessionId: params.sessionId,
    payer: params.payer,
    merchantScope,
    deadline,
    expiresAt: params.expiresAt,
    epoch: 1,
    nonce: 1n,
    claimSigner: params.claimSigner,
    rateLimit,
    schemesHash: hashSchemes(allowedSchemes),
    tokenCapsHash: hashTokenCaps(tokenCaps),
  };

  const domain = getSessionDomain(params.networkType);
  const signature = await params.signer.signTypedData(domain, CLAIMABLE_SESSION_TYPES, message);

  return { grant, signature };
}

function buildRedeemUrl(cardId: string, redeemKey?: string, accessCode?: string): string {
  const base = `${window.location.origin}/giftcard/redeem?cardId=${encodeURIComponent(cardId)}`;
  if (redeemKey) {
    return `${base}#redeemKey=${encodeURIComponent(redeemKey)}`;
  }
  if (accessCode) {
    return `${base}#accessCode=${encodeURIComponent(accessCode)}`;
  }
  return base;
}

export class GiftCardError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'GiftCardError';
  }
}

export async function createGiftCard(params: {
  amount: string;
  token: Token;
  recipientAddress?: string;
  message?: string;
  senderName?: string;
  expiresInDays: number;
  network: NetworkKey;
  merchantAddress: string;
  cardType: GiftCardType;
}): Promise<GiftCardCreateResponse> {
  try {
    const { provider, signer, address, chainId } = await getSigner();
    const networkType = toNetworkType(params.network);
    const config = NETWORKS[networkType];

    if (chainId !== config.chainIdNumber) {
      throw new GiftCardError('Wallet network does not match selected network', 'NETWORK_MISMATCH');
    }
    if (ethers.getAddress(params.merchantAddress) !== address) {
      throw new GiftCardError('Connected wallet does not match creator', 'WALLET_MISMATCH');
    }

    if (params.cardType === 'direct' && !params.recipientAddress) {
      throw new GiftCardError('Recipient address is required for direct cards', 'RECIPIENT_REQUIRED');
    }

    const tokenAddress = resolveTokenAddress(networkType, params.token);
    if (tokenAddress === ethers.ZeroAddress) {
      throw new GiftCardError('Native BNB gift cards require escrow and are not supported yet', 'UNSUPPORTED_TOKEN');
    }
    const sessionId = params.cardType === 'open' ? ethers.hexlify(ethers.randomBytes(32)) : undefined;
    const merchant = params.cardType === 'open'
      ? ethers.ZeroAddress
      : ethers.getAddress(params.recipientAddress!);

    const { payload, scheme } = await buildGiftCardPayment({
      network: params.network,
      networkType,
      payerAddress: address,
      token: params.token,
      amount: params.amount,
      merchant,
      sessionId,
    });

    const routerDomain = payload.signing.routerDomain ?? getRouterDomain(networkType);
    const { witness, signature: witnessSignature } = await signWitness({
      signer,
      payload,
      scheme,
      payerAddress: address,
      routerDomain,
    });

    const intent = payload.derived.intent;
    const permit = await signPermitPayload({
      signer,
      provider,
      scheme,
      tokenAddress,
      amountWei: BigInt(intent.amount),
      payerAddress: address,
      routerAddress: config.contracts.bnbPayRouter,
      networkType,
      chainId: config.chainIdNumber,
      permit2WitnessTypeString: payload.signing.permit2WitnessTypeString,
      witness,
    });

    const expiresAt = Math.floor(Date.now() / 1000) + params.expiresInDays * 24 * 60 * 60;
    let sessionPayload: { grant: Record<string, unknown>; signature: string } | undefined;
    let redeemKey: string | undefined;

    if (params.cardType === 'open') {
      const redeemWallet = ethers.Wallet.createRandom();
      redeemKey = redeemWallet.privateKey;
      const claimSigner = redeemWallet.address;

      sessionPayload = await buildClaimableSessionGrant({
        signer,
        networkType,
        payer: address,
        sessionId: sessionId!,
        claimSigner,
        schemeId: witness.schemeId,
        tokenAddress,
        amountWei: BigInt(intent.amount),
        expiresAt,
      });
    }

    const response = await fetch(`${API_BASE_URL}/giftcards/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        network: params.network,
        cardType: params.cardType,
        amount: params.amount,
        token: params.token,
        creator: address,
        recipient: params.recipientAddress,
        senderName: params.senderName,
        message: params.message,
        expiresAt,
        payment: {
          intent,
          witness,
          witnessSignature,
          reference: payload.input.baseReference,
          scheme,
          permit,
        },
        session: sessionPayload,
      }),
    });

    const result = await handleResponse<{ card: BNBPayCard; accessCode?: string }>(response);
    const redeemUrl = buildRedeemUrl(result.card.cardId, redeemKey, result.accessCode);

    return {
      success: true,
      card: result.card,
      redeemUrl,
      accessCode: result.accessCode,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create gift card';
    return {
      success: false,
      error: message,
    };
  }
}

export async function claimGiftCard(params: {
  card: BNBPayCard;
  redeemerAddress: string;
  redeemKey: string;
}): Promise<{ success: boolean; card?: BNBPayCard; error?: string }> {
  try {
    if (!params.card.sessionId || !params.card.sessionEpoch) {
      throw new Error('Claimable session data missing');
    }

    const networkType = toNetworkType(params.card.network);
    const domain = getSessionDomain(networkType);
    const deadline = Math.floor(Date.now() / 1000) + 900;
    const signer = new ethers.Wallet(params.redeemKey);

    const message = {
      sessionId: params.card.sessionId,
      agent: ethers.getAddress(params.redeemerAddress),
      epoch: params.card.sessionEpoch,
      deadline,
    };

    const signature = await signer.signTypedData(domain, CLAIM_SESSION_TYPES, message);

    const response = await fetch(`${API_BASE_URL}/giftcards/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: params.card.cardId,
        agent: params.redeemerAddress,
        deadline,
        signature,
      }),
    });

    const result = await handleResponse<BNBPayCard>(response);
    return { success: true, card: result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to claim gift card';
    return { success: false, error: message };
  }
}

async function signSessionSpendAuth(params: {
  card: BNBPayCard;
  signer: ethers.Signer;
  networkType: NetworkType;
}) {
  if (!params.card.sessionId || !params.card.sessionSpendNonce || !params.card.intentHash || !params.card.schemeId) {
    throw new Error('Session details missing for redemption');
  }

  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const message = {
    sessionId: params.card.sessionId,
    intentHash: params.card.intentHash,
    schemeId: params.card.schemeId,
    spendNonce: BigInt(params.card.sessionSpendNonce),
    expiresAt,
  };

  const domain = getRouterDomain(params.networkType);
  const signature = await params.signer.signTypedData(domain, SESSION_SPEND_TYPES, message);

  return { message, signature };
}

export async function redeemGiftCard(params: {
  card: BNBPayCard;
  accessCode?: string;
  redeemerAddress: string;
}): Promise<GiftCardRedeemResponse> {
  try {
    if (params.card.cardType === 'direct' && !params.accessCode) {
      throw new Error('Access code required');
    }

    const { signer } = await getSigner();
    const networkType = toNetworkType(params.card.network);

    let sessionAuth: any = undefined;
    let sessionAuthSignature: string | undefined = undefined;
    if (params.card.cardType === 'open') {
      const signed = await signSessionSpendAuth({
        card: params.card,
        signer,
        networkType,
      });
      sessionAuth = signed.message;
      sessionAuthSignature = signed.signature;
    }

    const response = await fetch(`${API_BASE_URL}/giftcards/redeem`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cardId: params.card.cardId,
        redeemer: params.redeemerAddress,
        accessCode: params.accessCode,
        sessionAuth,
        sessionAuthSignature,
      }),
    });

    return await handleResponse<GiftCardRedeemResponse>(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to redeem gift card';
    return { success: false, error: message };
  }
}

export async function getGiftCard(cardId: string): Promise<BNBPayCard | null> {
  const response = await fetch(`${API_BASE_URL}/giftcards/${cardId}`);
  if (!response.ok) return null;
  return response.json();
}

export async function getGiftCardsByMerchant(merchantAddress: string, network?: NetworkKey): Promise<BNBPayCard[]> {
  const params = new URLSearchParams({ wallet: merchantAddress, role: 'creator' });
  if (network) params.set('network', network);
  const response = await fetch(`${API_BASE_URL}/giftcards?${params.toString()}`);
  const data = await handleResponse<{ data: BNBPayCard[] }>(response);
  return data.data;
}

export async function getAllGiftCards(): Promise<BNBPayCard[]> {
  const response = await fetch(`${API_BASE_URL}/giftcards`);
  const data = await handleResponse<{ data: BNBPayCard[] }>(response);
  return data.data;
}

export async function cancelGiftCard(cardId: string): Promise<BNBPayCard | null> {
  const response = await fetch(`${API_BASE_URL}/giftcards/${cardId}/cancel`, { method: 'POST' });
  if (!response.ok) return null;
  return response.json();
}

export function subscribeToPaymentUpdates(
  paymentId: string,
  onUpdate: (status: 'pending' | 'confirmed' | 'failed', txHash?: string) => void
): () => void {
  let eventSource: EventSource | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;

    eventSource = new EventSource(`${API_BASE_URL}/payments/${paymentId}/stream-sse`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onUpdate(data.status, data.txHash);

        if (data.status === 'confirmed' || data.status === 'failed') {
          eventSource?.close();
        }
      } catch {
        // Ignore parse errors
      }
    };

    eventSource.onerror = () => {
      eventSource?.close();
      if (!closed) {
        setTimeout(connect, 5000);
      }
    };
  };

  connect();

  return () => {
    closed = true;
    eventSource?.close();
  };
}

export function formatCardAmount(amount: string, token: Token): string {
  const value = parseFloat(amount);
  if (isNaN(value)) return `0 ${token}`;

  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
  })} ${token}`;
}

export function formatCardStatus(status: BNBPayCard['status']): {
  label: string;
  color: string;
} {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'text-green-500' };
    case 'claimed':
      return { label: 'Claimed', color: 'text-amber-400' };
    case 'redeemed':
      return { label: 'Redeemed', color: 'text-blue-500' };
    case 'expired':
      return { label: 'Expired', color: 'text-gray-500' };
    case 'cancelled':
      return { label: 'Cancelled', color: 'text-red-500' };
    default:
      return { label: 'Unknown', color: 'text-gray-500' };
  }
}

export function isCardValid(card: BNBPayCard): boolean {
  if (card.status !== 'active' && card.status !== 'claimed') return false;
  if (card.expiresAt && card.expiresAt < Date.now()) return false;
  return true;
}

export function parseAmountInput(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    return parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned || '0';
}

export function validateAmount(amount: string, min: number = 0.01, max: number = 10000): {
  valid: boolean;
  error?: string;
} {
  const value = parseFloat(amount);

  if (isNaN(value)) {
    return { valid: false, error: 'Invalid amount' };
  }

  if (value < min) {
    return { valid: false, error: `Minimum amount is ${min}` };
  }

  if (value > max) {
    return { valid: false, error: `Maximum amount is ${max}` };
  }

  return { valid: true };
}

export function validateAddress(address: string): {
  valid: boolean;
  error?: string;
} {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }

  try {
    ethers.getAddress(address);
    return { valid: true };
  } catch {
    return { valid: false, error: 'Invalid wallet address' };
  }
}

export const giftCardApi = {
  createGiftCard,
  claimGiftCard,
  redeemGiftCard,
  getGiftCard,
  getGiftCardsByMerchant,
  getAllGiftCards,
  cancelGiftCard,
  subscribeToPaymentUpdates,
  formatCardAmount,
  formatCardStatus,
  isCardValid,
  parseAmountInput,
  validateAmount,
  validateAddress,
};

export default giftCardApi;
