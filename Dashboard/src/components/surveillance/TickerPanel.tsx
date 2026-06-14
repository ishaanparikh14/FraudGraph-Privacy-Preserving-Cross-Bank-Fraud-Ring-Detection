import { AnimatePresence } from 'framer-motion'
import { Radio } from 'lucide-react'
import { memo, useMemo } from 'react'
import { useStreamStore } from '../../store/streamStore'
import type { IngestedTransaction } from '../../types/fraudStream'
import { TickerRow } from './TickerRow'

type Props = {
  transactions: IngestedTransaction[]
  isPaused: boolean
}

export const TickerPanel = memo(function TickerPanel({ transactions, isPaused }: Props) {
  const latestAlert = useStreamStore((s) => s.fraudAlerts[0] ?? null)
  const recent = useMemo(() => transactions.slice(0, 15), [transactions])

  return (
    <div className="fg-card flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Live Transactions</span>
        <div className="flex items-center gap-2">
          {isPaused ? (
            <span className="rounded border border-amber-900 bg-amber-950/40 px-1.5 py-0.5 font-mono text-xs text-amber-500">
              PAUSED
            </span>
          ) : null}
          <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-500">
            {recent.length}/15
          </span>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        <AnimatePresence initial={false}>
          {recent.map((txn) => (
            <TickerRow key={txn.txn_id} txn={txn} latestAlert={latestAlert} />
          ))}
        </AnimatePresence>
        {recent.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center gap-2 text-zinc-600">
            <Radio size={20} />
            <span className="font-mono text-xs">Awaiting stream data...</span>
          </div>
        ) : null}
      </div>
    </div>
  )
})
