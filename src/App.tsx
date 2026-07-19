import { useEffect, useState, type MouseEvent } from 'react'
import { Contract, toEvmAddress } from 'dedot/contracts'
import { CircleDollarSign, Moon, ShieldCheck, Sun } from 'lucide-react'
import { useTypink } from 'typink'
import tokenMetadata from '../abis/token.json'
import { PortfolioAdminPage } from '@/components/admin/PortfolioAdminPage'
import { ContractBlockEventsPage, TokenAdminPage } from '@/components/admin/TokenAdminPage'
import { IndexValueCard } from '@/components/index/IndexValueCard'
import { PortfolioTokenContextsPanel } from '@/components/portfolio/PortfolioTokenContextsPanel'
import { BuySellIndexWidget } from '@/components/trade/BuySellIndexWidget'
import { Button } from '@/components/ui/button'
import { PaseoWalletSetupButton } from '@/components/wallet/PaseoWalletSetupButton'
import { WalletConnectButton } from '@/components/wallet/WalletConnectButton'
import { deploymentConfig, resolveTokenDecimals } from '@/config/contracts'
import { isContractGetterAdminContractId } from '@/data/contractGetterAdmin'
import { useDedotChainStatus } from '@/hooks/useDedotChainStatus'
import { contractReadScheduler, type ContractReadScheduler } from '@/lib/contractReadScheduler'
import type { HeaderTokenBalance } from '@/store/portfolioApi'

type ThemeMode = 'dark' | 'light'
const DEFAULT_READONLY_CALLER_ADDRESS = '5GrwvaEF5zXb26Fz9rcQpDWS57CtERHpNehXCPcNoHGKutQY'

function Logo() {
  return (
    <a
      aria-label="W3PI home"
      className="flex items-center gap-2.5 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      href="/"
      onClick={handleHomeLinkClick}
      title="W3PI home"
    >
      <div className="grid h-7 w-7 grid-cols-3 items-end gap-0.5">
        <span className="h-3 rounded-sm bg-blue-500" />
        <span className="h-5 rounded-sm bg-indigo-500" />
        <span className="h-7 rounded-sm bg-emerald-500" />
      </div>
      <span className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold text-slate-950 dark:text-slate-50">W3PI</span>
        <span
          className="text-[10px] font-medium text-slate-400 dark:text-slate-500"
          title={`Application version ${__APP_VERSION__}`}
        >
          v{__APP_VERSION__}
        </span>
      </span>
    </a>
  )
}

function handleHomeLinkClick(event: MouseEvent<HTMLAnchorElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  navigateTo('/')
}

