import { RefreshCw } from 'lucide-react'
import dotIconUrl from '@/assets/token-icons/dot.png'
import polyxIconUrl from '@/assets/token-icons/polyx.png'
import { Button } from '@/components/ui/button'
import {
  useGetTokenExecutionContextsQuery,
  type RegisteredTokenDiagnostic,
  type TokenExecutionContext,
} from '@/store/portfolioApi'

const PRICE_DECIMALS = 9
const MARKET_VALUE_DECIMALS = 10
const DISPLAY_FRACTION_DIGITS = 2
const USDC_SYMBOL = 'USDC'
const TOKEN_ICON_URL_BY_SYMBOL: Record<string, string> = {
  DOT: dotIconUrl,
  POLYX: polyxIconUrl,
}

function formatInteger(value: string | bigint) {
  try {
    return BigInt(value).toLocaleString('en-US')
  } catch {
    return value.toString()
  }
}

function formatScaledDecimal(value: string | bigint, decimals: number, maxFractionDigits?: number) {
  try {
    const rawValue = typeof value === 'bigint' ? value : BigInt(value)
    const divisor = 10n ** BigInt(decimals)

    if (maxFractionDigits !== undefined && maxFractionDigits >= 0 && maxFractionDigits < decimals) {
      const outputScale = 10n ** BigInt(maxFractionDigits)
      const roundedValue = (rawValue * outputScale + divisor / 2n) / divisor
      const whole = roundedValue / outputScale
      const fraction = roundedValue % outputScale

      if (maxFractionDigits === 0) {
        return formatInteger(whole)
      }

      const fractionText = fraction.toString().padStart(maxFractionDigits, '0')

      return `${formatInteger(whole)}.${fractionText}`
    }

    const whole = rawValue / divisor
    const fraction = rawValue % divisor

    if (fraction === 0n) {
      return formatInteger(whole)
    }

    const fractionText = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')

    return `${formatInteger(whole)}.${fractionText}`
  } catch {
    return value.toString()
  }
}

function formatTokenAmount(value: string, decimals?: number) {
  if (decimals === undefined) {
    return formatInteger(value)
  }

  return formatScaledDecimal(value, decimals, DISPLAY_FRACTION_DIGITS)
}

function formatUsdcAmount(value: string | bigint, decimals: number, maxFractionDigits?: number) {
  return `${formatScaledDecimal(value, decimals, maxFractionDigits)} ${USDC_SYMBOL}`
}

function formatBasisPointsPercent(value: number) {
  return `${formatScaledDecimal(value.toString(), 2)}%`
}

function shortenAddress(address: string) {
  if (address.length <= 14) {
    return address
  }

  return `${address.slice(0, 8)}...${address.slice(-6)}`
}

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return 'Unable to load portfolio token contexts'
}

function getTokenIconUrl(symbol?: string) {
  if (!symbol) {
    return undefined
  }

  const normalizedSymbol = symbol.toUpperCase()
  const unwrappedSymbol = normalizedSymbol.startsWith('W') ? normalizedSymbol.slice(1) : normalizedSymbol

  return TOKEN_ICON_URL_BY_SYMBOL[normalizedSymbol] ?? TOKEN_ICON_URL_BY_SYMBOL[unwrappedSymbol]
}

function getTokenFallbackLabel(context: TokenExecutionContext) {
  return context.tokenSymbol?.slice(0, 1).toUpperCase() || String(context.tokenId)
}

function getWeightBarWidth(value: number) {
  return `${Math.min(Math.max(value / 100, 0), 100)}%`
}

function getAmountInUsdcValue(context: TokenExecutionContext) {
  if (context.tokenDecimals === undefined) {
    return undefined
  }

  try {
    const amount = BigInt(context.holding.amount)
    const price = BigInt(context.price)

    return {
      decimals: context.tokenDecimals + PRICE_DECIMALS,
      value: amount * price,
    }
  } catch {
    return undefined
  }
}

function formatAmountInUsdc(context: TokenExecutionContext) {
  const amountInUsdc = getAmountInUsdcValue(context)

  if (!amountInUsdc) {
    return '--'
  }

  return formatUsdcAmount(amountInUsdc.value, amountInUsdc.decimals, DISPLAY_FRACTION_DIGITS)
}

