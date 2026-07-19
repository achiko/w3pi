import { development, JsonRpcApi, NetworkType, paseoAssetHub, type NetworkInfo } from 'typink'
import { deploymentConfig } from '@/config/contracts'
import { getRpcProviderUrls } from '@/lib/rpc'

function resolveNetworkId(network: string) {
  const normalized = network.trim().toLowerCase()

  if (!normalized || normalized === 'local' || normalized === 'development') {
    return development.id
  }

  if (
    normalized === 'paseo' ||
    normalized === 'paseo_asset_hub' ||
    normalized === 'passet_hub' ||
    normalized === 'passet_hub_testnet'
  ) {
    return paseoAssetHub.id
  }

  return normalized
}

const envProviders = getRpcProviderUrls(deploymentConfig.rpcUrl)
const providers = envProviders.length > 0 ? envProviders : undefined

export const W3PI_NETWORK_ID = resolveNetworkId(deploymentConfig.network)

export const w3piNetwork: NetworkInfo =
  W3PI_NETWORK_ID === development.id
    ? {
        ...development,
        jsonRpcApi: JsonRpcApi.LEGACY,
        name: 'Local Contracts Node',
        providers: providers ?? development.providers,
      }
    : W3PI_NETWORK_ID === paseoAssetHub.id
      ? {
          ...paseoAssetHub,
          jsonRpcApi: JsonRpcApi.LEGACY,
          providers: providers ?? paseoAssetHub.providers,
        }
      : {
          id: W3PI_NETWORK_ID,
          type: NetworkType.TESTNET,
          name: deploymentConfig.network || 'W3PI Network',
          logo: paseoAssetHub.logo,
          providers: providers ?? paseoAssetHub.providers,
          symbol: 'PAS',
          decimals: 10,
        }

export const supportedNetworks = [w3piNetwork]
