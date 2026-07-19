import type { DedotClient } from 'dedot'
import { Contract } from 'dedot/contracts'
import portfolioMetadata from '../../abis/portfolio.json'
import registryMetadata from '../../abis/registry.json'
import tokenMetadata from '../../abis/token.json'
import { deploymentConfig, resolveTokenDecimals } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'
import type { PortfolioContractApi } from '@/contracts/portfolio'
import type { PortfolioTokenHolding } from '@/contracts/portfolio/types'
import type { RegistryContractApi } from '@/contracts/registry'
import type { RegistryEnrichedTokenData, RegistryError } from '@/contracts/registry/types'

const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

export type SerializedTokenHolding = {
  amount: string
  targetWeightBp: number
  lastRebalance: string
  feesCollected: string
}

export type TokenExecutionContext = {
  tokenId: number
  tokenAddr: string
  tokenDecimals?: number
  tokenName?: string
  tokenSymbol?: string
  price: string
  marketCap: string
  holding: SerializedTokenHolding
}

export type RegisteredTokenDiagnostic = {
  tokenId: number
  tokenAddr: string
  price: string
  marketCap: string
}

export type TokenExecutionContextsResult = {
  contexts: TokenExecutionContext[]
  heldTokenIds: number[]
  registryTokenCount: number
  registeredTokens: RegisteredTokenDiagnostic[]
  skippedHeldTokenIds: number[]
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

type LoadTokenExecutionContextsOptions = {
  caller?: string
}

function requireValue(value: string, label: string) {
  if (!value) {
    throw new Error(`Missing ${label}`)
  }

  return value
}

function stringifyChainValue(value: bigint | number | string) {
  return value.toString()
}

function normalizeDecimals(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }

  if (typeof value === 'string') {
    const parsed = Number(value)

    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed
    }
  }

  return undefined
}

function normalizeTokenText(value: unknown) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : undefined
}

function serializeHolding(holding: PortfolioTokenHolding): SerializedTokenHolding {
  return {
    amount: stringifyChainValue(holding.amount),
    targetWeightBp: holding.targetWeightBp,
    lastRebalance: stringifyChainValue(holding.lastRebalance),
    feesCollected: stringifyChainValue(holding.feesCollected),
  }
}

function resolveCaller(caller?: string) {
  return caller || deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    if (isAccountUnmappedError(error)) {
      return 'Revive account mapping is required for the read-only caller. Set VITE_W3PI_READONLY_CALLER_ADDRESS to a mapped account or call revive.mapAccount for that account.'
    }

    return error.message
  }

  return 'Unable to connect to RPC'
}

function isAccountUnmappedError(error: unknown) {
  return error instanceof Error && /AccountUnmapped|Revive::AccountUnmapped|map_account|mapAccount/i.test(error.message)
}

function serializeRegisteredToken(tokenId: number, tokenData: RegistryEnrichedTokenData): RegisteredTokenDiagnostic {
  return {
    tokenId,
    tokenAddr: tokenData.tokenContract,
    price: stringifyChainValue(tokenData.price),
    marketCap: stringifyChainValue(tokenData.marketCap),
  }
}

async function loadTokenMetadata(
  tokenAddress: string,
  client: DedotClient,
  caller: string,
): Promise<Pick<TokenExecutionContext, 'tokenDecimals' | 'tokenName' | 'tokenSymbol'>> {
  try {
    const token = new Contract(client, tokenMetadata, tokenAddress, {
      defaultCaller: caller,
    })
    const [decimalsResult, nameResult, symbolResult] = await Promise.all([
      token.query.psp22MetadataTokenDecimals(),
      token.query.psp22MetadataTokenName(),
      token.query.psp22MetadataTokenSymbol(),
    ])

    return {
      tokenDecimals: resolveTokenDecimals(tokenAddress, normalizeDecimals(decimalsResult.data)),
      tokenName: normalizeTokenText(nameResult.data),
      tokenSymbol: normalizeTokenText(symbolResult.data),
    }
  } catch (error) {
    if (isAccountUnmappedError(error)) {
      throw error
    }

    return {}
  }
}

