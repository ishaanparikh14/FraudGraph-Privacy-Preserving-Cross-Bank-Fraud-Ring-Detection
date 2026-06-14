import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { motion } from 'framer-motion'
import { ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { detectionMethodTooltip, fraudAlertDetectionLabel } from '../lib/fraudAlertDetectionLabel'
import { formatRelativeTime, pseudonymDirectory, type PseudonymEntry } from '../lib/sessionAnalytics'
import { useStreamStore } from '../store/streamStore'
import type { FraudAlert } from '../types/fraudStream'

const ph = createColumnHelper<PseudonymEntry>()
const ah = createColumnHelper<FraudAlert>()

export default function PrivacyPage() {
  const navigate = useNavigate()
  const transactions = useStreamStore((s) => s.transactions)
  const fraudAlerts = useStreamStore((s) => s.fraudAlerts)
  const integrationWarnings = useStreamStore((s) => s.integrationWarnings)
  const clearIntegrationWarnings = useStreamStore((s) => s.clearIntegrationWarnings)

  const dir = useMemo(() => pseudonymDirectory(transactions, fraudAlerts), [transactions, fraudAlerts])

  const [pSort, setPSort] = useState<SortingState>([])
  const [aSort, setASort] = useState<SortingState>([])

  const pColumns = useMemo(
    () => [
      ph.accessor('accountHash', {
        header: 'ACCOUNT_HASH',
        cell: (c) => <span className="font-mono text-zinc-300">{c.getValue().slice(0, 14)}…</span>,
      }),
      ph.accessor('directions', {
        header: 'DIRECTION',
        cell: (c) => {
          const d = c.getValue()
          const both = d.includes('SOURCE') && d.includes('TARGET')
          const label = both ? 'BOTH' : d[0] ?? '—'
          const cls = both
            ? 'border-purple-900 bg-purple-950/40 text-purple-300'
            : d[0] === 'SOURCE'
              ? 'border-fg-blue/50 bg-blue-950/30 text-fg-blue'
              : 'border-zinc-700 bg-zinc-800 text-zinc-400'
          return (
            <span className={`rounded border px-1.5 py-0.5 font-mono text-[10px] ${cls}`}>{label}</span>
          )
        },
      }),
      ph.accessor('txCount', {
        header: 'TX_COUNT',
        cell: (c) => <span className="font-mono text-zinc-400">{c.getValue()}</span>,
      }),
      ph.accessor('lastSeen', {
        header: 'LAST_SEEN',
        cell: (c) => <span className="font-mono text-zinc-500">{formatRelativeTime(c.getValue())}</span>,
      }),
      ph.accessor('isFraudLinked', {
        header: 'FRAUD_LINKED',
        cell: (c) =>
          c.getValue() ? (
            <span className="rounded border border-fg-red/40 bg-red-950/30 px-1.5 py-0.5 font-mono text-[10px] text-fg-red">
              YES
            </span>
          ) : (
            <span className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
              NO
            </span>
          ),
      }),
    ],
    [],
  )

  const pTable = useReactTable({
    data: dir,
    columns: pColumns,
    state: { sorting: pSort },
    onSortingChange: setPSort,
    getCoreRowModel: getCoreRowModel(),
  })

  const aColumns = useMemo(
    () => [
      ah.accessor('alert_id', {
        header: 'ALERT_ID',
        cell: (c) => {
          const v = c.getValue()
          return <span className="font-mono text-zinc-300">{v.length <= 12 ? v : `${v.slice(0, 12)}…`}</span>
        },
      }),
      ah.accessor('cycle_accounts', {
        header: 'CYCLE_LENGTH',
        cell: (c) => <span className="font-mono text-zinc-400">{c.getValue().length}</span>,
      }),
      ah.display({
        id: 'algorithm',
        header: 'DETECTION',
        cell: ({ row }) => {
          const a = row.original
          const label = fraudAlertDetectionLabel(a)
          if (label === '—') {
            return <span className="font-mono text-[10px] text-zinc-600">—</span>
          }
          return (
            <span
              className="rounded border border-fg-red/30 bg-red-950/40 px-1.5 py-0.5 font-mono text-[10px] text-fg-red"
              title={detectionMethodTooltip(a)}
            >
              {label}
            </span>
          )
        },
      }),
      ah.display({
        id: 'source',
        header: 'SOURCE',
        cell: ({ row }) => {
          const s = row.original.source?.trim()
          return s ? (
            <span className="font-mono text-[10px] text-zinc-400">{s}</span>
          ) : (
            <span className="font-mono text-zinc-600">—</span>
          )
        },
      }),
      ah.accessor('cycle_accounts', {
        id: 'accounts',
        header: 'ACCOUNTS',
        cell: (c) => (
          <span className="font-mono text-zinc-500">
            {c
              .getValue()
              .slice(0, 2)
              .map((a) => a.slice(0, 6))
              .join(', ')}
            …
          </span>
        ),
      }),
      ah.accessor('timestamp', {
        header: 'TIMESTAMP',
        cell: (c) => {
          const v = c.getValue()
          return <span className="font-mono text-zinc-500">{v ? formatRelativeTime(v) : '—'}</span>
        },
      }),
    ],
    [],
  )

  const aTable = useReactTable({
    data: fraudAlerts,
    columns: aColumns,
    state: { sorting: aSort },
    onSortingChange: setASort,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Security & Privacy</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Session-scoped pseudonym handling and audit logs. No PII is ever stored or transmitted.
          </p>
        </div>
        <span className="flex-shrink-0 rounded border border-amber-900 bg-amber-950/40 px-2 py-1 font-mono text-xs text-amber-500">
          SESSION DATA ONLY — not persisted
        </span>
      </div>

      <div className="flex flex-col gap-4">
        <section className="fg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">PSEUDONYM ACTIVITY</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-600">{dir.length} accounts</span>
          </div>
          <p className="border-b border-zinc-800 p-3 pt-0 text-xs text-zinc-600">
            Account identifiers are pseudonymized SHA-256 hashes from the ingest pipeline. No source bank or real identity is
            exposed to this UI.
          </p>
          {dir.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-700">
              <ShieldCheck size={24} />
              <span className="font-mono text-xs">No transactions received this session. Start Live Injection on Surveillance.</span>
            </div>
          ) : (
            <div className="max-h-[min(480px,55vh)] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-900/50 font-mono uppercase tracking-wider text-zinc-500">
                  {pTable.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => (
                        <th key={h.id} className="px-3 py-2">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {pTable.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="border-b border-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-900/40">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 font-mono">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="fg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">FRAUD RING ALERTS (SESSION)</span>
            <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-600">{fraudAlerts.length}</span>
          </div>
          <p className="border-b border-zinc-800 p-3 pt-0 text-xs text-zinc-600">
            Events from <span className="text-zinc-500">/topic/fraud-alerts</span>. <span className="text-zinc-500">Detection</span> shows a readable
            label for <span className="text-zinc-500">detection_method</span> from JSON (e.g. <span className="text-zinc-400">tarjan_scc</span> →{' '}
            <span className="text-zinc-400">Tarjan&apos;s SCC</span>); otherwise we infer from the alert{' '}
            <span className="text-zinc-500">reason</span> / <span className="text-zinc-500">source</span>. Hover a row for raw{' '}
            <span className="text-zinc-500">detection_method</span> from JSON and full reason.
          </p>
          {fraudAlerts.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-zinc-700">
              <ShieldCheck size={24} />
              <span className="font-mono text-xs">No alerts yet.</span>
            </div>
          ) : (
            <div className="max-h-[min(360px,45vh)] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-zinc-900/50 font-mono uppercase tracking-wider text-zinc-500">
                  {aTable.getHeaderGroups().map((hg) => (
                    <tr key={hg.id}>
                      {hg.headers.map((h) => (
                        <th key={h.id} className="px-3 py-2">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {aTable.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className="cursor-pointer border-b border-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-900/40"
                      onClick={() => {
                        const e = row.original.edge_ids[0]
                        if (e) void navigate(`/investigate/${encodeURIComponent(e)}`)
                        else void navigate('/investigate')
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-3 py-2 font-mono">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="fg-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-zinc-800 px-4 py-3">
            <span className="font-mono text-xs uppercase tracking-wider text-zinc-400">INTEGRATION WARNINGS</span>
            <div className="flex items-center gap-2">
              <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-600">
                {integrationWarnings.length}
              </span>
              <button
                type="button"
                onClick={() => clearIntegrationWarnings()}
                className="font-mono text-xs text-zinc-500 hover:text-zinc-300"
              >
                CLEAR
              </button>
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto rounded-b-md border-t border-zinc-800 bg-zinc-950 p-3 font-mono text-xs">
            {integrationWarnings.length === 0 ? (
              <span className="text-fg-green">✓ No warnings — all STOMP messages parsed cleanly.</span>
            ) : (
              integrationWarnings.map((w, i) => (
                <div key={i} className="leading-relaxed text-amber-400">
                  {w}
                </div>
              ))
            )}
            {integrationWarnings.length > 0 ? (
              <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-400 align-middle" />
            ) : null}
          </div>
        </section>
      </div>
    </motion.div>
  )
}
