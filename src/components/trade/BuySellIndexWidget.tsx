import { useEffect, useMemo, useState } from 'react'
import { Contract, toEvmAddress } from 'dedot/contracts'
import { ArrowDownUp, Wallet } from 'lucide-react'
import { useCheckMappedAccount, useTx, useTypink } from 'typink'
import portfolioManagerMetadata from '../../../abis/portfolio_manager.json'
import tokenMetadata from '../../../abis/token.json'
import { deploymentConfig, resolveTokenDecimals, USDC_DECIMALS } from '@/config/contracts'
import { useContractTx } from '@/hooks/useContractTx'
import { cn } from '@/lib/utils'

type TradeMode = 'buy' | 'sell'

const PRESET_AMOUNTS = [100, 300, 1000]
const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'
const FALLBACK_DECIMALS = {
  buy: USDC_DECIMALS,
  sell: 9,
} satisfies Record<TradeMode, number>

function W3piMark() {
  return (
    <div className="grid h-8 w-8 shrink-0 grid-cols-3 items-end gap-0.5 rounded-md bg-slate-50 p-1 dark:bg-slate-900">
      <span className="h-3 rounded-sm bg-blue-500" />
      <span className="h-5 rounded-sm bg-indigo-500" />
      <span className="h-7 rounded-sm bg-emerald-500" />
    </div>
  )
}

function formatCurrencyAmount(value: number) {
  return `$${value.toLocaleString('en-US')}`
}

function normalizeAmountInput(value: string, decimals: number) {
  const normalized = value.replace(/[^\d.]/g, '')
  const [whole = '', ...fractionParts] = normalized.split('.')
  const fraction = fractionParts.join('').slice(0, decimals)

  if (normalized.includes('.')) {
    return `${whole}.${fraction}`
  }

  return whole
}

function parseTokenAmount(value: string, decimals: number) {
  const trimmed = value.trim()

  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new Error('Enter a valid amount')
  }

  const [whole, fraction = ''] = trimmed.split('.')

  if (fraction.length > decimals) {
    throw new Error(`Amount supports up to ${decimals} decimals`)
  }

  const amount = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt((fraction || '').padEnd(decimals, '0') || '0')

  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero')
  }

  return amount
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Transaction failed'
}

type TokenMetadataApi = {
  query: {
    psp22BalanceOf: (owner: string) => Promise<{ data: bigint }>
    psp22MetadataTokenDecimals: () => Promise<{ data: number }>
  }
}

function toReviveAddress(address: string | undefined) {
  if (!address) {
    return undefined
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return address.toLowerCase()
  }

  try {
    return toEvmAddress(address).toLowerCase()
  } catch {
    return undefined
  }
}

async function loadTokenBalance(client: unknown, tokenAddress: string, owner: string) {
  const caller = deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
  const token = new Contract(client as never, tokenMetadata, tokenAddress, {
    defaultCaller: caller,
  }) as unknown as TokenMetadataApi
  const balanceResult = await token.query.psp22BalanceOf(owner)

  return balanceResult.data
}

