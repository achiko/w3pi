import type { DedotClient } from 'dedot'
import { Contract, toEvmAddress } from 'dedot/contracts'
import tokenMetadata from '../../abis/token.json'
import { deploymentConfig, resolveTokenDecimals } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'

const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

export type HeaderTokenBalance = {
  address: string
  balance?: string
  decimals?: number
  id: 'w3pi' | 'usdc'
  label: string
  symbol: string
}

type TokenContractApi = {
  query: {
    psp22BalanceOf: (owner: string) => Promise<{ data: bigint }>
    psp22MetadataTokenDecimals: () => Promise<{ data: number }>
    psp22MetadataTokenSymbol: () => Promise<{ data?: string }>
  }
}

type LoadHeaderTokenBalancesOptions = {
  connectedAddress?: string
  caller?: string
}

function optionalTokenConfig(
  address: string | undefined,
  id: HeaderTokenBalance['id'],
  label: string,
  fallbackSymbol: string,
) {
  return address
    ? {
        address,
        fallbackSymbol,
        id,
        label,
      }
    : undefined
}

function resolveCaller(caller?: string) {
  return caller || deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
}

function normalizeHexAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function normalizeTokenSymbol(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : fallback
}

function isAccountUnmappedError(error: unknown) {
  return error instanceof Error && /AccountUnmapped|Revive::AccountUnmapped|map_account|mapAccount/i.test(error.message)
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    if (isAccountUnmappedError(error)) {
      return 'Revive account mapping is required for the connected account. Call revive.mapAccount for that account first.'
    }

    return error.message
  }

  return 'Unable to load token balances'
}

function toReviveAddress(address: string | undefined) {
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

async function loadTokenBalance(
  client: DedotClient,
  address: string,
  owner: string,
  caller: string,
  id: HeaderTokenBalance['id'],
  label: string,
  fallbackSymbol: string,
): Promise<HeaderTokenBalance> {
  const normalizedAddress = normalizeHexAddress(address) ?? address
  const token = new Contract(client, tokenMetadata, normalizedAddress, {
    defaultCaller: caller,
  }) as unknown as TokenContractApi

  const [decimalsResult, symbolResult, balanceResult] = await Promise.all([
    token.query.psp22MetadataTokenDecimals(),
    token.query.psp22MetadataTokenSymbol(),
    token.query.psp22BalanceOf(owner),
  ])

  return {
    address: normalizedAddress,
    balance: balanceResult.data.toString(),
    decimals: resolveTokenDecimals(normalizedAddress, decimalsResult.data),
    id,
    label,
    symbol: normalizeTokenSymbol(symbolResult.data, fallbackSymbol),
  }
}

export async function loadHeaderTokenBalances(
  options: LoadHeaderTokenBalancesOptions = {},
): Promise<HeaderTokenBalance[]> {
  const owner = toReviveAddress(options.connectedAddress)

  if (!owner) {
    throw new Error('Unable to derive revive address for connected wallet')
  }

  const tokenConfigs = [
    optionalTokenConfig(deploymentConfig.contracts.w3piToken, 'w3pi', 'W3PI', 'W3PI'),
    optionalTokenConfig(deploymentConfig.contracts.usdcToken, 'usdc', 'USDC', 'USDC'),
  ].filter((token): token is NonNullable<typeof token> => Boolean(token))

  if (tokenConfigs.length === 0) {
    throw new Error('Missing VITE_W3PI_TOKEN_ADDRESS and VITE_USDC_TOKEN_ADDRESS')
  }

  const caller = resolveCaller(options.caller)
  try {
    const client = await getDedotReadClient()

    return Promise.all(
      tokenConfigs.map((token) =>
        loadTokenBalance(client!, token.address, owner, caller, token.id, token.label, token.fallbackSymbol),
      ),
    )
  } catch (error) {
    throw new Error(getErrorMessage(error))
  }
}
