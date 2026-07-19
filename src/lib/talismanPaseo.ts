import { WsProvider } from 'dedot'
import type { InjectedSigner } from 'dedot/types'
import { deploymentConfig } from '@/config/contracts'
import { paseoTalismanUserExtensions } from '@/config/paseoSignedExtensions'
import { getPrimaryRpcUrl } from '@/lib/rpc'

export const PASEO_ASSET_HUB_PUBLIC_RPC = 'wss://asset-hub-paseo-rpc.n.dwellir.com'
export const PASEO_ASSET_HUB_GENESIS_HASH = '0xd6eec26135305a8ad257a20d003357284c8aa03d0bdb2b357ab0a22371e11ef2'
export const TALISMAN_SUBSTRATE_NETWORK_GUIDE =
  'https://docs.talisman.xyz/talisman/customize/managing-networks-and-tokens/adding-custom-networks'

type HexString = `0x${string}`

const TALISMAN_PASEO_METADATA_SCHEMA_VERSION = 1
const TALISMAN_PASEO_METADATA_SCHEMA_KEY =
  'W3PI::TALISMAN_PASEO_METADATA_SCHEMA'

type TalismanMetadataDefinition = {
  chain: string
  chainType: 'substrate'
  genesisHash: HexString
  icon: string
  metadataRpc: string
  rawMetadata: HexString
  specVersion: number
  ss58Format: number
  tokenDecimals: number
  tokenSymbol: string
  types: Record<string, never>
  userExtensions: typeof paseoTalismanUserExtensions
}

type TalismanInjected = {
  signer?: InjectedSigner
  metadata?: {
    get: () => Promise<Array<{ genesisHash: string; specVersion: number }>>
    provide: (definition: TalismanMetadataDefinition) => Promise<boolean>
  }
}

type TalismanProvider = {
  enable: (appName: string) => Promise<TalismanInjected>
}

type RuntimeVersionResponse = {
  spec_version?: number
  specVersion?: number
}

type SystemPropertiesResponse = {
  ss58Format?: number | number[]
  tokenDecimals?: number | number[]
  tokenSymbol?: string | string[]
}

declare global {
  interface Window {
    injectedWeb3?: Record<string, TalismanProvider | undefined>
  }
}

function requireHexString(value: unknown, label: string): HexString {
  if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) {
    throw new Error(`The Paseo RPC returned an invalid ${label}`)
  }

  return value as HexString
}

function firstValue<T>(value: T | T[] | undefined, fallback: T) {
  if (Array.isArray(value)) {
    return value[0] ?? fallback
  }

  return value ?? fallback
}

function metadataSchemaMarker(genesisHash: string, specVersion: number) {
  return `${genesisHash.toLowerCase()}:${specVersion}:${TALISMAN_PASEO_METADATA_SCHEMA_VERSION}`
}

function isMetadataSchemaCurrent(genesisHash: string, specVersion: number) {
  return (
    window.localStorage.getItem(TALISMAN_PASEO_METADATA_SCHEMA_KEY) ===
    metadataSchemaMarker(genesisHash, specVersion)
  )
}

function markMetadataSchemaCurrent(genesisHash: string, specVersion: number) {
  window.localStorage.setItem(
    TALISMAN_PASEO_METADATA_SCHEMA_KEY,
    metadataSchemaMarker(genesisHash, specVersion),
  )
}

function hexToBase64(value: HexString) {
  const hex = value.slice(2)
  const bytes = new Uint8Array(hex.length / 2)

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }

  let binary = ''
  const chunkSize = 32_768

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return window.btoa(binary)
}