export function BuySellIndexWidget() {
  const { client, connectedAccount, connectWallet, wallets } = useTypink()
  const {
    error: mappingCheckError,
    evmAddress,
    isLoading: mappingLoading,
    isMapped,
    refresh: refreshMapping,
  } = useCheckMappedAccount(connectedAccount?.address)
  const [mode, setMode] = useState<TradeMode>('buy')
  const [amountInput, setAmountInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [decimals, setDecimals] = useState<Record<TradeMode, number>>(FALLBACK_DECIMALS)
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const installedWallet = wallets.find((wallet) => wallet.installed)
  const actionLabel = mode === 'buy' ? 'Buy' : 'Sell'
  const tokenAddress = mode === 'buy' ? deploymentConfig.contracts.usdcToken : deploymentConfig.contracts.w3piToken
  const tokenSymbol = mode === 'buy' ? 'USDC' : 'W3PI'
  const activeDecimals = decimals[mode]
  const managerAddress = deploymentConfig.contracts.portfolioManager
  const approvalContract = useMemo(() => {
    if (!client || !connectedAccount || !tokenAddress) {
      return undefined
    }

    const contract = new Contract(client, tokenMetadata, tokenAddress, {
      defaultCaller: connectedAccount.address,
    })

    Object.assign(contract, {
      _instanceId: `${tokenAddress}:${connectedAccount.address}:approve`,
    })

    return contract as never
  }, [client, connectedAccount, tokenAddress])
  const managerContract = useMemo(() => {
    if (!client || !connectedAccount || !managerAddress) {
      return undefined
    }

    const contract = new Contract(client, portfolioManagerMetadata, managerAddress, {
      defaultCaller: connectedAccount.address,
    })

    Object.assign(contract, {
      _instanceId: `${managerAddress}:${connectedAccount.address}:trade`,
    })

    return contract as never
  }, [client, connectedAccount, managerAddress])
  const approveTx = useContractTx(approvalContract, 'psp22Approve' as never)
  const buyTx = useContractTx(managerContract, 'buyW3pi' as never)
  const sellTx = useContractTx(managerContract, 'sellW3pi' as never)
  const mapAccountTx = useTx((tx) => tx.revive.mapAccount)
  const activeTradeTx = mode === 'buy' ? buyTx : sellTx
  const trading =
    mapAccountTx.inProgress ||
    mapAccountTx.inBestBlockProgress ||
    approveTx.inProgress ||
    approveTx.inBestBlockProgress ||
    activeTradeTx.inProgress ||
    activeTradeTx.inBestBlockProgress
  const needsMapping = connectedAccount && isMapped === false
  const canMapAccount = Boolean(needsMapping && !trading && !mappingLoading)
  const canTrade = Boolean(connectedAccount && isMapped !== false && managerAddress && tokenAddress && amountInput && !trading && !mappingLoading)

  useEffect(() => {
    let active = true

    async function loadDecimals() {
      if (!client) {
        return
      }

      const caller = deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
      const configs = [
        { address: deploymentConfig.contracts.usdcToken, mode: 'buy' as const },
        { address: deploymentConfig.contracts.w3piToken, mode: 'sell' as const },
      ]

      const results = await Promise.all(
        configs.map(async (config) => {
          if (!config.address) {
            return undefined
          }

          try {
            const token = new Contract(client, tokenMetadata, config.address, {
              defaultCaller: caller,
            }) as unknown as TokenMetadataApi
            const decimalsResult = await token.query.psp22MetadataTokenDecimals()

            return {
              decimals: resolveTokenDecimals(config.address, decimalsResult.data),
              mode: config.mode,
            }
          } catch {
            return undefined
          }
        }),
      )

      if (!active) {
        return
      }

      setDecimals((current) => {
        const next = { ...current }

        for (const result of results) {
          if (result) {
            next[result.mode] = result.decimals
          }
        }

        return next
      })
    }

    void loadDecimals()

    return () => {
      active = false
    }
  }, [client])

  async function handleConnect() {
    if (!installedWallet) {
      return
    }

    setConnecting(true)

    try {
      await connectWallet(installedWallet.id)
    } finally {
      setConnecting(false)
    }
  }

  async function handleTrade() {
    setError(undefined)
    setMessage(undefined)

    if (needsMapping) {
      setError('Map this account before contract transactions')
      return
    }

    if (!managerAddress) {
      setError('Missing Portfolio Manager address')
      return
    }

    if (!tokenAddress) {
      setError(`Missing ${tokenSymbol} token address`)
      return
    }

    try {
      const rawAmount = parseTokenAmount(amountInput, activeDecimals)
      const owner = toReviveAddress(connectedAccount?.address)
      const verificationTokenAddress = mode === 'buy' ? deploymentConfig.contracts.w3piToken : deploymentConfig.contracts.usdcToken
      const verificationSymbol = mode === 'buy' ? 'W3PI' : 'USDC'
      const balanceBefore =
        client && owner && verificationTokenAddress
          ? await loadTokenBalance(client, verificationTokenAddress, owner)
          : undefined

      setMessage(`Approving ${tokenSymbol}`)
      await approveTx.signAndSend({
        args: [managerAddress, rawAmount],
        callback: (result) => {
          setMessage(`Approval ${result.status.type}`)
        },
      })

      setMessage(`${actionLabel} transaction pending`)
      await activeTradeTx.signAndSend({
        args: [rawAmount],
        callback: (result) => {
          setMessage(`${actionLabel} ${result.status.type}`)
        },
      })

      window.dispatchEvent(new Event('w3pi:balancesChanged'))

      if (client && owner && verificationTokenAddress && balanceBefore !== undefined) {
        const balanceAfter = await loadTokenBalance(client, verificationTokenAddress, owner)

        if (balanceAfter <= balanceBefore) {
          throw new Error(`${actionLabel} finalized, but ${verificationSymbol} balance did not increase`)
        }
      }

      setMessage(mode === 'buy' ? 'W3PI buy finalized' : 'W3PI sell finalized')
      setAmountInput('')
    } catch (tradeError) {
      window.dispatchEvent(new Event('w3pi:balancesChanged'))
      setError(getErrorMessage(tradeError))
    }
  }

  async function handleMapAccount() {
    setError(undefined)
    setMessage(undefined)

    try {
      setMessage('Mapping account')
      await mapAccountTx.signAndSend({
        callback: (result) => {
          setMessage(`Mapping ${result.status.type}`)
        },
      })

      await refreshMapping()
      setMessage('Account mapped')
    } catch (mapError) {
      setError(getErrorMessage(mapError))
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
            <ArrowDownUp className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-normal text-slate-950 dark:text-slate-50">{actionLabel} Index</h1>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
              {mode === 'buy' ? 'Invest USDC into W3PI' : 'Redeem W3PI back to USDC'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 rounded-md bg-slate-100/70 p-0.5 dark:bg-slate-900" aria-label="Trade mode">
          {(['buy', 'sell'] as const).map((item) => (
            <button
              aria-pressed={mode === item}
              className={cn(
                'h-7 rounded px-3 text-xs font-semibold capitalize transition',
                mode === item
                  ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-800 dark:text-slate-50'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
              )}
              key={item}
              onClick={() => setMode(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-6">
        <div className="rounded-lg bg-slate-50/60 px-4 py-7 dark:bg-slate-900/60">
          <label className="flex items-center justify-center text-7xl font-semibold tracking-normal text-slate-400 dark:text-slate-600">
            {mode === 'buy' ? <span className="text-slate-300 dark:text-slate-700">$</span> : null}
            <input
              aria-label={`${actionLabel} amount in ${tokenSymbol}`}
              className="min-w-0 max-w-[12rem] bg-transparent text-center text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-100 dark:placeholder:text-slate-600"
              inputMode="decimal"
              onChange={(event) => setAmountInput(normalizeAmountInput(event.target.value, activeDecimals))}
              placeholder="0"
              type="text"
              value={amountInput}
            />
            {mode === 'sell' ? (
              <span className="ml-2 text-2xl text-slate-300 dark:text-slate-700">W3PI</span>
            ) : null}
          </label>

          <div className="mt-7 grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((preset) => (
              <button
                className={cn(
                  'h-11 rounded-lg bg-white text-lg font-semibold text-slate-600 ring-1 ring-slate-100 transition hover:bg-slate-50 dark:bg-slate-950 dark:text-slate-300 dark:ring-slate-800 dark:hover:bg-slate-900',
                  amountInput === String(preset) && 'bg-slate-100 text-slate-950 ring-slate-200 dark:bg-slate-800 dark:text-slate-50 dark:ring-slate-700',
                )}
                key={preset}
                onClick={() => setAmountInput(String(preset))}
                type="button"
              >
                {formatCurrencyAmount(preset)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3 rounded-lg border border-transparent bg-slate-50 px-4 py-3 dark:bg-slate-900">
          <W3piMark />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-slate-950 dark:text-slate-50">W3PI</div>
            <div className="break-all text-xs font-medium text-slate-500 dark:text-slate-400">
              {connectedAccount && evmAddress ? `Revive ${evmAddress}` : 'W3PI Index'}
            </div>
          </div>
        </div>

        {connectedAccount && needsMapping ? (
          <button
            className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            disabled={!canMapAccount}
            onClick={() => void handleMapAccount()}
            type="button"
          >
            {trading ? 'Mapping...' : 'Map Account'}
          </button>
        ) : connectedAccount ? (
          <button
            className="mt-3 flex h-14 w-full items-center justify-center rounded-2xl bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            disabled={!canTrade}
            onClick={() => void handleTrade()}
            type="button"
          >
            {trading ? 'Signing...' : `${actionLabel} W3PI`}
          </button>
        ) : (
          <button
            className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white"
            disabled={!installedWallet || connecting}
            onClick={() => void handleConnect()}
            type="button"
          >
            <Wallet className="h-4 w-4" />
            {connecting ? 'Connecting...' : 'Connect wallet'}
          </button>
        )}

        {mappingCheckError ? (
          <div className="mt-3 text-xs font-semibold text-amber-700 dark:text-amber-300">
            {mappingCheckError.message}
          </div>
        ) : null}
        {error ? <div className="mt-3 text-xs font-semibold text-red-600 dark:text-red-300">{error}</div> : null}
        {message ? <div className="mt-3 text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</div> : null}
      </div>
    </section>
  )
}
