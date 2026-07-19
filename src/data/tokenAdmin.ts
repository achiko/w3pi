import type { DedotClient } from 'dedot'
import { Contract, toEvmAddress } from 'dedot/contracts'
import tokenMetadata from '../../abis/token.json'
import portfolioMetadata from '../../abis/portfolio.json'
import registryMetadata from '../../abis/registry.json'
import { deploymentConfig, resolveTokenDecimals } from '@/config/contracts'
import type { PortfolioContractApi } from '@/contracts/portfolio'
import type { PortfolioTokenHolding } from '@/contracts/portfolio/types'
import type { RegistryContractApi } from '@/contracts/registry'
import type { RegistryEnrichedTokenData, RegistryError } from '@/contracts/registry/types'
import { getDedotReadClient } from '@/data/dedotReadClient'
import {
  contractReadScheduler,
  type ContractReadScheduler,
} from '@/lib/contractReadScheduler'

const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

export type TokenAdminSummary = {
  owner: string
  pendingOwner?: string
  authorizedMinters: string[]
  authorizedBurners: string[]
  connectedReviveAddress?: string
  isConnectedAccountOwner: boolean
  portfolio?: PortfolioAdminSummary
  tokens: AdminTokenSummary[]
}

export type PortfolioAdminSummary = {
  address: string
  basePortfolioValue: string
  currentPortfolioValue?: string
  deploymentTimestamp: string
  indexBaseValue: string
  isConnectedAccountOwner: boolean
  owner: string
  trackingEnabled: boolean
}

export type AdminTokenSummary = {
  address: string
  balance?: string
  decimals?: number
  label: string
  name?: string
  registryTokenId?: number
  symbol?: string
}

type TokenContractApi = {
  query: {
    getOwner: () => Promise<{ data: string }>
    getPendingOwner: () => Promise<{ data?: string }>
    getAuthorizedMinters: () => Promise<{ data: string[] }>
    getAuthorizedBurners: () => Promise<{ data: string[] }>
    psp22BalanceOf: (owner: string) => Promise<{ data: bigint }>
    psp22MetadataTokenDecimals: () => Promise<{ data: number }>
    psp22MetadataTokenName: () => Promise<{ data?: string }>
    psp22MetadataTokenSymbol: () => Promise<{ data?: string }>
  }
}

type PortfolioAdminContractApi = PortfolioContractApi & {
  query: PortfolioContractApi['query'] & {
    getOwner: () => Promise<{ data: string }>
    getIndexBaseMetrics: () => Promise<{ data: [bigint, bigint, bigint, boolean] }>
    getHeldTokenIds: () => Promise<{ data: number[] }>
    getTokenHolding: (tokenId: number) => Promise<{ data?: PortfolioTokenHolding }>
  }
}

type TokenDataResult =
  | {
      isOk: true
      isErr?: false
      value: RegistryEnrichedTokenData
    }
  | {
      isOk?: false
      isErr: true
      err: RegistryError
    }

type LoadTokenAdminSummaryOptions = {
  connectedAddress?: string
  caller?: string
}

function requireValue(value: string, label: string) {
  if (!value) {
    throw new Error(`Missing ${label}`)
  }

  return value
}

function resolveCaller(caller?: string) {
  return caller || deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
}

function normalizeHexAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function normalizeTokenText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : undefined
}

function isAccountUnmappedError(error: unknown) {
  return error instanceof Error && /AccountUnmapped|Revive::AccountUnmapped|map_account|mapAccount/i.test(error.message)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    if (isAccountUnmappedError(error)) {
      return 'Revive account mapping is required for the read-only caller. Set VITE_W3PI_READONLY_CALLER_ADDRESS to a mapped account or call revive.mapAccount for that account.'
    }

    return error.message
  }

  return 'Unable to load token admin status'
}

export function toReviveAddress(address: string | undefined) {
  if (!address) {
    return undefined
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return normalizeHexAddress(address)
  }

  try {
    return normalizeHexAddress(toEvmAddress(address))
  } catch {
    return undefined
  }
}