async function loadTokenContext(
  tokenId: number,
  portfolio: Contract<PortfolioContractApi>,
  registry: Contract<RegistryContractApi>,
  client: DedotClient,
  caller: string,
): Promise<TokenExecutionContext | undefined> {
  try {
    const holdingResult = await portfolio.query.getTokenHolding(tokenId)
    const holding = holdingResult.data

    if (!holding) {
      return undefined
    }

    const tokenDataResult = await registry.query.getTokenData(tokenId)
    const tokenData = tokenDataResult.data as TokenDataResult

    if (!tokenData.isOk) {
      return undefined
    }

    const tokenIdentity = await loadTokenMetadata(tokenData.value.tokenContract, client, caller)

    return {
      tokenId,
      tokenAddr: tokenData.value.tokenContract,
      ...tokenIdentity,
      price: stringifyChainValue(tokenData.value.price),
      marketCap: stringifyChainValue(tokenData.value.marketCap),
      holding: serializeHolding(holding),
    }
  } catch (error) {
    if (isAccountUnmappedError(error)) {
      throw error
    }

    return undefined
  }
}

async function loadRegisteredToken(
  tokenId: number,
  registry: Contract<RegistryContractApi>,
): Promise<RegisteredTokenDiagnostic | undefined> {
  try {
    const tokenDataResult = await registry.query.getTokenData(tokenId)
    const tokenData = tokenDataResult.data as TokenDataResult

    if (!tokenData.isOk) {
      return undefined
    }

    return serializeRegisteredToken(tokenId, tokenData.value)
  } catch (error) {
    if (isAccountUnmappedError(error)) {
      throw error
    }

    return undefined
  }
}

async function loadRegisteredTokens(registry: Contract<RegistryContractApi>) {
  const tokenCountResult = await registry.query.getTokenCount()
  const maxTokenIdResult = await registry.query.getMaxTokenId()
  const registryTokenCount = tokenCountResult.data
  const maxTokenId = maxTokenIdResult.data

  if (maxTokenId === 0) {
    return {
      registryTokenCount,
      registeredTokens: [],
    }
  }

  const tokenIds = Array.from({ length: maxTokenId }, (_, index) => index + 1)
  const registeredTokens = await Promise.all(tokenIds.map((tokenId) => loadRegisteredToken(tokenId, registry)))

  return {
    registryTokenCount,
    registeredTokens: registeredTokens.filter((token): token is RegisteredTokenDiagnostic => Boolean(token)),
  }
}

export async function loadTokenExecutionContexts(
  options: LoadTokenExecutionContextsOptions = {},
): Promise<TokenExecutionContextsResult> {
  const portfolioAddress = requireValue(deploymentConfig.contracts.portfolio, 'VITE_PORTFOLIO_ADDRESS')
  const registryAddress = requireValue(deploymentConfig.contracts.registry, 'VITE_REGISTRY_ADDRESS')
  const caller = resolveCaller(options.caller)
  try {
    const client = await getDedotReadClient()
    const connectedClient = client

    const portfolio = new Contract<PortfolioContractApi>(connectedClient, portfolioMetadata, portfolioAddress, {
      defaultCaller: caller,
    })
    const registry = new Contract<RegistryContractApi>(connectedClient, registryMetadata, registryAddress, {
      defaultCaller: caller,
    })

    const idsResult = await portfolio.query.getHeldTokenIds()
    const heldTokenIds = idsResult.data
    const [contexts, registryDiagnostic] = await Promise.all([
      Promise.all(heldTokenIds.map((tokenId) => loadTokenContext(tokenId, portfolio, registry, connectedClient, caller))),
      loadRegisteredTokens(registry),
    ])
    const validContexts = contexts.filter((context): context is TokenExecutionContext => Boolean(context))
    const validContextIds = new Set(validContexts.map((context) => context.tokenId))

    return {
      contexts: validContexts,
      heldTokenIds,
      registryTokenCount: registryDiagnostic.registryTokenCount,
      registeredTokens: registryDiagnostic.registeredTokens,
      skippedHeldTokenIds: heldTokenIds.filter((tokenId) => !validContextIds.has(tokenId)),
    }
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
