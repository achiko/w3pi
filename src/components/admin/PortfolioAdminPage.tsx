import { useEffect, useMemo, useState } from 'react'
import { Contract } from 'dedot/contracts'
import { Database, RefreshCw, Send, ShieldCheck } from 'lucide-react'
import { useTypink } from 'typink'
import oracleMetadata from '../../../abis/oracle.json'
import { Button } from '@/components/ui/button'
import { deploymentConfig, USDC_DECIMALS } from '@/config/contracts'
import { useContractTx } from '@/hooks/useContractTx'
import {
  contractGetterAdminNavItems,
  getContractGetterAdminMutatingMessages,
  parseContractGetterAdminArgValues,
} from '@/data/contractGetterAdmin'
import {
  useGetContractGetterAdminDetailsQuery,
  useRunContractGetterAdminReadMutation,
  type ContractGetterAdminContractId,
  type ContractGetterAdminRow,
  type ContractGetterAdminSection,
  type ContractGetterAdminSkippedRow,
} from '@/store/portfolioApi'

type PortfolioAdminPageProps = {
  contractId: ContractGetterAdminContractId
}

type ContractGetterAdminArgInput = ContractGetterAdminSkippedRow['args'][number]

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unable to load contract getters'
}

function navigateToAdminPath(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new Event('w3pi:navigation'))
}

function getContractPath(contractId: ContractGetterAdminContractId) {
  return contractId === 'portfolio' ? '/admin/portfolio' : `/admin/contracts/${contractId}`
}

function formatRawInteger(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, '_')
}

function formatDisplayValue(value: string) {
  return value.replace(/(^|[^A-Za-z0-9_])-?\d{4,}(?![A-Za-z0-9_])/g, (match) => {
    const prefix = match.match(/^[^-\d]/)?.[0] ?? ''
    const numberText = prefix ? match.slice(prefix.length) : match
    const sign = numberText.startsWith('-') ? '-' : ''
    const unsignedValue = sign ? numberText.slice(1) : numberText

    return `${prefix}${sign}${formatRawInteger(unsignedValue)}`
  })
}

function ValueRow({ row }: { row: ContractGetterAdminRow }) {
  const displayValue = formatDisplayValue(row.value)

  return (
    <div className="grid gap-1 border-b border-border px-3 py-2 last:border-b-0 md:grid-cols-[230px_220px_minmax(0,1fr)] md:items-start">
      <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{row.message}</div>
      <div className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">{row.label}</div>
      <div
        className={
          row.tone === 'error'
            ? 'min-w-0 whitespace-pre-wrap break-all font-mono text-xs font-semibold text-red-600 dark:text-red-300'
            : 'min-w-0 whitespace-pre-wrap break-all font-mono text-xs font-semibold text-slate-950 dark:text-slate-50'
        }
        title={row.value}
      >
        {displayValue}
      </div>
    </div>
  )
}

function ReadSection({ section }: { section: ContractGetterAdminSection }) {
  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:bg-slate-900 dark:text-slate-50">
        {section.title}
      </div>
      <div>
        {section.rows.map((row, index) => (
          <ValueRow key={`${section.id}:${row.message}:${row.label}:${index}`} row={row} />
        ))}
      </div>
    </div>
  )
}