function ChainIndicator() {
  const chainStatus = useDedotChainStatus()
  const connected = chainStatus.status === 'connected'
  const label = connected ? 'Connected' : 'Not Connected'
  const tooltip = [
    'Green means connected to chain. Red means not connected to chain.',
    `RPC: ${chainStatus.rpcUrl || 'not configured'}`,
    chainStatus.chainName ? `Chain: ${chainStatus.chainName}` : undefined,
    chainStatus.bestBlockNumber !== undefined ? `Best block: #${chainStatus.bestBlockNumber}` : undefined,
    chainStatus.error ? `Error: ${chainStatus.error}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <div className="group relative">
      <div
        aria-label={label}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-white px-2.5 text-xs font-medium text-slate-700 dark:bg-slate-950 dark:text-slate-200"
        role="status"
        title={tooltip}
      >
        <span
          className={connected ? 'h-2.5 w-2.5 rounded-full bg-emerald-500' : 'h-2.5 w-2.5 rounded-full bg-red-500'}
        />
        <span>{label}</span>
      </div>
      <div className="pointer-events-none absolute right-0 top-12 z-10 hidden w-72 whitespace-pre-line rounded-md border border-border bg-slate-950 px-3 py-2 text-xs font-medium leading-5 text-white group-hover:block">
        {tooltip}
      </div>
    </div>
  )
}

function getInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light'
  }

  const storedTheme = window.localStorage.getItem('w3pi-theme')

  if (storedTheme === 'dark' || storedTheme === 'light') {
    return storedTheme
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())
  const dark = theme === 'dark'

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem('w3pi-theme', theme)
  }, [dark, theme])

  return (
    <button
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-950 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-50"
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      type="button"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

function formatTokenBalance(value: string | undefined, decimals: number | undefined) {
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
      .slice(0, 4)
      .replace(/0+$/, '')

    return fractionText ? `${whole.toLocaleString('en-US')}.${fractionText}` : whole.toLocaleString('en-US')
  } catch {
    return value
  }
}

function TokenBalanceIcon({ token }: { token: HeaderTokenBalance }) {
  if (token.id === 'w3pi') {
    return (
      <span className="grid h-5 w-5 shrink-0 grid-cols-3 items-end gap-px rounded bg-slate-100 p-0.5 dark:bg-slate-900">
        <span className="h-2 rounded-[1px] bg-blue-500" />
        <span className="h-3 rounded-[1px] bg-indigo-500" />
        <span className="h-4 rounded-[1px] bg-emerald-500" />
      </span>
    )
  }

  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300">
      <CircleDollarSign className="h-3.5 w-3.5" />
    </span>
  )
}

type HeaderTokenContractApi = {
  query: {
    psp22BalanceOf: (owner: string) => Promise<{ data: bigint }>
    psp22MetadataTokenDecimals: () => Promise<{ data: number }>
    psp22MetadataTokenSymbol: () => Promise<{ data?: string }>
  }
}

type HeaderVisibleTokenBalance = HeaderTokenBalance & {
  error?: string
}

type HeaderTokenConfig = {
  address: string
  fallbackSymbol: string
  id: HeaderTokenBalance['id']
  label: string
}

function normalizeHeaderHexAddress(address: string | undefined) {
  return address?.toLowerCase()
}

function normalizeHeaderTokenSymbol(value: unknown, fallback: string) {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : fallback
}

function toHeaderReviveAddress(address: string | undefined) {
  if (!address) {
    return undefined
  }

  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return normalizeHeaderHexAddress(address)
  }

  try {
    return normalizeHeaderHexAddress(toEvmAddress(address))
  } catch {
    return undefined
  }
}

async function loadHeaderBalanceFromClient(
  client: unknown,
  scheduler: ContractReadScheduler,
  owner: string,
  caller: string,
  id: HeaderTokenBalance['id'],
  label: string,
  fallbackSymbol: string,
  address: string,
): Promise<HeaderTokenBalance> {
  const normalizedAddress = normalizeHeaderHexAddress(address) ?? address
  const token = new Contract(client as never, tokenMetadata, normalizedAddress, {
    defaultCaller: caller,
  }) as unknown as HeaderTokenContractApi
  const [decimalsResult, symbolResult, balanceResult] = await Promise.all([
    scheduler.schedule(() => token.query.psp22MetadataTokenDecimals()),
    scheduler.schedule(() => token.query.psp22MetadataTokenSymbol()),
    scheduler.schedule(() => token.query.psp22BalanceOf(owner)),
  ])

  return {
    address: normalizedAddress,
    balance: balanceResult.data.toString(),
    decimals: resolveTokenDecimals(normalizedAddress, decimalsResult.data),
    id,
    label,
    symbol: normalizeHeaderTokenSymbol(symbolResult.data, fallbackSymbol),
  }
}

function getHeaderTokenConfigs() {
  return [
    deploymentConfig.contracts.w3piToken
      ? {
          address: deploymentConfig.contracts.w3piToken,
          fallbackSymbol: 'W3PI',
          id: 'w3pi' as const,
          label: 'W3PI',
        }
      : undefined,
    deploymentConfig.contracts.usdcToken
      ? {
          address: deploymentConfig.contracts.usdcToken,
          fallbackSymbol: 'USDC',
          id: 'usdc' as const,
          label: 'USDC',
        }
      : undefined,
  ].filter((token): token is HeaderTokenConfig => Boolean(token))
}

async function loadVisibleHeaderBalance(
  client: unknown,
  scheduler: ContractReadScheduler,
  owner: string,
  queryCaller: string,
  token: HeaderTokenConfig,
): Promise<HeaderVisibleTokenBalance> {
  try {
    return await loadHeaderBalanceFromClient(
      client,
      scheduler,
      owner,
      queryCaller,
      token.id,
      token.label,
      token.fallbackSymbol,
      token.address,
    )
  } catch (error) {
    return {
      address: token.address,
      error: getHeaderBalanceError(error),
      id: token.id,
      label: token.label,
      symbol: token.fallbackSymbol,
    }
  }
}

function HeaderTokenBalances() {
  const { client, connectedAccount } = useTypink()
  const [balances, setBalances] = useState<HeaderVisibleTokenBalance[]>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [refreshNonce, setRefreshNonce] = useState(0)

  useEffect(() => {
    function handleBalancesChanged() {
      setRefreshNonce((current) => current + 1)
    }

    window.addEventListener('w3pi:balancesChanged', handleBalancesChanged)

    return () => {
      window.removeEventListener('w3pi:balancesChanged', handleBalancesChanged)
    }
  }, [])

  useEffect(() => {
    let active = true

    async function loadBalances() {
      if (!client || !connectedAccount) {
        setBalances(undefined)
        setErrorMessage(undefined)
        setLoading(false)
        return
      }

      const owner = toHeaderReviveAddress(connectedAccount.address)

      if (!owner) {
        setBalances(undefined)
        setErrorMessage('Unable to derive revive address for connected wallet')
        setLoading(false)
        return
      }

      setLoading(true)
      setErrorMessage(undefined)

      try {
        const queryCaller = deploymentConfig.readonlyCallerAddress || DEFAULT_READONLY_CALLER_ADDRESS
        const nextBalances = await Promise.all(
          getHeaderTokenConfigs().map((token) =>
            loadVisibleHeaderBalance(client, contractReadScheduler, owner, queryCaller, token),
          ),
        )

        if (active) {
          setBalances(nextBalances)
        }
      } catch (error) {
        if (active) {
          setErrorMessage(getHeaderBalanceError(error))
          setBalances(undefined)
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadBalances()

    return () => {
      active = false
    }
  }, [client, connectedAccount, refreshNonce])

  if (!connectedAccount) {
    return null
  }

  const visibleBalances = balances ?? [
    {
      address: '',
      id: 'w3pi' as const,
      label: 'W3PI',
      symbol: 'W3PI',
    },
    {
      address: '',
      id: 'usdc' as const,
      label: 'USDC',
      symbol: 'USDC',
    },
  ]

  return (
    <div className="hidden items-center gap-1 md:flex">
      {visibleBalances.map((token) => (
        <div
          className="flex h-8 items-center gap-1.5 rounded-md border border-border bg-white px-2 text-xs font-semibold text-slate-800 dark:bg-slate-950 dark:text-slate-100"
          key={token.id}
          title={errorMessage ?? token.error ?? `${token.symbol}: ${formatTokenBalance(token.balance, token.decimals)}`}
        >
          <TokenBalanceIcon token={token} />
          <span className={errorMessage || token.error ? 'text-red-600 dark:text-red-300' : 'text-slate-500 dark:text-slate-400'}>
            {token.symbol}
          </span>
          <span>{loading || errorMessage || token.error ? '--' : formatTokenBalance(token.balance, token.decimals)}</span>
        </div>
      ))}
    </div>
  )
}

function getHeaderBalanceError(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  if (error && typeof error === 'object' && 'data' in error && typeof error.data === 'object' && error.data) {
    const data = error.data

    if ('message' in data && typeof data.message === 'string') {
      return data.message
    }
  }

  return 'Unable to load W3PI and USDC balances'
}

function getCurrentPath() {
  if (typeof window === 'undefined') {
    return '/'
  }

  return window.location.pathname
}

function useCurrentPath() {
  const [path, setPath] = useState(() => getCurrentPath())

  useEffect(() => {
    function handlePathChange() {
      setPath(getCurrentPath())
    }

    window.addEventListener('popstate', handlePathChange)
    window.addEventListener('w3pi:navigation', handlePathChange)

    return () => {
      window.removeEventListener('popstate', handlePathChange)
      window.removeEventListener('w3pi:navigation', handlePathChange)
    }
  }, [])

  return path
}

function navigateTo(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new Event('w3pi:navigation'))
}

function HeaderRouteButton({ active, path }: { active: boolean; path: string }) {
  return (
    <Button
      aria-label={active ? 'Open W3PI home' : 'Open token admin'}
      className="h-8 px-2.5 text-xs"
      onClick={() => navigateTo(active ? '/' : path)}
      title={active ? 'W3PI home' : 'Token admin'}
      variant="outline"
    >
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">{active ? 'Home' : 'Admin'}</span>
    </Button>
  )
}

function HomePage() {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(360px,2fr)]">
      <div className="space-y-4">
        <IndexValueCard />
        <PortfolioTokenContextsPanel />
      </div>
      <div className="xl:sticky xl:top-20 xl:self-start">
        <BuySellIndexWidget />
      </div>
    </div>
  )
}

export function App() {
  const path = useCurrentPath()
  const blockEventsMatch = path.match(/^\/admin\/events\/block\/(\d+)$/)
  const blockEventsNumber = blockEventsMatch ? Number(blockEventsMatch[1]) : undefined
  const contractAdminMatch = path.match(/^\/admin\/contracts\/([a-z0-9-]+)$/)
  const contractAdminRouteId = contractAdminMatch?.[1]
  const tokenAdminRoute = path === '/admin/token'
  const portfolioAdminRoute = path === '/admin/portfolio'
  const selectedContractGetterId = portfolioAdminRoute
    ? 'portfolio'
    : isContractGetterAdminContractId(contractAdminRouteId)
      ? contractAdminRouteId
      : undefined
  const adminRoute = tokenAdminRoute || selectedContractGetterId !== undefined || blockEventsNumber !== undefined

  return (
    <div className="min-h-screen bg-background transition-colors">
      <header className="flex h-14 items-center justify-between border-b border-border bg-white px-4 transition-colors sm:px-6 lg:px-8 dark:bg-slate-950">
        <Logo />
        <div className="flex items-center gap-2">
          <HeaderRouteButton active={adminRoute} path="/admin/token" />
          <ChainIndicator />
          <HeaderTokenBalances />
          <PaseoWalletSetupButton />
          <WalletConnectButton />
          <ThemeToggle />
        </div>
      </header>
      <main className="min-h-[calc(100vh-3.5rem)] px-4 py-6 sm:px-6 lg:px-8">
        {blockEventsNumber !== undefined ? (
          <ContractBlockEventsPage blockNumber={blockEventsNumber} />
        ) : selectedContractGetterId ? (
          <PortfolioAdminPage contractId={selectedContractGetterId} />
        ) : tokenAdminRoute ? (
          <TokenAdminPage />
        ) : (
          <HomePage />
        )}
      </main>
    </div>
  )
}
