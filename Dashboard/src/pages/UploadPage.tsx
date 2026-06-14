import { AnimatePresence, motion } from 'framer-motion'
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchUploadResult,
  fetchUploadResults,
  postUploadAnalyze,
  type NeedsMappingResult,
  type UploadResult,
  type UploadSummary,
  type UploadTransaction,
} from '../api/uploadAnalyze'

const ForceGraph2D = lazy(() => import('react-force-graph-2d'))

const RING_COLORS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#22d3ee', '#34d399']

// ── small helpers ──────────────────────────────────────────────────────────

function RiskBadge({ score, inRing }: { score: number; inRing: boolean }) {
  if (inRing || score >= 0.65)
    return <span className="rounded bg-red-900/60 px-1.5 py-0.5 font-mono text-[10px] text-red-300">HIGH</span>
  if (score >= 0.30)
    return <span className="rounded bg-amber-900/60 px-1.5 py-0.5 font-mono text-[10px] text-amber-300">MOD</span>
  return <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">LOW</span>
}

function ShapBar({ shap }: { shap: Record<string, number> }) {
  const entries = Object.entries(shap)
  if (!entries.length) return <span className="font-mono text-[10px] text-zinc-600">—</span>
  const maxAbs = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.001)
  return (
    <div className="space-y-0.5 w-full">
      {entries.map(([k, v]) => {
        const pct = (Math.abs(v) / maxAbs) * 100
        const neutral = Math.abs(v) < 1e-9
        return (
          <div key={k} className="flex items-center gap-1">
            <span className="w-36 shrink-0 font-mono text-[9px] text-zinc-500 truncate">{k}</span>
            <div className="h-1 w-20 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${neutral ? 2 : pct}%`,
                  backgroundColor: neutral ? '#3f3f46' : v >= 0 ? '#ef4444' : '#22c55e',
                }}
              />
            </div>
            <span className={`font-mono text-[9px] ${neutral ? 'text-zinc-600' : v >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
              {neutral ? '0.000' : `${v >= 0 ? '+' : ''}${v.toFixed(3)}`}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── column mapper ──────────────────────────────────────────────────────────

function ColumnMapper({
  columns,
  sampleRows,
  autoDetected,
  onConfirm,
}: {
  columns: string[]
  sampleRows: Record<string, string>[]
  autoDetected: Record<string, string | null>
  onConfirm: (map: Record<string, string>) => void
}) {
  const [map, setMap] = useState<Record<string, string>>({
    col_sender:    autoDetected.sender    || '',
    col_receiver:  autoDetected.receiver  || '',
    col_amount:    autoDetected.amount    || '',
    col_timestamp: autoDetected.timestamp || '',
    col_txn_id:    autoDetected.txn_id    || '',
  })

  const fields: { key: string; label: string; required: boolean }[] = [
    { key: 'col_sender',    label: 'Sender / From Account',   required: true },
    { key: 'col_receiver',  label: 'Receiver / To Account',   required: true },
    { key: 'col_amount',    label: 'Amount',                  required: false },
    { key: 'col_timestamp', label: 'Date / Timestamp',        required: false },
    { key: 'col_txn_id',    label: 'Transaction ID',          required: false },
  ]

  return (
    <div className="space-y-4">
      <p className="font-mono text-xs text-amber-400">
        ⚠ Could not auto-detect columns. Map them manually:
      </p>

      <div className="grid grid-cols-2 gap-3">
        {fields.map(f => (
          <div key={f.key}>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {f.label} {f.required && <span className="text-red-500">*</span>}
            </label>
            <select
              value={map[f.key] || ''}
              onChange={e => setMap(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 font-mono text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
            >
              <option value="">— not mapped —</option>
              {columns.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        ))}
      </div>

      {/* sample preview */}
      {sampleRows.length > 0 && (
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full font-mono text-[10px]">
            <thead>
              <tr className="border-b border-zinc-800">
                {columns.map(c => (
                  <th key={c} className="px-2 py-1 text-left text-zinc-500">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sampleRows.map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  {columns.map(c => (
                    <td key={c} className="px-2 py-1 text-zinc-400 truncate max-w-[120px]">{String(row[c] ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <button
        onClick={() => onConfirm(map)}
        disabled={!map.col_sender || !map.col_receiver}
        className="rounded border border-fg-red bg-fg-red/10 px-4 py-1.5 font-mono text-xs text-fg-red transition-all hover:bg-fg-red hover:text-white disabled:opacity-40"
      >
        Analyze with this mapping
      </button>
    </div>
  )
}

// ── ring graph ─────────────────────────────────────────────────────────────

function RingGraph({ result }: { result: UploadResult }) {
  const allRingAccounts = new Set(result.rings.flatMap(r => r.accounts))
  const accountColor = new Map<string, string>()
  result.rings.forEach((r, i) => {
    r.accounts.forEach(a => accountColor.set(a, RING_COLORS[i % RING_COLORS.length]!))
  })

  const nodeSet = new Set<string>()
  const links: { source: string; target: string; inRing: boolean; amount: number }[] = []

  for (const t of result.transactions) {
    nodeSet.add(t.sender)
    nodeSet.add(t.receiver)
    links.push({
      source: t.sender,
      target: t.receiver,
      inRing: t.in_ring,
      amount: t.amount,
    })
  }

  const nodes = [...nodeSet].map(id => ({
    id,
    inRing: allRingAccounts.has(id),
    color: accountColor.get(id) ?? '#3f3f46',
  }))

  const graphData = { nodes, links }

  return (
    <Suspense fallback={<div className="flex h-[400px] items-center justify-center text-zinc-500 font-mono text-xs">Loading graph…</div>}>
      <ForceGraph2D
        graphData={graphData}
        width={700}
        height={400}
        backgroundColor="#09090b"
        nodeId="id"
        nodeColor={n => (n as typeof nodes[0]).color}
        nodeRelSize={5}
        linkColor={l => (l as typeof links[0]).inRing ? '#ef4444' : 'rgba(63,63,70,0.4)'}
        linkWidth={l => (l as typeof links[0]).inRing ? 2 : 0.8}
        linkDirectionalArrowLength={4}
        linkDirectionalArrowRelPos={1}
        cooldownTicks={120}
        nodeLabel={(n) => (n as typeof nodes[0]).id.slice(0, 16) + '…'}
      />
    </Suspense>
  )
}

// ── main page ──────────────────────────────────────────────────────────────

export default function UploadPage() {
  const navigate = useNavigate()
  const dropRef  = useRef<HTMLDivElement>(null)

  const [dragOver,  setDragOver]  = useState(false)
  const [file,      setFile]      = useState<File | null>(null)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState<string | null>(null)
  const [needsMap,  setNeedsMap]  = useState<NeedsMappingResult | null>(null)
  const [result,    setResult]    = useState<UploadResult | null>(null)
  const [history,   setHistory]   = useState<UploadSummary[]>([])
  const [activeTab, setActiveTab] = useState<'rings' | 'txns' | 'graph'>('rings')
  const [txnFilter, setTxnFilter] = useState<'all' | 'flagged' | 'ring'>('all')

  useEffect(() => {
    fetchUploadResults().then(setHistory).catch(() => {})
  }, [])

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return
    const f = files[0]!
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (!['csv', 'xlsx', 'xls', 'pdf'].includes(ext ?? '')) {
      setError('Unsupported file. Use CSV, Excel (.xlsx/.xls), or PDF.')
      return
    }
    setFile(f)
    setError(null)
    setResult(null)
    setNeedsMap(null)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }, [handleFiles])

  async function runAnalysis(colMap?: Record<string, string>) {
    if (!file) return
    setLoading(true)
    setError(null)
    setNeedsMap(null)
    try {
      const res = await postUploadAnalyze(file, colMap as Parameters<typeof postUploadAnalyze>[1])
      if ('status' in res && res.status === 'needs_mapping') {
        setNeedsMap(res as NeedsMappingResult)
      } else {
        setResult(res as UploadResult)
        fetchUploadResults().then(setHistory).catch(() => {})
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  async function loadHistory(uploadId: string) {
    setLoading(true)
    setError(null)
    try {
      const r = await fetchUploadResult(uploadId)
      setResult(r)
      setNeedsMap(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }

  const filteredTxns: UploadTransaction[] = result
    ? result.transactions.filter(t => {
        if (txnFilter === 'flagged') return t.is_high_risk
        if (txnFilter === 'ring')    return t.in_ring
        return true
      })
    : []

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl space-y-4">

      {/* header */}
      <div className="fg-card flex items-center gap-3 p-3">
        <div className="live-dot h-2 w-2 rounded-full bg-fg-red" />
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">
          Upload & Analyze
        </span>
        <span className="ml-auto font-mono text-xs text-zinc-600">
          CSV · Excel · PDF · Tarjan SCC · ML Scoring
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[380px_1fr]">

        {/* ── left panel: upload + history ── */}
        <div className="flex flex-col gap-4">

          {/* drop zone */}
          <div className="fg-card p-4">
            <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Upload Bank Statement</p>
            <div
              ref={dropRef}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 transition-all ${
                dragOver ? 'border-fg-red bg-red-950/20' : 'border-zinc-700 hover:border-zinc-500'
              }`}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-zinc-600">
                <path d="M16 4v16M10 10l6-6 6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M6 22v2a2 2 0 002 2h16a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="font-mono text-xs text-zinc-500">
                {file ? file.name : 'Drop file here or click to browse'}
              </span>
              <span className="font-mono text-[10px] text-zinc-700">CSV · XLSX · XLS · PDF</span>
              <input
                id="file-input"
                type="file"
                accept=".csv,.xlsx,.xls,.pdf"
                className="hidden"
                onChange={e => handleFiles(e.target.files)}
              />
            </div>

            {file && !needsMap && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => runAnalysis()}
                disabled={loading}
                className="mt-3 w-full rounded border border-fg-red bg-fg-red/10 py-2 font-mono text-xs text-fg-red transition-all hover:bg-fg-red hover:text-white disabled:opacity-40"
              >
                {loading ? 'Analyzing…' : 'Analyze File'}
              </motion.button>
            )}

            {error && (
              <p className="mt-2 font-mono text-[10px] text-red-400">{error}</p>
            )}
          </div>

          {/* column mapper */}
          {needsMap && (
            <div className="fg-card p-4">
              <ColumnMapper
                columns={needsMap.columns}
                sampleRows={needsMap.sample_rows}
                autoDetected={needsMap.auto_detected}
                onConfirm={map => runAnalysis(map)}
              />
            </div>
          )}

          {/* history */}
          {history.length > 0 && (
            <div className="fg-card p-4">
              <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Past Analyses</p>
              <div className="space-y-2">
                {history.map(h => (
                  <button
                    key={h.upload_id}
                    onClick={() => loadHistory(h.upload_id)}
                    className={`w-full rounded border px-3 py-2 text-left transition-all hover:border-zinc-600 ${
                      result?.upload_id === h.upload_id ? 'border-fg-red/50 bg-red-950/20' : 'border-zinc-800 bg-zinc-900/40'
                    }`}
                  >
                    <p className="font-mono text-[11px] text-zinc-300 truncate">{h.filename}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                      {h.total_txns} txns · {h.ring_count} rings · {Math.round((h.avg_risk_score ?? 0) * 100)}% avg risk
                    </p>
                    <p className="font-mono text-[9px] text-zinc-700">{new Date(h.created_at).toLocaleString()}</p>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── right panel: results ── */}
        <div className="fg-card flex flex-col overflow-hidden">
          {loading && (
            <div className="flex flex-1 items-center justify-center gap-3 py-20">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="h-6 w-6 rounded-full border-2 border-fg-red border-t-transparent" />
              <span className="font-mono text-xs text-zinc-500">Running Tarjan SCC + ML scoring…</span>
            </div>
          )}

          {!loading && !result && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-20 text-zinc-700">
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3"/>
                <circle cx="20" cy="20" r="3" fill="currentColor"/>
              </svg>
              <span className="font-mono text-xs">Upload a file to analyze</span>
            </div>
          )}

          <AnimatePresence>
            {result && !loading && (
              <motion.div key={result.upload_id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col h-full">

                {/* summary bar */}
                <div className="shrink-0 grid grid-cols-4 divide-x divide-zinc-800 border-b border-zinc-800">
                  {[
                    ['Total Txns',    result.total_txns],
                    ['Flagged',       result.flagged_txns],
                    ['Rings Found',   result.ring_count],
                    ['Avg ML Score',  `${Math.round(result.avg_risk_score * 100)}%`],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="px-4 py-3 text-center">
                      <div className={`text-xl font-bold tabular-nums ${
                        label === 'Rings Found' && Number(value) > 0 ? 'text-red-400' :
                        label === 'Flagged'     && Number(value) > 0 ? 'text-amber-400' : 'text-zinc-100'
                      }`}>{value}</div>
                      <div className="font-mono text-[10px] text-zinc-600">{label}</div>
                    </div>
                  ))}
                </div>

                {/* tabs */}
                <div className="shrink-0 flex border-b border-zinc-800">
                  {(['rings', 'txns', 'graph'] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`px-4 py-2 font-mono text-xs transition-colors ${
                        activeTab === tab ? 'border-b-2 border-fg-red text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
                      }`}>
                      {tab === 'rings' ? `Rings (${result.ring_count})` : tab === 'txns' ? `Transactions (${result.total_txns})` : 'Graph'}
                    </button>
                  ))}
                </div>

                {/* tab content */}
                <div className="flex-1 overflow-y-auto p-4">

                  {/* rings tab */}
                  {activeTab === 'rings' && (
                    <div className="space-y-3">
                      {result.ring_count === 0 ? (
                        <div className="rounded border border-emerald-900/50 bg-emerald-950/20 px-4 py-6 text-center">
                          <p className="font-mono text-sm text-emerald-400">✓ No fraud rings detected</p>
                          <p className="mt-1 font-mono text-[10px] text-zinc-600">No circular transaction flows found in this dataset</p>
                        </div>
                      ) : (
                        result.rings.map((ring, i) => (
                          <div key={ring.ring_id} className="rounded border border-red-900/50 bg-red-950/10 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <span className="size-2 rounded-full animate-pulse" style={{ backgroundColor: RING_COLORS[i % RING_COLORS.length] }} />
                              <span className="font-mono text-xs font-semibold text-red-400">{ring.ring_id}</span>
                              <span className="ml-auto font-mono text-[10px] text-zinc-500">
                                {ring.accounts.length} accounts · {ring.txn_count} txns · {result.currency_symbol || '$'}{ring.total_amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <p className="mb-1 font-mono text-[10px] text-zinc-500">Accounts in ring:</p>
                            <div className="flex flex-wrap gap-1">
                              {ring.accounts.map(a => (
                                <span key={a} className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 truncate max-w-[180px]" title={a}>
                                  {a.slice(0, 16)}…
                                </span>
                              ))}
                            </div>
                            <p className="mt-2 mb-1 font-mono text-[10px] text-zinc-500">Transactions:</p>
                            <div className="flex flex-wrap gap-1">
                              {ring.txn_ids.slice(0, 8).map(id => (
                                <button
                                  key={id}
                                  onClick={() => { navigate(`/investigate/${encodeURIComponent(id)}`) }}
                                  className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[9px] text-zinc-400 hover:text-fg-red transition-colors truncate max-w-[180px]"
                                  title={id}
                                >
                                  {id.slice(0, 16)}…
                                </button>
                              ))}
                              {ring.txn_ids.length > 8 && (
                                <span className="font-mono text-[9px] text-zinc-600">+{ring.txn_ids.length - 8} more</span>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}

                  {/* transactions tab */}
                  {activeTab === 'txns' && (
                    <div>
                      <div className="mb-3 flex gap-2">
                        {(['all', 'flagged', 'ring'] as const).map(f => (
                          <button key={f} onClick={() => setTxnFilter(f)}
                            className={`rounded border px-2 py-1 font-mono text-[10px] transition-colors ${
                              txnFilter === f ? 'border-fg-red/50 bg-red-950/20 text-red-400' : 'border-zinc-700 text-zinc-500 hover:text-zinc-300'
                            }`}>
                            {f === 'all' ? `All (${result.total_txns})` : f === 'flagged' ? `Flagged (${result.flagged_txns})` : `In Ring (${result.transactions.filter(t => t.in_ring).length})`}
                          </button>
                        ))}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full font-mono text-[10px]">
                          <thead>
                            <tr className="border-b border-zinc-800 text-zinc-500">
                              <th className="pb-2 text-left">TXN ID</th>
                              <th className="pb-2 text-left">FROM</th>
                              <th className="pb-2 text-left">TO</th>
                              <th className="pb-2 text-right">AMOUNT</th>
                              <th className="pb-2 text-center">RISK</th>
                              <th className="pb-2 text-left">SHAP</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredTxns.slice(0, 200).map(t => (
                              <tr key={t.txn_id} className={`border-b border-zinc-800/50 ${t.in_ring ? 'bg-red-950/10' : ''}`}>
                                <td className="py-1.5 pr-2">
                                  <button
                                    onClick={() => navigate(`/investigate/${encodeURIComponent(t.txn_id)}`)}
                                    className="truncate max-w-[100px] text-zinc-400 hover:text-fg-red transition-colors"
                                    title={t.txn_id}
                                  >
                                    {t.txn_id.slice(0, 12)}…
                                  </button>
                                </td>
                                <td className="py-1.5 pr-2 text-zinc-500 truncate max-w-[80px]" title={t.sender}>{t.sender.slice(0, 10)}…</td>
                                <td className="py-1.5 pr-2 text-zinc-500 truncate max-w-[80px]" title={t.receiver}>{t.receiver.slice(0, 10)}…</td>
                                <td className="py-1.5 pr-2 text-right text-zinc-300">{result.currency_symbol || '$'}{t.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                                <td className="py-1.5 pr-2 text-center">
                                  <RiskBadge score={t.risk_score} inRing={t.in_ring} />
                                </td>
                                <td className="py-1.5">
                                  <ShapBar shap={t.shap} />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {filteredTxns.length > 200 && (
                          <p className="mt-2 font-mono text-[10px] text-zinc-600">Showing 200 of {filteredTxns.length}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* graph tab */}
                  {activeTab === 'graph' && (
                    <div>
                      <p className="mb-2 font-mono text-[10px] text-zinc-600">
                        Red nodes/edges = fraud ring accounts. Each ring color-coded.
                        {result.transactions.length > 300 && ' (Showing first 300 transactions for performance)'}
                      </p>
                      <div className="overflow-hidden rounded border border-zinc-800">
                        <RingGraph result={{
                          ...result,
                          transactions: result.transactions.slice(0, 300),
                        }} />
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
