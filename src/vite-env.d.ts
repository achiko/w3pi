/// <reference types="vite/client" />

declare const __APP_VERSION__: string

interface ImportMetaEnv {
  readonly VITE_W3PI_NETWORK: string
  readonly VITE_W3PI_RPC_URL: string
  readonly VITE_W3PI_DEPLOYED_AT: string
  readonly VITE_W3PI_READONLY_CALLER_ADDRESS?: string
  readonly VITE_W3PI_TOKEN_ADDRESS: string
  readonly VITE_USDC_TOKEN_ADDRESS: string
  readonly VITE_ORACLE_ADDRESS: string
  readonly VITE_REGISTRY_ADDRESS: string
  readonly VITE_DEX_ADDRESS: string
  readonly VITE_PORTFOLIO_ADDRESS: string
  readonly VITE_PORTFOLIO_MANAGER_ADDRESS: string
  readonly VITE_STAKING_ADDRESS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
