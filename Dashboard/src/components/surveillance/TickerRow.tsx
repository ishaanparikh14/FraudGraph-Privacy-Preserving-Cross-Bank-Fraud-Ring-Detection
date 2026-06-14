import { motion } from 'framer-motion'
import { ArrowRight, Copy, ExternalLink } from 'lucide-react'
import { memo } from 'react'
import { useNavigate } from 'react-router-dom'
import { copyToClipboard } from '../../lib/copyToClipboard'
import { getRiskLevel, RISK_BADGE } from '../../lib/riskLevel'
import { useDashboardUiStore } from '../../store/dashboardUiStore'
import type { FraudAlert, IngestedTransaction } from '../../types/fraudStream'
import { MissingFieldBadge } from '../MissingFieldBadge'

export const TickerRow = memo(function TickerRow({
  txn,
  latestAlert,
}: {
  txn: IngestedTransaction
  latestAlert: FraudAlert | null
}) {
  const navigate  = useNavigate()
  const risk      = getRiskLevel(txn, latestAlert)
  const badge     = RISK_BADGE[risk]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className={`rounded-md border px-3 py-2.5 transition-colors hover:bg-zinc-800/20 ${badge.rowBorder}`}
    >
      {/* ── row 1: txn id + actions ── */}
      <div className="mb-1 flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-zinc-600">TXN</span>
        <span className="flex-1 truncate font-mono text-xs text-zinc-300">
          {txn.txn_id ? `${txn.txn_id.slice(0, 16)}…` : <MissingFieldBadge field="txn_id" />}
        </span>
        {txn.txn_id && (
          <button
            type="button"
            onClick={() => void copyToClipboard(txn.txn_id)}
            className="text-zinc-600 transition-colors hover:text-zinc-300"
            title="Copy txn_id"
          >
            <Copy size={10} />
          </button>
        )}
        {txn.txn_id && (
          <button
            type="button"
            onClick={() => {
              useDashboardUiStore.getState().setPinnedTxnIdForXai(txn.txn_id)
              void navigate(`/investigate/${encodeURIComponent(txn.txn_id)}`)
            }}
            className="text-zinc-600 transition-colors hover:text-fg-blue"
            title="Investigate"
          >
            <ExternalLink size={10} />
          </button>
        )}
      </div>

      {/* ── row 2: accounts ── */}
      <div className="mb-1.5 flex items-center gap-1">
        <span className="max-w-[62px] truncate font-mono text-xs text-zinc-500">
          {txn.source_account?.slice(0, 8) ?? <MissingFieldBadge field="src" />}
        </span>
        <ArrowRight size={8} className="shrink-0 text-zinc-700" />
        <span className="max-w-[62px] truncate font-mono text-xs text-zinc-500">
          {txn.target_account?.slice(0, 8) ?? <MissingFieldBadge field="tgt" />}
        </span>
      </div>

      {/* ── row 3: amount + badges ── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="font-mono text-xs font-semibold text-zinc-100">
          ${txn.amount?.toLocaleString() ?? '—'}
        </span>

        {/* risk level badge */}
        <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[10px] font-semibold ${badge.border} ${badge.bg} ${badge.text}`}>
          <span className={`size-1.5 rounded-full ${badge.dot}`} />
          {badge.label}
        </span>

        {/* ring badge (additional, only when in ring) */}
        {txn.fraud_ring_id && (
          <span className="rounded border border-red-900/50 bg-red-950/30 px-1.5 py-0.5 font-mono text-[10px] text-red-500">
            ⬡ RING
          </span>
        )}

        {/* risk score pill (only when present) */}
        {txn.risk_score != null && (
          <span className="ml-auto font-mono text-[10px] text-zinc-600">
            {(txn.risk_score * 100).toFixed(0)}%
          </span>
        )}
      </div>
    </motion.div>
  )
})