async function loadTokenMetadata(
  client: DedotClient,
  scheduler: ContractReadScheduler,
  address: string,
  caller: string,
  connectedReviveAddress: string | undefined,
  label: string,
  registryTokenId?: number,
): Promise<AdminTokenSummary> {
  const token = new Contract(client, tokenMetadata, address, {
    defaultCaller: caller,
  }) as unknown as TokenContractApi

  try {
    const [decimalsResult, nameResult, symbolResult, balanceResult] = await Promise.all([
      scheduler.schedule(() => token.query.psp22MetadataTokenDecimals()),
      scheduler.schedule(() => token.query.psp22MetadataTokenName()),
      scheduler.schedule(() => token.query.psp22MetadataTokenSymbol()),
      connectedReviveAddress
        ? scheduler.schedule(() => token.query.psp22BalanceOf(connectedReviveAddress))
        : Promise.resolve(undefined),
    ])

    return {
      address,
      balance: balanceResult?.data.toString(),
      decimals: resolveTokenDecimals(address, decimalsResult.data),
      label,
      name: normalizeTokenText(nameResult.data),
      registryTokenId,
      symbol: normalizeTokenText(symbolResult.data),
    }
  } catch (error) {
    if (isAccountUnmappedError(error)) {
      throw error
    }

    return {
      address,
      label,
      registryTokenId,
    }
  }
}

async function loadRegistryTokenAddresses(
  client: DedotClient,
  scheduler: ContractReadScheduler,
  caller: string,
) {
  const registryAddress = deploymentConfig.contracts.registry

  if (!registryAddress) {
    return []
  }

  const registry = new Contract<RegistryContractApi>(client, registryMetadata, registryAddress, {
    defaultCaller: caller,
  })
  const maxTokenIdResult = await scheduler.schedule(() => registry.query.getMaxTokenId())
  const maxTokenId = maxTokenIdResult.data

  if (maxTokenId === 0) {
    return []
  }

  const tokenIds = Array.from({ length: maxTokenId }, (_, index) => index + 1)
  const tokenResults = await Promise.all(
    tokenIds.map(async (tokenId) => {
      try {
        const tokenDataResult = await scheduler.schedule(() => registry.query.getTokenData(tokenId))
        const tokenData = tokenDataResult.data as TokenDataResult

        if (!tokenData.isOk) {
          return undefined
        }

        return {
          address: normalizeHexAddress(tokenData.value.tokenContract) ?? tokenData.value.tokenContract,
          registryTokenId: tokenId,
        }
      } catch (error) {
        if (isAccountUnmappedError(error)) {
          throw error
        }

        return undefined
      }
    }),
  )

  return tokenResults.filter((token): token is { address: string; registryTokenId: number } => Boolean(token))
}

async function loadAdminTokens(
  client: DedotClient,
  scheduler: ContractReadScheduler,
  caller: string,
  connectedReviveAddress: string | undefined,
) {
  const tokens = new Map<string, { address: string; label: string; registryTokenId?: number }>()

  function addToken(address: string | undefined, label: string, registryTokenId?: number) {
    if (!address) {
      return
    }

    const normalizedAddress = normalizeHexAddress(address) ?? address

    if (!tokens.has(normalizedAddress)) {
      tokens.set(normalizedAddress, {
        address: normalizedAddress,
        label,
        registryTokenId,
      })
    }
  }

  addToken(deploymentConfig.contracts.w3piToken, 'W3PI Token')
  addToken(deploymentConfig.contracts.usdcToken, 'USDC Token')

  const registryTokens = await loadRegistryTokenAddresses(client, scheduler, caller)

  for (const token of registryTokens) {
    addToken(token.address, `Registry Token #${token.registryTokenId}`, token.registryTokenId)
  }

  return Promise.all(
    Array.from(tokens.values()).map((token) =>
      loadTokenMetadata(
        client,
        scheduler,
        token.address,
        caller,
        connectedReviveAddress,
        token.label,
        token.registryTokenId,
      ),
    ),
  )
}

