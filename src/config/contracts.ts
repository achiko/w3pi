export type ContractAddresses = {
  w3piToken: string
  usdcToken: string
  oracle: string
  registry: string
  dex: string
  portfolio: string
  portfolioManager: string
  staking: string
  wdotToken?: string
  wpolyxToken?: string
}

export type DeploymentConfig = {
  network: string
  rpcUrl: string
  deployedAt: string
  readonlyCallerAddress: string
  contracts: ContractAddresses
}

export const USDC_DECIMALS = 6
export const WDOT_DECIMALS = 10
export const WPOLYX_DECIMALS = 6

export const deploymentConfig: DeploymentConfig = {
  network: import.meta.env.VITE_W3PI_NETWORK,
  rpcUrl: import.meta.env.VITE_W3PI_RPC_URL,
  deployedAt: import.meta.env.VITE_W3PI_DEPLOYED_AT,
  readonlyCallerAddress: import.meta.env.VITE_W3PI_READONLY_CALLER_ADDRESS ?? '',
  contracts: {
    w3piToken: import.meta.env.VITE_W3PI_TOKEN_ADDRESS,
    usdcToken: import.meta.env.VITE_USDC_TOKEN_ADDRESS,
    oracle: import.meta.env.VITE_ORACLE_ADDRESS,
    registry: import.meta.env.VITE_REGISTRY_ADDRESS,
    dex: import.meta.env.VITE_DEX_ADDRESS,
    portfolio: import.meta.env.VITE_PORTFOLIO_ADDRESS,
    portfolioManager: import.meta.env.VITE_PORTFOLIO_MANAGER_ADDRESS,
    staking: import.meta.env.VITE_STAKING_ADDRESS,
    wdotToken: import.meta.env.VITE_WDOT_TOKEN_ADDRESS,
    wpolyxToken: import.meta.env.VITE_WPOLYX_TOKEN_ADDRESS,
  },
}

function normalizeAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function addressMatches(address: string | undefined, targetAddress: string | undefined) {
  const normalizedAddress = normalizeAddress(address)
  const normalizedTargetAddress = normalizeAddress(targetAddress)

  return Boolean(normalizedAddress && normalizedAddress === normalizedTargetAddress)
}

export function resolveTokenDecimals(address: string | undefined, chainDecimals: number): number
export function resolveTokenDecimals(address: string | undefined, chainDecimals: number | undefined): number | undefined
export function resolveTokenDecimals(address: string | undefined, chainDecimals: number | undefined) {
  if (addressMatches(address, deploymentConfig.contracts.usdcToken)) {
    return USDC_DECIMALS
  }

  if (addressMatches(address, deploymentConfig.contracts.wdotToken)) {
    return WDOT_DECIMALS
  }

  if (addressMatches(address, deploymentConfig.contracts.wpolyxToken)) {
    return WPOLYX_DECIMALS
  }

  return chainDecimals
}