function ContractSelector({ activeContractId }: { activeContractId: ContractGetterAdminContractId }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-md bg-slate-100 p-1 dark:bg-slate-900">
      {contractGetterAdminNavItems.map((item) => {
        const active = item.id === activeContractId

        return (
          <button
            aria-pressed={active}
            className={
              active
                ? 'h-8 rounded bg-white px-3 text-xs font-semibold text-slate-950 shadow-sm dark:bg-slate-950 dark:text-slate-50'
                : 'h-8 rounded px-3 text-xs font-semibold text-slate-500 transition hover:text-slate-950 dark:text-slate-400 dark:hover:text-slate-50'
            }
            key={item.id}
            onClick={() => navigateToAdminPath(getContractPath(item.id))}
            type="button"
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

function SkippedReadsTable({ rows }: { rows: ContractGetterAdminSkippedRow[] }) {
  if (rows.length === 0) {
    return null
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      <div className="border-b border-border bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-950 dark:bg-slate-900 dark:text-slate-50">
        Reads Requiring Arguments
      </div>
      <div>
        {rows.map((row) => (
          <div
            className="grid gap-1 border-b border-border px-3 py-2 last:border-b-0 md:grid-cols-[230px_minmax(0,1fr)] md:items-start"
            key={`${row.message}:${row.args.map((arg) => `${arg.label}:${arg.type}`).join(',')}`}
          >
            <div className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{row.message}</div>
            <div className="min-w-0 break-all font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
              {row.args.map((arg) => `${arg.label}: ${arg.type}`).join(', ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function getPreferredDexBaseTokenAddress() {
  return deploymentConfig.contracts.wdotToken || deploymentConfig.contracts.wpolyxToken || deploymentConfig.contracts.w3piToken || ''
}

function getWholeUsdcRawAmount() {
  return (10n ** BigInt(USDC_DECIMALS)).toString()
}

function getDefaultDexArgValue(arg: ContractGetterAdminSkippedRow['args'][number]) {
  switch (arg.label) {
    case 'token':
    case 'token_a':
    case 'to':
      return getPreferredDexBaseTokenAddress()
    case 'quote_token':
    case 'token_b':
    case 'from':
      return deploymentConfig.contracts.usdcToken || ''
    case 'user':
      return deploymentConfig.readonlyCallerAddress || ''
    case 'amount_in':
      return getWholeUsdcRawAmount()
    default:
      return undefined
  }
}

function getDefaultArgValue(
  arg: ContractGetterAdminSkippedRow['args'][number],
  contractId?: ContractGetterAdminContractId,
) {
  if (contractId === 'dex') {
    const dexValue = getDefaultDexArgValue(arg)

    if (dexValue !== undefined) {
      return dexValue
    }
  }

  const options = getArgOptions(arg)

  if (options) {
    return arg.type === 'Tier' ? 'Tier1' : options[0]
  }

  switch (arg.label) {
    case 'count':
      return '1'
    case 'ref_type':
      return '0'
    case 'token_id':
      return '1'
    case 'offset':
      return '0'
    case 'limit':
      return '25'
    case 'weight_bp':
      return '5000'
    case 'weights_bp':
      return '5000,5000'
    default:
      return ''
  }
}

function getArgOptions(arg: ContractGetterAdminArgInput) {
  if (arg.options) {
    return arg.options
  }

  if (arg.type === 'bool') {
    return ['true', 'false']
  }

  return undefined
}

function isJsonArg(arg: ContractGetterAdminArgInput) {
  return arg.type === 'TokenPriceData' || arg.type === 'ValidationConfig'
}

function getArgPlaceholder(arg: ContractGetterAdminArgInput) {
  if (arg.type === 'Address') {
    return '0x... or SS58'
  }

  if (arg.type === 'TokenPriceData') {
    return '{"price":"1000000000000","marketCap":"0","volume24h":"0","timestamp":"0","marketDataTimestamp":"0"}'
  }

  if (arg.type === 'ValidationConfig') {
    return '{"maxDeviationBp":2000,"stalenessThreshold":"3600","minUpdateInterval":"60"}'
  }

  if (arg.type === 'Vec') {
    return '5000,5000'
  }

  return 'Raw integer'
}

function ArgumentValueField({
  arg,
  onChange,
  value,
}: {
  arg: ContractGetterAdminArgInput
  onChange: (value: string) => void
  value: string
}) {
  const options = getArgOptions(arg)
  const controlClass =
    'rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50'

  if (options) {
    return (
      <select className={`h-10 ${controlClass}`} onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }

  if (isJsonArg(arg)) {
    return (
      <textarea
        className={`min-h-24 py-2 ${controlClass}`}
        onChange={(event) => onChange(event.target.value)}
        placeholder={getArgPlaceholder(arg)}
        value={value}
      />
    )
  }

  return (
    <input
      className={`h-10 ${controlClass}`}
      inputMode={arg.type.startsWith('u') || arg.type.startsWith('i') ? 'numeric' : undefined}
      onChange={(event) => onChange(event.target.value)}
      placeholder={getArgPlaceholder(arg)}
      value={value}
    />
  )
}

function ContractArgumentReads({
  contractId,
  label,
  rows,
}: {
  contractId: ContractGetterAdminContractId
  label: string
  rows: ContractGetterAdminSkippedRow[]
}) {
  const [selectedMessage, setSelectedMessage] = useState(() => rows[0]?.message ?? '')
  const selectedRow = useMemo(
    () => rows.find((row) => row.message === selectedMessage) ?? rows[0],
    [rows, selectedMessage],
  )
  const [argValues, setArgValues] = useState<Record<string, string>>({})
  const [runRead, runReadState] = useRunContractGetterAdminReadMutation()

  useEffect(() => {
    if (!rows.some((row) => row.message === selectedMessage)) {
      setSelectedMessage(rows[0]?.message ?? '')
    }
  }, [rows, selectedMessage])

  useEffect(() => {
    if (!selectedRow) {
      setArgValues({})
      runReadState.reset()
      return
    }

    setArgValues(
      Object.fromEntries(selectedRow.args.map((arg) => [arg.label, getDefaultArgValue(arg, contractId)])),
    )
    runReadState.reset()
  }, [contractId, selectedRow?.message])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!selectedRow) {
      return
    }

    await runRead({
      args: argValues,
      contractId,
      message: selectedRow.message,
    })
  }

  if (!selectedRow) {
    return null
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
            {label} Reads Requiring Arguments
          </h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {rows.length} parameterized read methods
          </p>
        </div>
      </div>

      <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Read method</span>
          <select
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            onChange={(event) => setSelectedMessage(event.target.value)}
            value={selectedRow.message}
          >
            {rows.map((row) => (
              <option key={row.message} value={row.message}>
                {row.message}
              </option>
            ))}
          </select>
        </label>

        <div className="grid gap-3 md:grid-cols-2">
          {selectedRow.args.map((arg) => (
            <label className="grid gap-1" key={arg.label}>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                {arg.label} <span className="font-mono text-slate-400">({arg.type})</span>
              </span>
              <ArgumentValueField
                arg={arg}
                onChange={(value) => setArgValues((current) => ({ ...current, [arg.label]: value }))}
                value={argValues[arg.label] ?? getDefaultArgValue(arg, contractId)}
              />
            </label>
          ))}
        </div>

        <Button className="h-10 justify-self-start px-3 text-xs" disabled={runReadState.isLoading} type="submit">
          <RefreshCw className={runReadState.isLoading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          {runReadState.isLoading ? 'Running...' : 'Run Read'}
        </Button>
      </form>

      {runReadState.isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
          {getErrorMessage(runReadState.error)}
        </div>
      ) : null}

      {runReadState.data ? (
        <ReadSection
          section={{
            id: `${contractId}-result:${runReadState.data.message}`,
            rows: runReadState.data.rows,
            title: `${runReadState.data.message} Result`,
          }}
        />
      ) : null}
    </div>
  )
}

function supportsInteractiveArgumentReads(contractId: ContractGetterAdminContractId) {
  return (
    contractId === 'portfolio' ||
    contractId === 'portfolio-manager' ||
    contractId === 'oracle' ||
    contractId === 'registry' ||
    contractId === 'dex'
  )
}

function getDefaultSetterArgValue(arg: ContractGetterAdminArgInput) {
  const options = getArgOptions(arg)

  if (options) {
    return options[0]
  }

  switch (arg.label) {
    case 'portfolio':
      return deploymentConfig.contracts.portfolio ?? ''
    case 'registry':
      return deploymentConfig.contracts.registry ?? ''
    case 'token':
      return deploymentConfig.contracts.wdotToken ?? deploymentConfig.contracts.w3piToken ?? ''
    default:
      return ''
  }
}

function OracleSetterSection({ onUpdated }: { onUpdated: () => void }) {
  const { client, connectedAccount } = useTypink()
  const mutatingMessages = useMemo(() => getContractGetterAdminMutatingMessages('oracle'), [])
  const [selectedMessage, setSelectedMessage] = useState(() => mutatingMessages[0]?.message ?? '')
  const selectedRow = useMemo(
    () => mutatingMessages.find((row) => row.message === selectedMessage) ?? mutatingMessages[0],
    [mutatingMessages, selectedMessage],
  )
  const [argValues, setArgValues] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string>()
  const [error, setError] = useState<string>()
  const selectedMethodName = selectedRow?.methodName ?? 'updateDotUsdPrice'
  const contract = useMemo(() => {
    if (!client || !connectedAccount || !deploymentConfig.contracts.oracle) {
      return undefined
    }

    const oracleContract = new Contract(client, oracleMetadata, deploymentConfig.contracts.oracle, {
      defaultCaller: connectedAccount.address,
    })

    Object.assign(oracleContract, {
      _instanceId: `${deploymentConfig.contracts.oracle}:${connectedAccount.address}:${selectedMethodName}`,
    })

    return oracleContract as never
  }, [client, connectedAccount, selectedMethodName])
  const setterTx = useContractTx(contract, selectedMethodName as never)
  const sending = setterTx.inProgress || setterTx.inBestBlockProgress
  const hasMissingArgs = Boolean(
    selectedRow?.args.some((arg) => !(argValues[arg.label] ?? '').trim()),
  )
  const canSubmit = Boolean(contract && selectedRow && connectedAccount && !hasMissingArgs && !sending)

  useEffect(() => {
    if (!mutatingMessages.some((row) => row.message === selectedMessage)) {
      setSelectedMessage(mutatingMessages[0]?.message ?? '')
    }
  }, [mutatingMessages, selectedMessage])

  useEffect(() => {
    if (!selectedRow) {
      setArgValues({})
      setMessage(undefined)
      setError(undefined)
      return
    }

    setArgValues(
      Object.fromEntries(selectedRow.args.map((arg) => [arg.label, getDefaultSetterArgValue(arg)])),
    )
    setMessage(undefined)
    setError(undefined)
  }, [selectedRow?.message])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(undefined)
    setMessage(undefined)

    if (!selectedRow) {
      return
    }

    try {
      const args = parseContractGetterAdminArgValues(selectedRow.args, argValues)

      await setterTx.signAndSend({
        args,
        callback: (result) => {
          setMessage(`Transaction ${result.status.type}`)
        },
      })

      setMessage(`${selectedRow.message} finalized`)
      onUpdated()
    } catch (setterError) {
      setError(getErrorMessage(setterError))
    }
  }

  if (!selectedRow) {
    return null
  }

  return (
    <div className="space-y-4 rounded-md border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50">Oracle Setters</h2>
          <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">
            {mutatingMessages.length} wallet-signed methods
          </p>
        </div>
      </div>

      {!connectedAccount ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-semibold text-amber-800 dark:border-amber-950 dark:bg-amber-950/30 dark:text-amber-200">
          Connect the admin or authorized updater wallet to submit Oracle setters.
        </div>
      ) : null}

      <form className="grid gap-3" onSubmit={(event) => void handleSubmit(event)}>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Setter method</span>
          <select
            className="h-10 rounded-md border border-input bg-white px-3 font-mono text-xs font-semibold text-slate-950 outline-none transition focus:ring-2 focus:ring-ring dark:bg-slate-950 dark:text-slate-50"
            onChange={(event) => setSelectedMessage(event.target.value)}
            value={selectedRow.message}
          >
            {mutatingMessages.map((row) => (
              <option key={row.message} value={row.message}>
                {row.message}
              </option>
            ))}
          </select>
        </label>

        {selectedRow.args.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {selectedRow.args.map((arg) => (
              <label className="grid gap-1" key={arg.label}>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {arg.label} <span className="font-mono text-slate-400">({arg.type})</span>
                </span>
                <ArgumentValueField
                  arg={arg}
                  onChange={(value) => setArgValues((current) => ({ ...current, [arg.label]: value }))}
                  value={argValues[arg.label] ?? getDefaultSetterArgValue(arg)}
                />
              </label>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-border px-3 py-4 text-sm font-medium text-slate-500 dark:text-slate-400">
            This setter has no arguments.
          </div>
        )}

        {error ? <div className="text-xs font-semibold text-red-600 dark:text-red-300">{error}</div> : null}
        {message ? <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{message}</div> : null}

        <Button className="h-10 justify-self-start px-3 text-xs" disabled={!canSubmit} type="submit">
          <Send className={sending ? 'h-3.5 w-3.5 animate-pulse' : 'h-3.5 w-3.5'} />
          {sending ? 'Sending...' : 'Run Setter'}
        </Button>
      </form>
    </div>
  )
}

export function PortfolioAdminPage({ contractId }: PortfolioAdminPageProps) {
  const { data, error, isError, isFetching, isLoading, refetch } = useGetContractGetterAdminDetailsQuery({ contractId })
  const loading = isLoading || isFetching
  const pageLabel = data?.label ?? contractGetterAdminNavItems.find((item) => item.id === contractId)?.label ?? 'Contract'

  return (
    <section className="w-full rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <Database className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">{pageLabel} Getters</h1>
            <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
              {data?.address ?? 'Loading contract address'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            className="h-8 px-2.5 text-xs"
            onClick={() => navigateToAdminPath('/admin/token')}
            type="button"
            variant="outline"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Token
          </Button>
          <Button className="h-8 px-2.5 text-xs" disabled={loading} onClick={() => void refetch()} variant="outline">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="space-y-4 px-5 py-5">
        <ContractSelector activeContractId={contractId} />

        {isError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm font-medium text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">
            {getErrorMessage(error)}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-md border border-border px-4 py-8 text-center">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-400" />
            <div className="mt-3 text-sm font-semibold text-slate-950 dark:text-slate-50">Loading contract getters</div>
          </div>
        ) : null}

        {data ? (
          <>
            <div className="flex flex-wrap gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              <span>{data.readCount} callable reads</span>
              <span>{data.skippedRows.length} require arguments</span>
            </div>
            <div className="grid gap-4 xl:grid-cols-2">
              {data.sections.map((section) => (
                <ReadSection key={section.id} section={section} />
              ))}
            </div>
            {supportsInteractiveArgumentReads(contractId) ? (
              <ContractArgumentReads contractId={contractId} label={data.label} rows={data.skippedRows} />
            ) : (
              <SkippedReadsTable rows={data.skippedRows} />
            )}
            {contractId === 'oracle' ? <OracleSetterSection onUpdated={() => void refetch()} /> : null}
          </>
        ) : null}
      </div>
    </section>
  )
}
