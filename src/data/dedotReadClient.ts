import { DedotClient, WsProvider } from 'dedot'
import { deploymentConfig } from '@/config/contracts'
import { getRpcProviderUrls } from '@/lib/rpc'

const READ_REQUEST_TIMEOUT_MS = 30_000

let readClientPromise: Promise<DedotClient> | undefined

function requireRpcEndpoints() {
  const endpoints = getRpcProviderUrls(deploymentConfig.rpcUrl)

  if (endpoints.length === 0) {
    throw new Error('Missing VITE_W3PI_RPC_URL')
  }

  return endpoints
}

async function createReadClient() {
  const endpoints = requireRpcEndpoints()
  const provider = new WsProvider({
    endpoint: endpoints.length === 1 ? endpoints[0] : endpoints,
    maxRetryAttempts: 0,
    retryDelayMs: 0,
    timeout: READ_REQUEST_TIMEOUT_MS,
  })

  return DedotClient.legacy({
    cacheMetadata: true,
    provider,
  })
}

export async function getDedotReadClient() {
  if (!readClientPromise) {
    readClientPromise = createReadClient().catch((error) => {
      readClientPromise = undefined
      throw error
    })
  }

  const client = await readClientPromise

  if (client.status === 'disconnected') {
    readClientPromise = undefined
    return getDedotReadClient()
  }

  return client
}
