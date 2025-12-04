/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_PAYMENT_REGISTRY?: string;
  readonly VITE_SUBSCRIPTION_MANAGER?: string;
  readonly VITE_BNBPAY_ROUTER?: string;
  readonly VITE_USD1_ADDRESS?: string;
  readonly VITE_SESSION_STORE?: string;
  readonly VITE_BNBPAY_API_URL?: string;
  readonly VITE_PERMIT2_ADDRESS?: string;
  readonly VITE_FEE_RECIPIENT?: string;
  readonly VITE_NETWORK_NAME?: string;
  readonly VITE_BLOCK_EXPLORER?: string;
  readonly VITE_TOKEN_BNB?: string;
  readonly VITE_TOKEN_USDT?: string;
  readonly VITE_TOKEN_BUSD?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
