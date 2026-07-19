import { RefreshCw } from 'lucide-react'
import {
  useGetIndexValueSummaryQuery,
  type IndexValueSummary,
} from '@/store/portfolioApi'

//TODO: move to config file
const INDEX_VALUE_DECIMALS = 9

function formatInteger(value: bigint) {
  return value.toLocaleString('en-US')
}

function formatScaledDecimal(value: string, decimals: number, maxFractionDigits = 2) {
  try {
    const rawValue = BigInt(value)
    const divisor = 10n ** BigInt(decimals)
    const whole = rawValue / divisor
    const fraction = rawValue % divisor

    if (fraction === 0n) {
      return formatInteger(whole)
    }

    const fractionText = fraction
      .toString()
      .padStart(decimals, '0')
      .slice(0, maxFractionDigits)
      .replace(/0+$/, '')

    return fractionText ? `${formatInteger(whole)}.${fractionText}` : formatInteger(whole)
  } catch {
    return value
  }
}

function formatCurrency(value: string) {
  return `$${formatScaledDecimal(value, INDEX_VALUE_DECIMALS)}`
}

function formatPerformance(bp: number) {
  const sign = bp > 0 ? '+' : ''
  return `${sign}${(bp / 100).toFixed(2).replace(/\.?0+$/, '')}%`
}

function makeChartPoints(summary: IndexValueSummary) {
  const base = Number(BigInt(summary.baseValue))
  const current = Number(BigInt(summary.currentValue))
  const safeBase = Number.isFinite(base) && base > 0 ? base : current || 1
  const safeCurrent = Number.isFinite(current) && current > 0 ? current : safeBase
  const midpoint = (safeBase + safeCurrent) / 2
  const variance = Math.max(Math.abs(safeCurrent - safeBase), safeBase * 0.012)

  return [
    safeBase,
    safeBase + variance * 0.1,
    midpoint - variance * 0.18,
    midpoint + variance * 0.14,
    safeCurrent - variance * 0.08,
    safeCurrent,
  ]
}

function Sparkline({ summary }: { summary: IndexValueSummary }) {
  const values = makeChartPoints(summary)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const width = 520
  const height = 120
  const padding = 10
  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2)
    const y = height - padding - ((value - min) / range) * (height - padding * 2)

    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const linePath = `M ${points.join(' L ')}`
  const areaPath = `${linePath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`
  const positive = summary.performanceBp >= 0

  return (
    <svg aria-hidden="true" className="h-28 w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
      <path d={areaPath} fill={positive ? 'rgb(236 253 245)' : 'rgb(254 242 242)'} />
      <path
        d={linePath}
        fill="none"
        stroke={positive ? 'rgb(16 185 129)' : 'rgb(239 68 68)'}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
    </svg>
  )
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unable to load index value'
}

export function IndexValueCard() {
  const { data, error, isError, isFetching, isLoading, refetch } = useGetIndexValueSummaryQuery(undefined)
  const loading = isLoading || isFetching
  const positive = (data?.performanceBp ?? 0) >= 0

  return (
    <section className="rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">Index Value</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">W3PI current index level</p>
        </div>
        <button
          className="inline-flex h-8 items-center gap-2 rounded-md px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-950 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-50"
          disabled={loading}
          onClick={() => void refetch()}
          type="button"
        >
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} />
          Refresh
        </button>
      </div>

      <div className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(180px,0.32fr)_1fr] lg:items-end">
        <div>
          <div className="text-sm font-semibold text-slate-500 dark:text-slate-400">W3PI</div>
          {isError ? (
            <div className="mt-4 text-sm font-medium text-red-600">{getErrorMessage(error)}</div>
          ) : (
            <>
              <div className="mt-3 text-5xl font-semibold tracking-normal text-slate-950 dark:text-slate-50">
                {data ? formatCurrency(data.currentValue) : '$--'}
              </div>
              <div
                className={
                  positive
                    ? 'mt-3 inline-flex rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700'
                    : 'mt-3 inline-flex rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700'
                }
                title={data ? `Raw performance: ${data.performanceBp} bp` : undefined}
              >
                {data ? formatPerformance(data.performanceBp) : '--'}
              </div>
              <div className="mt-3 text-xs font-medium text-slate-500 dark:text-slate-400">
                {data?.trackingEnabled ? 'Tracking enabled' : 'Tracking paused'}
                {data?.stale ? ' - stale value' : ''}
              </div>
            </>
          )}
        </div>

        <div className="min-h-32 rounded-lg bg-slate-50/70 px-3 py-3 dark:bg-slate-900/70">
          {data ? (
            <>
              <Sparkline summary={data} />
              <div className="mt-2 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                <span>Base {formatCurrency(data.baseValue)}</span>
                <span>Current {formatCurrency(data.currentValue)}</span>
              </div>
            </>
          ) : (
            <div className="flex h-28 items-center justify-center text-sm font-medium text-slate-400 dark:text-slate-500">
              {loading ? 'Loading index value...' : 'No index value loaded'}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