async function loadPortfolioAdminSummary(
  client: DedotClient,
  scheduler: ContractReadScheduler,
  caller: string,
  connectedReviveAddress: string | undefined,
): Promise<PortfolioAdminSummary | undefined> {
  const portfolioAddress = deploymentConfig.contracts.portfolio

  if (!portfolioAddress) {
    return undefined
  }

  const normalizedAddress = normalizeHexAddress(portfolioAddress) ?? portfolioAddress
  const portfolio = new Contract<PortfolioContractApi>(client, portfolioMetadata, normalizedAddress, {
    defaultCaller: caller,
  }) as unknown as PortfolioAdminContractApi
  const [ownerResult, metricsResult] = await Promise.all([
    scheduler.schedule(() => portfolio.query.getOwner()),
    scheduler.schedule(() => portfolio.query.getIndexBaseMetrics()),
  ])
  const owner = normalizeHexAddress(ownerResult.data) ?? ownerResult.data
  const [indexBaseValue, basePortfolioValue, deploymentTimestamp, trackingEnabled] = metricsResult.data
  const currentPortfolioValue = await loadCurrentPortfolioValue(client, scheduler, caller, portfolio)

  return {
    address: normalizedAddress,
    basePortfolioValue: basePortfolioValue.toString(),
    currentPortfolioValue,
    deploymentTimestamp: deploymentTimestamp.toString(),
    indexBaseValue: indexBaseValue.toString(),
    isConnectedAccountOwner: Boolean(connectedReviveAddress && connectedReviveAddress === owner),
    owner,
    trackingEnabled,
  }
}

async function loadCurrentPortfolioValue(
  client: DedotClient,
  scheduler: ContractReadScheduler,
  caller: string,
  portfolio: PortfolioAdminContractApi,
) {
  const registryAddress = deploymentConfig.contracts.registry

  if (!registryAddress) {
    return undefined
  }

  const registry = new Contract<RegistryContractApi>(client, registryMetadata, registryAddress, {
    defaultCaller: caller,
  })
  const heldTokenIdsResult = await scheduler.schedule(() => portfolio.query.getHeldTokenIds())
  let total = 0n

  for (const tokenId of heldTokenIdsResult.data) {
    const [holdingResult, tokenDataResult] = await Promise.all([
      scheduler.schedule(() => portfolio.query.getTokenHolding(tokenId)),
      scheduler.schedule(() => registry.query.getTokenData(tokenId)),
    ])
    const holding = holdingResult.data
    const tokenData = tokenDataResult.data as TokenDataResult

    if (holding && tokenData.isOk) {
      total += holding.amount * tokenData.value.price
    }
  }

  return total.toString()
}

export async function loadTokenAdminSummary(
  options: LoadTokenAdminSummaryOptions = {},
): Promise<TokenAdminSummary> {
  const tokenAddress = requireValue(deploymentConfig.contracts.w3piToken, 'VITE_W3PI_TOKEN_ADDRESS')
  const caller = resolveCaller(options.caller)
  const connectedReviveAddress = toReviveAddress(options.connectedAddress)
  const scheduler = contractReadScheduler

  try {
    const client = await getDedotReadClient()
    const token = new Contract(client, tokenMetadata, tokenAddress, {
      defaultCaller: caller,
    }) as unknown as TokenContractApi
    const ownerResult = await scheduler.schedule(() => token.query.getOwner())
    const owner = normalizeHexAddress(ownerResult.data) ?? ownerResult.data
    const isConnectedAccountOwner = Boolean(connectedReviveAddress && connectedReviveAddress === owner)

    if (!isConnectedAccountOwner) {
      return {
        owner,
        authorizedMinters: [],
        authorizedBurners: [],
        connectedReviveAddress,
        isConnectedAccountOwner: false,
        tokens: [],
      }
    }

    const [pendingOwnerResult, mintersResult, burnersResult] = await Promise.all([
      scheduler.schedule(() => token.query.getPendingOwner()),
      scheduler.schedule(() => token.query.getAuthorizedMinters()),
      scheduler.schedule(() => token.query.getAuthorizedBurners()),
    ])
    const pendingOwner = normalizeHexAddress(pendingOwnerResult.data)
    const [tokens, portfolio] = await Promise.all([
      loadAdminTokens(client, scheduler, caller, connectedReviveAddress),
      loadPortfolioAdminSummary(client, scheduler, caller, connectedReviveAddress),
    ])

    return {
      owner,
      pendingOwner,
      authorizedMinters: mintersResult.data.map((address) => normalizeHexAddress(address) ?? address),
      authorizedBurners: burnersResult.data.map((address) => normalizeHexAddress(address) ?? address),
      connectedReviveAddress,
      isConnectedAccountOwner,
      portfolio,
      tokens,
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