export async function syncPaseoMetadataToTalisman() {
  const talisman = window.injectedWeb3?.talisman

  if (!talisman) {
    throw new Error('Talisman is not installed or is disabled in this browser')
  }

  const rpcUrl = getPrimaryRpcUrl(deploymentConfig.rpcUrl)

  if (!/^wss?:\/\//i.test(rpcUrl)) {
    throw new Error('A WebSocket Paseo RPC is required to load wallet metadata')
  }

  const provider = new WsProvider({
    endpoint: rpcUrl,
    maxRetryAttempts: 0,
    retryDelayMs: 0,
    timeout: 15_000,
  })

  try {
    const [injected] = await Promise.all([talisman.enable('W3PI Investor App'), provider.connect()])

    if (!injected.metadata?.provide) {
      throw new Error('This Talisman version does not expose metadata updates to dApps')
    }

    const [chain, genesisHashValue, rawMetadataValue, runtimeVersion, properties] = await Promise.all([
      provider.send<string>('system_chain', []),
      provider.send<string | null>('chain_getBlockHash', [0]),
      provider.send<string>('state_getMetadata', []),
      provider.send<RuntimeVersionResponse>('state_getRuntimeVersion', []),
      provider.send<SystemPropertiesResponse>('system_properties', []),
    ])
    const genesisHash = requireHexString(genesisHashValue, 'genesis hash')
    const rawMetadata = requireHexString(rawMetadataValue, 'runtime metadata')
    const specVersion = Number(runtimeVersion.specVersion ?? runtimeVersion.spec_version)

    if (!Number.isSafeInteger(specVersion) || specVersion <= 0) {
      throw new Error('The Paseo RPC returned an invalid runtime spec version')
    }

    if (genesisHash.toLowerCase() !== PASEO_ASSET_HUB_GENESIS_HASH) {
      throw new Error('The configured RPC is not the expected Paseo Asset Hub chain')
    }

    const approved = await injected.metadata.provide({
      chain: chain || 'Paseo Asset Hub',
      chainType: 'substrate',
      genesisHash,
      icon: 'substrate',
      metadataRpc: hexToBase64(rawMetadata),
      rawMetadata,
      specVersion,
      ss58Format: firstValue(properties.ss58Format, 42),
      tokenDecimals: firstValue(properties.tokenDecimals, 10),
      tokenSymbol: firstValue(properties.tokenSymbol, 'PAS'),
      types: {},
      userExtensions: paseoTalismanUserExtensions,
    })

    if (!approved) {
      throw new Error('Talisman did not approve the Paseo metadata update')
    }

    markMetadataSchemaCurrent(genesisHash, specVersion)

    return { chain, genesisHash, specVersion }
  } finally {
    await provider.disconnect().catch(() => undefined)
  }
}

/**
 * Make sure Talisman has metadata for the exact runtime version that will sign
 * the transaction. An unknown chain can otherwise leave Talisman using an old
 * cached metadata definition, which produces a valid signature over the wrong
 * signed-extension bytes and is rejected by the node as a bad signature.
 */
export async function ensurePaseoMetadataInTalisman() {
  const talisman = window.injectedWeb3?.talisman

  if (!talisman) {
    throw new Error('Talisman is not installed or is disabled in this browser')
  }

  const injected = await talisman.enable('W3PI Investor App')

  if (!injected.metadata?.get) {
    throw new Error('This Talisman version cannot verify its Paseo metadata')
  }

  const rpcUrl = getPrimaryRpcUrl(deploymentConfig.rpcUrl)
  const provider = new WsProvider({
    endpoint: rpcUrl,
    maxRetryAttempts: 0,
    retryDelayMs: 0,
    timeout: 15_000,
  })

  try {
    await provider.connect()
    const [genesisHashValue, runtimeVersion, knownMetadata] = await Promise.all([
      provider.send<string | null>('chain_getBlockHash', [0]),
      provider.send<RuntimeVersionResponse>('state_getRuntimeVersion', []),
      injected.metadata.get(),
    ])
    const genesisHash = requireHexString(genesisHashValue, 'genesis hash')
    const specVersion = Number(runtimeVersion.specVersion ?? runtimeVersion.spec_version)

    if (!Number.isSafeInteger(specVersion) || specVersion <= 0) {
      throw new Error('The Paseo RPC returned an invalid runtime spec version')
    }

    const isCurrent = knownMetadata.some(
      (metadata) =>
        metadata.genesisHash.toLowerCase() === genesisHash.toLowerCase() &&
        Number(metadata.specVersion) === specVersion,
    )

    if (isCurrent && isMetadataSchemaCurrent(genesisHash, specVersion)) {
      return { genesisHash, specVersion, updated: false }
    }
  } finally {
    await provider.disconnect().catch(() => undefined)
  }

  const synced = await syncPaseoMetadataToTalisman()
  return { genesisHash: synced.genesisHash, specVersion: synced.specVersion, updated: true }
}
