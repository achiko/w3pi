import { useEffect, useMemo, useState } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { Contract } from 'dedot/contracts'
import { Activity, KeyRound, Lock, Pause, Play, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useTypink } from 'typink'
import tokenMetadata from '../../../abis/token.json'
import portfolioMetadata from '../../../abis/portfolio.json'
import { Button } from '@/components/ui/button'
import { TransactionErrorDialog } from '@/components/admin/TransactionErrorDialog'
import { deploymentConfig } from '@/config/contracts'
import { toReviveAddress } from '@/data/tokenAdmin'
import { useContractTx } from '@/hooks/useContractTx'
import {
  getTransactionErrorDetails,
  type TransactionErrorDetails,
} from '@/lib/transactionError'
import {
  useGetContractEventsIndexQuery,
  useGetTokenAdminSummaryQuery,
  type AdminTokenSummary,
  type ContractEventsIndexResult,
  type PortfolioAdminSummary,
} from '@/store/portfolioApi'

type AdminTab = 'tokens' | 'index' | 'events'
const EMPTY_PSP22_TRANSFER_DATA = '0x'

function shortenAddress(address: string) {
  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unable to load token admin status'
}

function AddressRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-border px-3 py-2 sm:grid-cols-[160px_1fr] sm:items-center">
      <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</div>
      <div className="min-w-0 break-all font-mono text-xs font-semibold text-slate-950 dark:text-slate-50">
        {value ? shortenAddress(value) : 'None'}
      </div>
    </div>
  )
}

function EmptyRoleList({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
      No authorized {label}
    </div>
  )
}

function RoleList({ label, addresses }: { label: string; addresses: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
        {label} ({addresses.length})
      </div>
      {addresses.length > 0 ? (
        <div className="space-y-2">
          {addresses.map((address) => (
            <div
              className="rounded-md border border-border px-3 py-2 font-mono text-xs font-semibold text-slate-950 dark:text-slate-50"
              key={address}
              title={address}
            >
              {shortenAddress(address)}
            </div>
          ))}
        </div>
      ) : (
        <EmptyRoleList label={label.toLowerCase()} />
      )}
    </div>
  )
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

  const wholeUnits = BigInt(whole || '0') * 10n ** BigInt(decimals)
  const fractionalUnits = BigInt((fraction || '').padEnd(decimals, '0') || '0')
  const amount = wholeUnits + fractionalUnits

  if (amount <= 0n) {
    throw new Error('Amount must be greater than zero')
  }

  return amount
}

function formatTokenAmount(value: string | undefined, decimals: number | undefined) {
  if (!value || decimals === undefined) {
    return '--'
  }

  try {
    const rawValue = BigInt(value)
    const divisor = 10n ** BigInt(decimals)
    const whole = rawValue / divisor
    const fraction = rawValue % divisor

    if (fraction === 0n) {
      return whole.toLocaleString('en-US')
    }

    const fractionText = fraction
      .toString()
      .padStart(decimals, '0')
      .slice(0, 6)
      .replace(/0+$/, '')

    return fractionText ? `${whole.toLocaleString('en-US')}.${fractionText}` : whole.toLocaleString('en-US')
  } catch {
    return value
  }
}

function normalizeAmountInput(value: string) {
  const normalized = value.replace(/[^\d.]/g, '')
  const [whole = '', ...fractionParts] = normalized.split('.')
  const fraction = fractionParts.join('')

  if (normalized.includes('.')) {
    return `${whole}.${fraction}`
  }

  return whole
}

function normalizeIntegerInput(value: string) {
  return value.replace(/\D/g, '')
}

function parseRawU128Input(value: string) {
  const trimmed = value.trim()

  if (!/^\d+$/.test(trimmed)) {
    throw new Error('Enter a raw integer value')
  }

  const rawValue = BigInt(trimmed)

  if (rawValue <= 0n) {
    throw new Error('Value must be greater than zero')
  }

  return rawValue
}

