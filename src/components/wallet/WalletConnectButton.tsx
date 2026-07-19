import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, Wallet } from 'lucide-react'
import { useTypink, type TypinkAccount } from 'typink'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function shortenAddress(address: string) {
  return `${address.slice(0, 5)}...${address.slice(-5)}`
}

function accountLabel(account: TypinkAccount) {
  return account.name ? `${account.name} (${shortenAddress(account.address)})` : shortenAddress(account.address)
}

export function WalletConnectButton() {
  const {
    accounts,
    connectedAccount,
    connectedWalletIds,
    connectWallet,
    disconnect,
    setConnectedAccount,
    wallets,
  } = useTypink()
  const [open, setOpen] = useState(false)
  const [connectingWalletId, setConnectingWalletId] = useState<string>()
  const [error, setError] = useState<string>()
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!connectedAccount && accounts.length > 0) {
      setConnectedAccount(accounts[0])
    }
  }, [accounts, connectedAccount, setConnectedAccount])

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  async function handleConnect(walletId: string) {
    setError(undefined)
    setConnectingWalletId(walletId)

    try {
      await connectWallet(walletId)
      setOpen(false)
    } catch {
      setError('Wallet connection failed')
    } finally {
      setConnectingWalletId(undefined)
    }
  }

  const installedWallets = wallets.filter((wallet) => wallet.installed)
  const connected = Boolean(connectedAccount)
  const label = connectedAccount ? accountLabel(connectedAccount) : 'Connect Wallet'

  return (
    <div className="relative" ref={menuRef}>
      <Button
        className="h-8 min-w-[128px] px-3 text-xs"
        onClick={() => setOpen((value) => !value)}
        variant={connected ? 'outline' : 'primary'}
      >
        <Wallet className="h-3.5 w-3.5" />
        <span className="max-w-[132px] truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-20 w-72 rounded-md border border-border bg-white p-1.5 dark:bg-slate-950">
          {connected ? (
            <>
              {accounts.map((account) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded px-2.5 py-2 text-left text-xs font-medium text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-900"
                  key={`${account.source}:${account.address}`}
                  onClick={() => {
                    setConnectedAccount(account)
                    setOpen(false)
                  }}
                  type="button"
                >
                  <span className="min-w-0 truncate">{accountLabel(account)}</span>
                  <Check
                    className={cn(
                      'h-3.5 w-3.5 shrink-0 text-emerald-600',
                      connectedAccount?.source === account.source && connectedAccount.address === account.address
                        ? 'opacity-100'
                        : 'opacity-0',
                    )}
                  />
                </button>
              ))}
              <div className="my-1 border-t border-border" />
              <button
                className="flex w-full items-center rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900"
                onClick={() => {
                  disconnect()
                  setOpen(false)
                }}
                type="button"
              >
                Disconnect
              </button>
            </>
          ) : (
            <>
              {installedWallets.length > 0 ? (
                installedWallets.map((wallet) => (
                  <button
                    className="flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-xs font-semibold text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900"
                    disabled={connectingWalletId === wallet.id}
                    key={wallet.id}
                    onClick={() => void handleConnect(wallet.id)}
                    type="button"
                  >
                    <img alt="" className="h-4 w-4 rounded-sm" src={wallet.logo} />
                    <span className="min-w-0 flex-1 truncate">
                      {connectingWalletId === wallet.id ? 'Connecting...' : wallet.name}
                    </span>
                  </button>
                ))
              ) : (
                <div className="px-2.5 py-2 text-xs font-medium text-slate-500 dark:text-slate-400">No wallet extension found</div>
              )}
              {error ? <div className="px-2.5 py-2 text-xs font-medium text-red-600">{error}</div> : null}
            </>
          )}
          {connectedWalletIds.length > 0 && !connected ? (
            <button
              className="mt-1 flex w-full items-center rounded border-t border-border px-2.5 py-2 text-left text-xs font-semibold text-slate-900 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-900"
              onClick={() => {
                disconnect()
                setOpen(false)
              }}
              type="button"
            >
              Reset wallet session
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
