import { useEffect, useState } from 'react'
import type { ConnectionStatus } from 'dedot'
import { deploymentConfig } from '@/config/contracts'
import { getDedotReadClient } from '@/data/dedotReadClient'

type ChainStatus = 'checking' | 'connected' | 'disconnected'

type DedotChainStatus = {
  bestBlockHash?: string
  bestBlockNumber?: number
  chainName?: string
  checkedAt?: string
  error?: string
  rpcUrl: string
  status: ChainStatus
  providerStatus?: ConnectionStatus
}

const BASE_RETRY_INTERVAL_MS = 5_000
const MAX_RETRY_INTERVAL_MS = 60_000

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message && error.message !== '[object Event]') {
    return error.message
  }

  return 'Unable to connect to RPC'
}

export function useDedotChainStatus(): DedotChainStatus {
  const rpcUrl = deploymentConfig.rpcUrl
  const [chainStatus, setChainStatus] = useState<DedotChainStatus>({
    rpcUrl,
    status: 'checking',
  })

  useEffect(() => {
    let active = true
    let retryTimer: number | undefined
    let retryAttempts = 0
    let unsubscribeBestBlock: (() => void) | undefined
    let unsubscribeDisconnected: (() => void) | undefined
    let unsubscribeError: (() => void) | undefined
    let unsubscribeReconnecting: (() => void) | undefined

    function clearRetryTimer() {
      if (retryTimer) {
        window.clearTimeout(retryTimer)
        retryTimer = undefined
      }
    }

    function scheduleReconnect() {
      clearRetryTimer()

      if (!active) {
        return
      }

      const retryDelay = Math.min(BASE_RETRY_INTERVAL_MS * 2 ** retryAttempts, MAX_RETRY_INTERVAL_MS)
      retryAttempts += 1

      retryTimer = window.setTimeout(() => {
        retryTimer = undefined
        void connect()
      }, retryDelay)
    }

    function clearCurrentSubscriptions() {
      unsubscribeBestBlock?.()
      unsubscribeDisconnected?.()
      unsubscribeError?.()
      unsubscribeReconnecting?.()

      unsubscribeBestBlock = undefined
      unsubscribeDisconnected = undefined
      unsubscribeError = undefined
      unsubscribeReconnecting = undefined
    }

    async function connect() {
      clearCurrentSubscriptions()

      if (!rpcUrl) {
        setChainStatus({
          checkedAt: new Date().toISOString(),
          error: 'Missing VITE_W3PI_RPC_URL',
          rpcUrl,
          status: 'disconnected',
        })
        return
      }

      setChainStatus((current) => ({
        ...current,
        checkedAt: new Date().toISOString(),
        error: undefined,
        providerStatus: undefined,
        rpcUrl,
        status: 'checking',
      }))

      try {
        const nextClient = await getDedotReadClient()
        const [chainName, bestBlock] = await Promise.all([nextClient.chainSpec.chainName(), nextClient.block.best()])

        if (!active) {
          return
        }

        retryAttempts = 0

        unsubscribeBestBlock = nextClient.block.best((block) => {
          if (!active) {
            return
          }

          setChainStatus((current) => ({
            ...current,
            bestBlockHash: block.hash,
            bestBlockNumber: block.number,
            checkedAt: new Date().toISOString(),
            providerStatus: nextClient.status,
          }))
        })

        unsubscribeDisconnected = nextClient.on('disconnected', () => {
          if (!active) {
            return
          }

          setChainStatus((current) => ({
            ...current,
            checkedAt: new Date().toISOString(),
            error: 'Disconnected from RPC',
            providerStatus: nextClient.status,
            status: 'disconnected',
          }))
          scheduleReconnect()
        })

        unsubscribeReconnecting = nextClient.on('reconnecting', () => {
          if (!active) {
            return
          }

          setChainStatus((current) => ({
            ...current,
            checkedAt: new Date().toISOString(),
            providerStatus: nextClient.status,
            status: 'checking',
          }))
        })

        unsubscribeError = nextClient.on('error', (error) => {
          if (!active) {
            return
          }

          setChainStatus((current) => ({
            ...current,
            checkedAt: new Date().toISOString(),
            error: getErrorMessage(error),
            providerStatus: nextClient.status,
            status: 'disconnected',
          }))
          scheduleReconnect()
        })

        setChainStatus({
          bestBlockHash: bestBlock.hash,
          bestBlockNumber: bestBlock.number,
          chainName,
          checkedAt: new Date().toISOString(),
          providerStatus: nextClient.status,
          rpcUrl,
          status: 'connected',
        })
      } catch (error) {
        clearCurrentSubscriptions()

        if (!active) {
          return
        }

        setChainStatus({
          checkedAt: new Date().toISOString(),
          error: getErrorMessage(error),
          rpcUrl,
          status: 'disconnected',
        })
        scheduleReconnect()
      }
    }

    void connect()

    return () => {
      active = false
      clearRetryTimer()
      clearCurrentSubscriptions()
    }
  }, [rpcUrl])

  return chainStatus
}