function TokenTransferSection({
  onTransferred,
  tokens,
}: {
  onTransferred: () => void
  tokens: AdminTokenSummary[]
}) {
  const { client, connectedAccount } = useTypink()
  const [selectedAddress, setSelectedAddress] = useState(() => tokens[0]?.address ?? '')
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const [errorDetails, setErrorDetails] = useState<TransactionErrorDetails>()
  const [errorDetailsOpen, setErrorDetailsOpen] = useState(false)
  const selectedToken = tokens.find((token) => token.address === selectedAddress) ?? tokens[0]
  const selectedTokenReady = selectedToken?.decimals !== undefined
  const contract = useMemo(() => {
    if (!client || !connectedAccount || !selectedToken || selectedToken.decimals === undefined) {
      return undefined
    }

    const tokenContract = new Contract(client, tokenMetadata, selectedToken.address, {
      defaultCaller: connectedAccount.address,
    })

    Object.assign(tokenContract, {
      _instanceId: `${selectedToken.address}:${connectedAccount.address}`,
    })

    return tokenContract as never
  }, [client, connectedAccount, selectedToken])
  const transferTx = useContractTx(contract, 'psp22Transfer' as never)
  const sending = transferTx.inProgress || transferTx.inBestBlockProgress
  const canSend = Boolean(selectedTokenReady && recipient && amount && connectedAccount)

  async function handleTransfer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setErrorDetails(undefined)
    setErrorDetailsOpen(false)
    setMessage(undefined)

    if (!selectedToken || selectedToken.decimals === undefined) {
      setError('This token contract is not reachable on the current chain')
      return
    }

    const recipientReviveAddress = toReviveAddress(recipient)

    if (!recipientReviveAddress) {
      setError('Enter a valid SS58 or revive H160 recipient')
      return
    }

    try {
      const rawAmount = parseTokenAmount(amount, selectedToken.decimals)

      await transferTx.signAndSend({
        args: [recipientReviveAddress, rawAmount, EMPTY_PSP22_TRANSFER_DATA],
        callback: (result) => {
          setMessage(`Transaction ${result.status.type}`)
        },
      })

      setMessage('Transfer finalized')
      setRecipient('')
      setAmount('')
      onTransferred()
    } catch (transferError) {
      const details = getTransactionErrorDetails(transferError)
      setError(details.message)
      setErrorDetails(details)
      setErrorDetailsOpen(true)
    }
  }

  if (tokens.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
        No tokens found
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Tokens</h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Send from the connected admin wallet</p>
        </div>
        <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">{tokens.length} total</div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {tokens.map((token) => {
          const active = token.address === selectedToken?.address
          const symbol = token.symbol ?? token.label

          return (
            <button
              aria-pressed={active}
              className={
                active
                  ? 'rounded-md border border-slate-950 bg-slate-50 px-3 py-3 text-left dark:border-slate-100 dark:bg-slate-900'
                  : 'rounded-md border border-border px-3 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900'
              }
              key={token.address}
              onClick={() => setSelectedAddress(token.address)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950 dark:text-slate-50">
                    {symbol}
                    {token.name && token.name !== symbol ? <span className="text-slate-500"> · {token.name}</span> : null}
                  </div>
                  <div className="mt-1 truncate font-mono text-xs font-medium text-slate-500 dark:text-slate-400">
                    {shortenAddress(token.address)}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {formatTokenAmount(token.balance, token.decimals)}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      <form className="grid gap-3 rounded-md border border-border p-3" onSubmit={(event) => void handleTransfer(event)}>
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Recipient</span>
            <input
              className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-medium text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
              onChange={(event) => setRecipient(event.target.value.trim())}
              placeholder="SS58 or 0x revive address"
              value={recipient}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              Amount {selectedToken?.symbol ? `(${selectedToken.symbol})` : ''}
            </span>
            <input
              className="h-10 rounded-md border border-input bg-white px-3 text-sm font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
              inputMode="decimal"
              onChange={(event) => setAmount(normalizeAmountInput(event.target.value))}
              placeholder="0"
              value={amount}
            />
          </label>
        </div>

        {error ? (
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-red-600 dark:text-red-300">
            <span>{error}</span>
            {errorDetails ? (
              <button
                className="underline underline-offset-2 hover:text-red-800 dark:hover:text-red-200"
                onClick={() => setErrorDetailsOpen(true)}
                type="button"
              >
                View details
              </button>
            ) : null}
          </div>
        ) : null}
        {selectedToken && !selectedTokenReady ? (
          <div className="text-xs font-semibold text-amber-700 dark:text-amber-300">
            This selected token did not load PSP22 metadata on the current chain.
          </div>
        ) : null}
        {message ? <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</div> : null}

        <Button className="h-10 justify-self-start px-3 text-xs" disabled={!canSend || sending} type="submit">
          <Send className="h-3.5 w-3.5" />
          {sending ? 'Sending...' : 'Send Token'}
        </Button>
      </form>
      {errorDetails && errorDetailsOpen ? (
        <TransactionErrorDialog details={errorDetails} onClose={() => setErrorDetailsOpen(false)} />
      ) : null}
    </div>
  )
}

function PortfolioOperationsSection({
  onUpdated,
  portfolio,
}: {
  onUpdated: () => void
  portfolio?: PortfolioAdminSummary
}) {
  const { client, connectedAccount } = useTypink()
  const [initialValue, setInitialValue] = useState('')
  const [resetValue, setResetValue] = useState('')
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const contract = useMemo(() => {
    if (!client || !connectedAccount || !portfolio) {
      return undefined
    }

    const portfolioContract = new Contract(client, portfolioMetadata, portfolio.address, {
      defaultCaller: connectedAccount.address,
    })

    Object.assign(portfolioContract, {
      _instanceId: `${portfolio.address}:${connectedAccount.address}`,
    })

    return portfolioContract as never
  }, [client, connectedAccount, portfolio])
  const setTrackingTx = useContractTx(contract, 'setIndexTracking' as never)
  const initializeBaseTx = useContractTx(contract, 'initializeBasePortfolioValue' as never)
  const resetBaseTx = useContractTx(contract, 'emergencyResetBaseValue' as never)
  const trackingBusy = setTrackingTx.inProgress || setTrackingTx.inBestBlockProgress
  const initializeBusy = initializeBaseTx.inProgress || initializeBaseTx.inBestBlockProgress
  const resetBusy = resetBaseTx.inProgress || resetBaseTx.inBestBlockProgress
  const canOperate = Boolean(portfolio?.isConnectedAccountOwner && connectedAccount)

  useEffect(() => {
    if (portfolio?.currentPortfolioValue && !resetValue) {
      setResetValue(portfolio.currentPortfolioValue)
    }
  }, [portfolio?.currentPortfolioValue, resetValue])

  async function handleSetTracking(enabled: boolean) {
    setError(undefined)
    setMessage(undefined)

    try {
      await setTrackingTx.signAndSend({
        args: [enabled],
        callback: (result) => {
          setMessage(`Transaction ${result.status.type}`)
        },
      })

      setMessage(enabled ? 'Tracking enabled' : 'Tracking paused')
      onUpdated()
    } catch (trackingError) {
      setError(getErrorMessage(trackingError))
    }
  }

  async function handleInitializeBaseValue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)

    try {
      const rawInitialValue = parseRawU128Input(initialValue)

      await initializeBaseTx.signAndSend({
        args: [rawInitialValue],
        callback: (result) => {
          setMessage(`Transaction ${result.status.type}`)
        },
      })

      setMessage('Base portfolio value initialized')
      setInitialValue('')
      onUpdated()
    } catch (initializeError) {
      setError(getErrorMessage(initializeError))
    }
  }

  async function handleResetBaseValue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)

    try {
      const rawResetValue = parseRawU128Input(resetValue)

      await resetBaseTx.signAndSend({
        args: [rawResetValue],
        callback: (result) => {
          setMessage(`Transaction ${result.status.type}`)
        },
      })

      setMessage('Base portfolio value reset')
      onUpdated()
    } catch (resetError) {
      setError(getErrorMessage(resetError))
    }
  }


  if (!portfolio) {
    return (
      <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
        Portfolio contract unavailable
      </div>
    )
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Index</h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Portfolio owner operations</p>
        </div>
        <div
          className={
            portfolio.trackingEnabled
              ? 'rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
              : 'rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
          }
        >
          {portfolio.trackingEnabled ? 'Tracking enabled' : 'Tracking paused'}
        </div>
      </div>

      <div className="grid gap-3">
        <AddressRow label="Portfolio contract" value={portfolio.address} />
        <AddressRow label="Portfolio owner" value={portfolio.owner} />
        <div className="grid gap-1 rounded-md border border-border px-3 py-2 sm:grid-cols-[160px_1fr] sm:items-center">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Base index
          </div>
          <div className="min-w-0 break-all font-mono text-xs font-semibold text-slate-950 dark:text-slate-50">
            {portfolio.indexBaseValue}
          </div>
        </div>
        <div className="grid gap-1 rounded-md border border-border px-3 py-2 sm:grid-cols-[160px_1fr] sm:items-center">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Base portfolio
          </div>
          <div className="min-w-0 break-all font-mono text-xs font-semibold text-slate-950 dark:text-slate-50">
            {portfolio.basePortfolioValue}
          </div>
        </div>
        <div className="grid gap-1 rounded-md border border-border px-3 py-2 sm:grid-cols-[160px_1fr] sm:items-center">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Current portfolio
          </div>
          <div className="min-w-0 break-all font-mono text-xs font-semibold text-slate-950 dark:text-slate-50">
            {portfolio.currentPortfolioValue ?? 'Unavailable'}
          </div>
        </div>
      </div>

      {!portfolio.isConnectedAccountOwner ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
          Connected wallet is not the Portfolio owner.
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          className="h-10 px-3 text-xs"
          disabled={!canOperate || trackingBusy || portfolio.trackingEnabled}
          onClick={() => void handleSetTracking(true)}
          type="button"
        >
          <Play className="h-3.5 w-3.5" />
          Enable Tracking
        </Button>
        <Button
          className="h-10 px-3 text-xs"
          disabled={!canOperate || trackingBusy || !portfolio.trackingEnabled}
          onClick={() => void handleSetTracking(false)}
          type="button"
          variant="outline"
        >
          <Pause className="h-3.5 w-3.5" />
          Pause Tracking
        </Button>
      </div>

      <form className="grid gap-3 rounded-md border border-border p-3" onSubmit={(event) => void handleInitializeBaseValue(event)}>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Initial base portfolio value</span>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            inputMode="numeric"
            onChange={(event) => setInitialValue(normalizeIntegerInput(event.target.value))}
            placeholder="Raw u128 value"
            value={initialValue}
          />
        </label>
        <Button
          className="h-10 justify-self-start px-3 text-xs"
          disabled={!canOperate || initializeBusy || !initialValue}
          type="submit"
        >
          <Activity className="h-3.5 w-3.5" />
          {initializeBusy ? 'Initializing...' : 'Initialize Base'}
        </Button>
      </form>

      <form className="grid gap-3 rounded-md border border-border p-3" onSubmit={(event) => void handleResetBaseValue(event)}>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Reset base portfolio value</span>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            inputMode="numeric"
            onChange={(event) => setResetValue(normalizeIntegerInput(event.target.value))}
            placeholder="Raw u128 value"
            value={resetValue}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            className="h-10 px-3 text-xs"
            disabled={!portfolio.currentPortfolioValue}
            onClick={() => setResetValue(portfolio.currentPortfolioValue ?? '')}
            type="button"
            variant="outline"
          >
            Use Current
          </Button>
          <Button
            className="h-10 px-3 text-xs"
            disabled={!canOperate || resetBusy || !resetValue}
            type="submit"
            variant="outline"
          >
            <Activity className="h-3.5 w-3.5" />
            {resetBusy ? 'Resetting...' : 'Emergency Reset Base'}
          </Button>
        </div>
      </form>

      {error ? <div className="text-xs font-semibold text-red-600 dark:text-red-300">{error}</div> : null}
      {message ? <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</div> : null}
    </div>
  )
}

