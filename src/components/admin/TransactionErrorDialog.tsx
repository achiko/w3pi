import { useEffect, useState } from 'react'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  formatTransactionErrorReport,
  type TransactionErrorDetails,
} from '@/lib/transactionError'

export function TransactionErrorDialog({
  details,
  onClose,
}: {
  details: TransactionErrorDetails
  onClose: () => void
}) {
  const [copyStatus, setCopyStatus] = useState<'copied' | 'error' | 'idle'>('idle')
  const formattedReport = formatTransactionErrorReport(details)

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(formattedReport)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }

    window.setTimeout(() => setCopyStatus('idle'), 2_000)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div
        aria-labelledby="transaction-error-title"
        aria-modal="true"
        className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-white shadow-xl dark:bg-slate-950"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border p-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-950 dark:text-slate-50" id="transaction-error-title">
              Transaction error details
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Copy these diagnostics when reporting the failure.
            </p>
          </div>
          <button
            aria-label="Close transaction error details"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-900"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-3 overflow-y-auto p-4 text-xs">
          <div className="grid gap-2 sm:grid-cols-2">
            <Detail label="Error" value={details.name} />
            <Detail label="RPC code" value={details.code ?? 'Not provided'} />
          </div>
          <Detail label="Message" value={details.message} />
          <Detail
            label="RPC data"
            value={details.data ?? 'The RPC provider did not include an error.data reason.'}
          />
          <Detail
            label="Signing payload"
            value={details.payload ?? 'The failure occurred before a signing payload was created.'}
          />
          {details.cause ? <Detail label="Cause" value={details.cause} /> : null}
          {details.context ? <Detail label="Transaction context" value={details.context} /> : null}
          {details.stack ? <Detail label="Stack" value={details.stack} /> : null}
          <Detail label="Timestamp" value={details.timestamp} />
        </div>

        <div className="flex justify-end gap-2 border-t border-border p-4">
          <Button onClick={() => void copyDetails()} type="button" variant="outline">
            {copyStatus === 'copied' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copyStatus === 'copied'
              ? 'Payload + error copied'
              : copyStatus === 'error'
                ? 'Copy failed'
                : 'Copy payload + error'}
          </Button>
          <Button onClick={onClose} type="button">
            Close
          </Button>
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-border bg-slate-50 p-3 dark:bg-slate-900">
      <div className="font-semibold uppercase tracking-normal text-slate-500 dark:text-slate-400">{label}</div>
      <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap break-all font-mono leading-5 text-slate-800 dark:text-slate-100">
        {value}
      </pre>
    </div>
  )
}
