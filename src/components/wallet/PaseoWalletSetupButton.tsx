import { useEffect, useRef, useState } from 'react'
import { Check, Copy, ExternalLink, LoaderCircle, Network, X } from 'lucide-react'
import { paseoAssetHub } from 'typink'
import { Button } from '@/components/ui/button'
import { W3PI_NETWORK_ID } from '@/config/network'
import {
  PASEO_ASSET_HUB_PUBLIC_RPC,
  syncPaseoMetadataToTalisman,
  TALISMAN_SUBSTRATE_NETWORK_GUIDE,
} from '@/lib/talismanPaseo'

type SetupStatus = 'error' | 'idle' | 'success' | 'syncing'

export function PaseoWalletSetupButton() {
  const [copied, setCopied] = useState(false)
  const [message, setMessage] = useState('Approve the metadata update in Talisman, then retry your transaction.')
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState<SetupStatus>('idle')
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  if (W3PI_NETWORK_ID !== paseoAssetHub.id) {
    return null
  }

  async function handleSetup() {
    setOpen(true)
    setStatus('syncing')
    setMessage('Loading current Paseo metadata from the configured RPC...')

    try {
      const result = await syncPaseoMetadataToTalisman()
      setStatus('success')
      setMessage(`Paseo metadata ${result.specVersion.toLocaleString('en-US')} is ready. Retry the transaction.`)
    } catch (error) {
      setStatus('error')
      setMessage(error instanceof Error ? error.message : 'Unable to update Talisman metadata')
    }
  }

  async function handleCopyRpc() {
    try {
      await navigator.clipboard.writeText(PASEO_ASSET_HUB_PUBLIC_RPC)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setMessage('Could not copy the RPC. Select it below and copy it manually.')
      setStatus('error')
    }
  }

  return (
    <div className="relative" ref={panelRef}>
      <Button
        className="h-8 px-2.5 text-xs"
        disabled={status === 'syncing'}
        onClick={() => void handleSetup()}
        title="Add Paseo Asset Hub metadata to Talisman"
        variant="outline"
      >
        {status === 'syncing' ? (
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
        ) : status === 'success' ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : (
          <Network className="h-3.5 w-3.5" />
        )}
        <span className="hidden lg:inline">{status === 'success' ? 'Paseo ready' : 'Add Paseo'}</span>
      </Button>

      {open ? (
        <div className="absolute right-0 top-10 z-30 w-80 rounded-md border border-border bg-white p-3 text-xs shadow-lg dark:bg-slate-950">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-950 dark:text-slate-50">Paseo Asset Hub in Talisman</div>
              <p
                className={
                  status === 'error'
                    ? 'mt-1.5 leading-5 text-red-600 dark:text-red-400'
                    : 'mt-1.5 leading-5 text-slate-600 dark:text-slate-300'
                }
              >
                {message}
              </p>
            </div>
            <button
              aria-label="Close Paseo wallet setup"
              className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            <p className="leading-5 text-slate-600 dark:text-slate-300">
              If Talisman still shows <span className="font-semibold">Network Unknown</span>, add this public RPC once
              under Settings → Networks and Tokens → Manage Networks → Add network → Polkadot.
            </p>
            <div className="mt-2 flex items-center gap-2 rounded border border-border bg-slate-50 p-2 dark:bg-slate-900">
              <code className="min-w-0 flex-1 truncate text-[11px] text-slate-700 dark:text-slate-200">
                {PASEO_ASSET_HUB_PUBLIC_RPC}
              </code>
              <button
                aria-label="Copy Paseo RPC"
                className="rounded p-1 text-slate-500 hover:bg-white hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-slate-50"
                onClick={() => void handleCopyRpc()}
                title="Copy Paseo RPC"
                type="button"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <a
              className="mt-2 inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline dark:text-blue-400"
              href={TALISMAN_SUBSTRATE_NETWORK_GUIDE}
              rel="noreferrer"
              target="_blank"
            >
              Talisman setup guide
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      ) : null}
    </div>
  )
}