function parseOptionalBlockNumber(value: string) {
  const trimmed = value.trim()

  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)

  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : undefined
}

function EventDataPreview({ data }: { data: string }) {
  return (
    <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-50 p-2 font-mono text-[11px] leading-4 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
      {data}
    </pre>
  )
}

function EventDetailsPreview({ details }: { details: string }) {
  return details ? (
    <div className="break-words pr-3 text-xs font-medium leading-5 text-slate-600 dark:text-slate-300">{details}</div>
  ) : (
    <div className="pr-3 text-xs font-medium text-slate-400 dark:text-slate-500">--</div>
  )
}

function markdownCodeBlock(language: string, value: string) {
  const fence = value.includes('```') ? '````' : '```'

  return `${fence}${language}\n${value}\n${fence}`
}

function buildBlockEventsMarkdown(blockNumber: number, result: ContractEventsIndexResult | undefined) {
  const events = result?.events ?? []
  const lines = [
    `# Block #${blockNumber} Contract Events`,
    '',
    `- Best block: #${result?.bestBlock ?? '--'}`,
    `- Range: #${result?.blockFrom ?? blockNumber}-#${result?.blockTo ?? blockNumber}`,
    `- Decoded events: ${events.length}`,
    '- Order: block number ascending, then system event index ascending',
    '',
  ]

  if (events.length === 0) {
    lines.push('No decoded contract events in this block.', '')
    return lines.join('\n')
  }

  for (const event of events) {
    const order = `#${event.blockNumber}.${event.eventIndex}`

    lines.push(
      `## ${order} ${event.contract} ${event.event}`,
      '',
      `- Order: ${order}`,
      `- Contract: ${event.contract}`,
      `- Contract address: \`${event.contractAddress}\``,
      `- Event: ${event.event}`,
      ...(event.details ? [`- Details: ${event.details}`] : []),
      `- Block hash: \`${event.blockHash}\``,
      '',
      markdownCodeBlock('json', event.data),
      '',
    )
  }

  return lines.join('\n')
}