function getAmountInUsdcTitle(context: TokenExecutionContext) {
  const amountInUsdc = getAmountInUsdcValue(context)
  const displayed = formatAmountInUsdc(context)

  return [
    'Portfolio holding value in USDC',
    `Displayed: ${displayed}`,
    'Formula: amount * price',
    `Raw amount: ${context.holding.amount}`,
    `Raw price: ${context.price}`,
    context.tokenDecimals !== undefined ? `Scale: ${context.tokenDecimals} token decimals + ${PRICE_DECIMALS} price decimals` : undefined,
    amountInUsdc ? `Raw product: ${amountInUsdc.value.toString()}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

function getTokenHint(context: TokenExecutionContext) {
  return [
    `Token ID: ${context.tokenId}`,
    context.tokenSymbol ? `Symbol: ${context.tokenSymbol}` : undefined,
    context.tokenName ? `Name: ${context.tokenName}` : undefined,
    context.tokenDecimals !== undefined ? `Decimals: ${context.tokenDecimals}` : undefined,
    `Address: ${context.tokenAddr}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function TokenIdentity({ context }: { context: TokenExecutionContext }) {
  const iconUrl = getTokenIconUrl(context.tokenSymbol)
  const primaryLabel = context.tokenSymbol || `Token #${context.tokenId}`
  const secondaryLabel = context.tokenName || shortenAddress(context.tokenAddr)

  return (
    <div className="flex min-w-0 items-center gap-3" title={getTokenHint(context)}>
      {iconUrl ? (
        <img
          alt=""
          className="h-7 w-7 shrink-0 rounded-full"
          height={28}
          src={iconUrl}
          width={28}
        />
      ) : (
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-100 bg-slate-50 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          {getTokenFallbackLabel(context)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-950 dark:text-slate-50">{primaryLabel}</span>
        <span className="block truncate font-mono text-xs text-slate-500 dark:text-slate-400">
          {secondaryLabel} - {shortenAddress(context.tokenAddr)}
        </span>
      </span>
    </div>
  )
}

function TokenContextMetric({ label, title, value }: { label: string; title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white px-2.5 py-2 ring-1 ring-slate-100 dark:bg-slate-950 dark:ring-slate-800" title={title}>
      <dt className="text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 truncate font-mono text-xs text-slate-800 dark:text-slate-200">
        {value}
      </dd>
    </div>
  )
}

function TokenContextRows({ contexts }: { contexts: TokenExecutionContext[] }) {
  return (
    <div className="space-y-3 p-4">
      {contexts.map((context) => (
        <article className="rounded-md bg-slate-50/70 p-3 dark:bg-slate-900/60" key={context.tokenId}>
          <div className="flex items-start justify-between gap-3">
            <TokenIdentity context={context} />
            <div
              className="shrink-0 text-right"
              title={`Target portfolio weight\n${formatBasisPointsPercent(context.holding.targetWeightBp)}\nRaw: ${context.holding.targetWeightBp} bp`}
            >
              <div className="text-2xl font-semibold leading-none text-slate-950 dark:text-slate-50">
                {formatBasisPointsPercent(context.holding.targetWeightBp)}
              </div>
              <div className="mt-1 text-[10px] font-semibold uppercase text-slate-500 dark:text-slate-400">Weight</div>
            </div>
          </div>

          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-slate-950 dark:bg-slate-100"
              style={{ width: getWeightBarWidth(context.holding.targetWeightBp) }}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2">
            <TokenContextMetric
              label="Price"
              title={`Oracle price in USDC\nDisplayed: ${formatUsdcAmount(context.price, PRICE_DECIMALS)}\nRaw: ${context.price}\nScale: ${PRICE_DECIMALS} decimals`}
              value={formatUsdcAmount(context.price, PRICE_DECIMALS)}
            />
            <TokenContextMetric
              label="Amount"
              title={`Portfolio holding amount\nDisplayed: ${formatTokenAmount(context.holding.amount, context.tokenDecimals)}\nRaw: ${context.holding.amount}${context.tokenDecimals !== undefined ? `\nToken decimals: ${context.tokenDecimals}` : ''}`}
              value={formatTokenAmount(context.holding.amount, context.tokenDecimals)}
            />
            <TokenContextMetric
              label="Amount in USDC"
              title={getAmountInUsdcTitle(context)}
              value={formatAmountInUsdc(context)}
            />
            <TokenContextMetric
              label="Market Cap"
              title={`Oracle market cap in USDC\nDisplayed: ${formatUsdcAmount(context.marketCap, MARKET_VALUE_DECIMALS)}\nRaw: ${context.marketCap}\nScale: ${MARKET_VALUE_DECIMALS} decimals`}
              value={formatUsdcAmount(context.marketCap, MARKET_VALUE_DECIMALS)}
            />
          </dl>
        </article>
      ))}
    </div>
  )
}

function RegistryDiagnostic({ registryTokenCount, registeredTokens }: { registryTokenCount: number; registeredTokens: RegisteredTokenDiagnostic[] }) {
  const previewTokens = registeredTokens.slice(0, 4)

  return (
    <div className="px-5 py-10">
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="font-semibold">Registry has {registryTokenCount} token(s), but the portfolio has no holdings yet.</p>
        <p className="mt-1 text-amber-800">
          This panel shows portfolio-held token contexts. Basket setup still needs
          {' '}
          <span className="font-mono text-xs">portfolio.add_token_holding(...)</span>
          {' '}
          for registered token IDs.
        </p>
        {previewTokens.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {previewTokens.map((token) => (
              <span
                className="rounded border border-amber-200 bg-white px-2 py-1 font-mono text-xs text-amber-950"
                key={token.tokenId}
                title={token.tokenAddr}
              >
                #{token.tokenId} {shortenAddress(token.tokenAddr)}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  )
}

export function PortfolioTokenContextsPanel() {
  const { data, error, isError, isFetching, isLoading, refetch } = useGetTokenExecutionContextsQuery(undefined)
  const loading = isLoading || isFetching
  const contexts = data?.contexts ?? []
  const registryTokenCount = data?.registryTokenCount ?? 0
  const registeredTokens = data?.registeredTokens ?? []
  const skippedHeldTokenIds = data?.skippedHeldTokenIds ?? []
  const heldTokenIds = data?.heldTokenIds ?? []

  return (
    <section className="rounded-lg border border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
        <div>
          <h1 className="text-base font-semibold text-slate-950 dark:text-slate-50">Portfolio</h1>
        </div>
        <Button
          className="self-start sm:self-auto"
          disabled={loading}
          onClick={() => void refetch()}
          size="sm"
          variant="outline"
        >
          <RefreshCw className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
          Refresh
        </Button>
      </div>

      {loading && contexts.length === 0 ? (
        <div className="px-5 py-10 text-sm font-medium text-slate-500 dark:text-slate-400">Loading portfolio token contexts...</div>
      ) : null}

      {isError ? (
        <div className="px-5 py-10">
          <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {getErrorMessage(error)}
          </div>
        </div>
      ) : null}

      {!loading && !isError && contexts.length === 0 && heldTokenIds.length === 0 && registryTokenCount > 0 ? (
        <RegistryDiagnostic registeredTokens={registeredTokens} registryTokenCount={registryTokenCount} />
      ) : null}

      {!loading && !isError && contexts.length === 0 && skippedHeldTokenIds.length > 0 ? (
        <div className="px-5 py-10">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <p className="font-semibold">Portfolio returned held token IDs, but no rows could be built.</p>
            <p className="mt-1 text-amber-800">
              Skipped held IDs: <span className="font-mono text-xs">{skippedHeldTokenIds.join(', ')}</span>
            </p>
          </div>
        </div>
      ) : null}

      {!loading && !isError && contexts.length === 0 && heldTokenIds.length === 0 && registryTokenCount === 0 ? (
        <div className="px-5 py-10 text-sm font-medium text-slate-500 dark:text-slate-400">No held portfolio tokens found.</div>
      ) : null}

      {contexts.length > 0 ? <TokenContextRows contexts={contexts} /> : null}
    </section>
  )
}