function navigateToAdminPath(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new Event('w3pi:navigation'))
}

function ContractEventsSection() {
  const [blockFrom, setBlockFrom] = useState('')
  const [blockTo, setBlockTo] = useState('')
  const [expandedBlocks, setExpandedBlocks] = useState<Set<number>>(() => new Set())
  const queryArgs = useMemo(
    () => ({
      blockFrom: parseOptionalBlockNumber(blockFrom),
      blockTo: parseOptionalBlockNumber(blockTo),
    }),
    [blockFrom, blockTo],
  )
  const { data, error, isError, isFetching, isLoading, refetch } = useGetContractEventsIndexQuery(queryArgs)
  const loading = isLoading || isFetching
  const groupedEvents = useMemo(() => {
    const groups = new Map<number, NonNullable<typeof data>['events']>()

    for (const event of data?.events ?? []) {
      const events = groups.get(event.blockNumber) ?? []
      events.push(event)
      groups.set(event.blockNumber, events)
    }

    return Array.from(groups.entries()).map(([blockNumber, events]) => ({
      blockNumber,
      events,
    }))
  }, [data?.events])

  function fillAllBlocks(result: ContractEventsIndexResult | undefined) {
    setBlockFrom('1')
    setBlockTo(result?.bestBlock ? String(result.bestBlock) : '')
  }

  function toggleBlock(blockNumber: number) {
    setExpandedBlocks((current) => {
      const next = new Set(current)

      if (next.has(blockNumber)) {
        next.delete(blockNumber)
      } else {
        next.add(blockNumber)
      }

      return next
    })
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Events</h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            Portfolio, manager, registry, DEX, W3PI, USDC, WDOT, and WPOLYX
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="h-8 px-2.5 text-xs"
            onClick={() => navigateToAdminPath('/admin/portfolio')}
            type="button"
            variant="outline"
          >
            Portfolio
          </Button>
          <Button className="h-8 px-2.5 text-xs" disabled={loading} onClick={() => void refetch()} variant="outline">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border border-border p-3 md:grid-cols-[140px_140px_auto] md:items-end">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">From block</span>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            inputMode="numeric"
            onChange={(event) => setBlockFrom(normalizeIntegerInput(event.target.value))}
            placeholder="1"
            value={blockFrom}
          />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">To block</span>
          <input
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            inputMode="numeric"
            onChange={(event) => setBlockTo(normalizeIntegerInput(event.target.value))}
            placeholder={data?.bestBlock ? String(data.bestBlock) : 'latest'}
            value={blockTo}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button className="h-10 px-3 text-xs" onClick={() => fillAllBlocks(data)} type="button" variant="outline">
            All Blocks
          </Button>
          <Button
            className="h-10 px-3 text-xs"
            onClick={() => {
              if (data?.bestBlock) {
                setBlockFrom(String(Math.max(1, data.bestBlock - 50)))
                setBlockTo(String(data.bestBlock))
              }
            }}
            type="button"
            variant="outline"
          >
            Last 50
          </Button>
        </div>
      </div>

      {isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(error)}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
        <span>Best #{data?.bestBlock ?? '--'}</span>
        <span>Range #{data?.blockFrom ?? '--'}-#{data?.blockTo ?? '--'}</span>
        <span>{data?.events.length ?? 0} events</span>
      </div>

      <div className="overflow-x-auto rounded-md border border-border">
        <div className="grid min-w-[960px] grid-cols-[90px_170px_minmax(150px,210px)_minmax(260px,360px)_minmax(320px,1fr)] gap-0 border-b border-border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          <div>Order</div>
          <div>Contract</div>
          <div>Event</div>
          <div>Details</div>
          <div>Data</div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          {loading ? (
            <div className="px-3 py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Scanning events...
            </div>
          ) : groupedEvents.length > 0 ? (
            groupedEvents.map((group) => (
              <div className="border-b border-border last:border-b-0" key={group.blockNumber}>
                <div className="flex w-full items-center justify-between gap-3 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-700 dark:bg-slate-900 dark:text-slate-200">
                  <button
                    className="text-left underline-offset-2 transition hover:underline"
                    onClick={() => navigateToAdminPath(`/admin/events/block/${group.blockNumber}`)}
                    title={`Open block ${group.blockNumber}`}
                    type="button"
                  >
                    Block #{group.blockNumber} · {group.events.length} event{group.events.length === 1 ? '' : 's'}
                  </button>
                  <button
                    aria-expanded={expandedBlocks.has(group.blockNumber)}
                    className="text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-50"
                    onClick={() => toggleBlock(group.blockNumber)}
                    type="button"
                  >
                    {expandedBlocks.has(group.blockNumber) ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                {expandedBlocks.has(group.blockNumber)
                  ? group.events.map((event) => (
                      <div
                        className="grid min-w-[960px] grid-cols-[90px_170px_minmax(150px,210px)_minmax(260px,360px)_minmax(320px,1fr)] gap-0 border-t border-border px-3 py-2"
                        key={`${event.blockNumber}:${event.eventIndex}:${event.contract}:${event.event}`}
                      >
                        <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                          #{event.blockNumber}.{event.eventIndex}
                        </div>
                        <div className="min-w-0 truncate text-xs font-semibold text-slate-950 dark:text-slate-50" title={event.contractAddress}>
                          {event.contract}
                        </div>
                        <div className="min-w-0 break-words pr-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                          {event.event}
                        </div>
                        <EventDetailsPreview details={event.details} />
                        <EventDataPreview data={event.data} />
                      </div>
                    ))
                  : null}
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              No contract events found
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function ContractBlockEventsPage({ blockNumber }: { blockNumber: number }) {
  const { data, error, isError, isFetching, isLoading, refetch } = useGetContractEventsIndexQuery({
    blockFrom: blockNumber,
    blockTo: blockNumber,
  })
  const loading = isLoading || isFetching
  const markdown = useMemo(() => buildBlockEventsMarkdown(blockNumber, data), [blockNumber, data])

  return (
    <section className="w-full rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">Block #{blockNumber}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {data?.events.length ?? 0} decoded contract events
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            className="h-8 px-2.5 text-xs"
            onClick={() => navigateToAdminPath('/admin/token')}
            type="button"
            variant="outline"
          >
            Admin
          </Button>
          <Button className="h-8 px-2.5 text-xs" disabled={loading} onClick={() => void refetch()} variant="outline">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        {isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(error)}
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <div className="grid min-w-[960px] grid-cols-[90px_170px_minmax(150px,210px)_minmax(260px,360px)_minmax(320px,1fr)] gap-0 border-b border-border bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
            <div>Order</div>
            <div>Contract</div>
            <div>Event</div>
            <div>Details</div>
            <div>Data</div>
          </div>
          {loading ? (
            <div className="px-3 py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              Loading block events...
            </div>
          ) : data && data.events.length > 0 ? (
            data.events.map((event) => (
              <div
                className="grid min-w-[960px] grid-cols-[90px_170px_minmax(150px,210px)_minmax(260px,360px)_minmax(320px,1fr)] gap-0 border-b border-border px-3 py-2 last:border-b-0"
                key={`${event.blockNumber}:${event.eventIndex}:${event.contract}:${event.event}`}
              >
                <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                  #{event.blockNumber}.{event.eventIndex}
                </div>
                <div className="min-w-0 truncate text-xs font-semibold text-slate-950 dark:text-slate-50" title={event.contractAddress}>
                  {event.contract}
                </div>
                <div className="min-w-0 break-words pr-3 font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {event.event}
                </div>
                <EventDetailsPreview details={event.details} />
                <EventDataPreview data={event.data} />
              </div>
            ))
          ) : (
            <div className="px-3 py-8 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
              No decoded contract events in this block
            </div>
          )}
        </div>

        <div className="grid gap-2">
          <div className="text-xs font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">
            Markdown
          </div>
          <textarea
            className="min-h-[420px] w-full resize-y rounded-md border border-border bg-slate-50 p-3 font-mono text-xs leading-5 text-slate-800 outline-none focus:ring-2 focus:ring-ring dark:bg-slate-900 dark:text-slate-100"
            readOnly
            value={loading ? 'Loading block events...' : markdown}
          />
        </div>
      </div>
    </section>
  )
}

export function TokenAdminPage() {
  const { connectedAccount } = useTypink()
  const [activeTab, setActiveTab] = useState<AdminTab>('tokens')
  const tokenAdminQueryArg = connectedAccount
    ? {
        connectedAddress: connectedAccount.address,
      }
    : skipToken
  const { data, error, isError, isFetching, isLoading, refetch } = useGetTokenAdminSummaryQuery(tokenAdminQueryArg)
  const loading = isLoading || isFetching
  const connected = Boolean(connectedAccount)
  const allowed = Boolean(connected && data?.isConnectedAccountOwner)

  return (
    <section className="w-full rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {allowed ? <ShieldCheck className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">Token Admin</h1>
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {allowed ? 'W3PI token owner access' : 'Restricted W3PI token owner access'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="h-8 px-2.5 text-xs"
            onClick={() => navigateToAdminPath('/admin/portfolio')}
            type="button"
            variant="outline"
          >
            Portfolio
          </Button>
          <Button
            className="h-8 px-2.5 text-xs"
            disabled={!connected || loading}
            onClick={() => void refetch()}
            variant="outline"
          >
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        {isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(error)}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-md border border-border px-4 py-8 text-center">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-400" />
            <div className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">Checking access</div>
          </div>
        ) : null}

        {!loading && !connected ? (
          <div className="rounded-md border border-border px-4 py-8 text-center">
            <Lock className="mx-auto h-5 w-5 text-slate-400" />
            <div className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">Wallet required</div>
          </div>
        ) : null}

        {!loading && connected && data && !allowed ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-4 dark:border-amber-950 dark:bg-amber-950/30">
            <div className="flex items-start gap-3">
              <KeyRound className="mt-0.5 h-4 w-4 text-amber-700 dark:text-amber-300" />
              <div>
                <div className="text-sm font-semibold text-amber-900 dark:text-amber-100">Not token admin</div>
                <div className="mt-1 text-xs font-medium leading-5 text-amber-800 dark:text-amber-200">
                  Connected revive address {data.connectedReviveAddress ? shortenAddress(data.connectedReviveAddress) : 'unavailable'} is not allowed here.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {allowed && data ? (
          <>
            <div className="grid gap-3">
              <AddressRow label="Token contract" value={deploymentConfig.contracts.w3piToken} />
              <AddressRow label="Token owner" value={data.owner} />
              <AddressRow label="Pending owner" value={data.pendingOwner} />
              <AddressRow label="Connected wallet" value={connectedAccount?.address} />
              <AddressRow label="Revive account" value={data.connectedReviveAddress} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <RoleList addresses={data.authorizedMinters} label="Authorized Minters" />
              <RoleList addresses={data.authorizedBurners} label="Authorized Burners" />
            </div>

            <div className="flex gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-900">
              <button
                className={
                  activeTab === 'tokens'
                    ? 'h-8 rounded bg-white px-3 text-xs font-semibold text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                    : 'h-8 rounded px-3 text-xs font-semibold text-slate-500 dark:text-slate-400'
                }
                onClick={() => setActiveTab('tokens')}
                type="button"
              >
                Tokens
              </button>
              <button
                className={
                  activeTab === 'index'
                    ? 'h-8 rounded bg-white px-3 text-xs font-semibold text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                    : 'h-8 rounded px-3 text-xs font-semibold text-slate-500 dark:text-slate-400'
                }
                onClick={() => setActiveTab('index')}
                type="button"
              >
                Index
              </button>
              <button
                className={
                  activeTab === 'events'
                    ? 'h-8 rounded bg-white px-3 text-xs font-semibold text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                    : 'h-8 rounded px-3 text-xs font-semibold text-slate-500 dark:text-slate-400'
                }
                onClick={() => setActiveTab('events')}
                type="button"
              >
                Events
              </button>
            </div>

            {activeTab === 'tokens' ? (
              <TokenTransferSection onTransferred={() => void refetch()} tokens={data.tokens} />
            ) : activeTab === 'index' ? (
              <PortfolioOperationsSection onUpdated={() => void refetch()} portfolio={data.portfolio} />
            ) : (
              <ContractEventsSection />
            )}
          </>
        ) : null}
      </div>
    </section>
  )
}
