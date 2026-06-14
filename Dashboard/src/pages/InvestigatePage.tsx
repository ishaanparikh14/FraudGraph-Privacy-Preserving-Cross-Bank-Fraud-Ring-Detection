import { motion, AnimatePresence } from 'framer-motion'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { postExplain, postRescore } from '../api/fetchExplain'
import { ingestionApiBase } from '../api/ingestionApi'
import {
  aggregateBackEdgeTxnIds,
  aggregateDetectedRingAccounts,
  buildRingDisplayGroups,
  engineRingsTouchingTxn,
  uniqueDetectionLabels,
} from '../lib/detectedRingsAggregate'
import { buildGraphFromTransactions } from '../lib/graphFromTransactions'
import { filterRingTransactions } from '../lib/filterRingTransactions'
import { getRiskLevel, RISK_BADGE } from '../lib/riskLevel'
import { useGraphRingsPoll } from '../hooks/useGraphRingsPoll'
import { useDashboardUiStore } from '../store/dashboardUiStore'
import { useStreamStore } from '../store/streamStore'
import type { ExplainResponse } from '../types/explain'
import type { IngestedTransaction } from '../types/fraudStream'

const ForceGraph2D = lazy(() => import('react-force-graph-2d'))

const SUBGRAPH_ACCENTS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#22d3ee', '#34d399'] as const

type InvestigateLocationState = { xaiResolvedFromAccount?: string; xaiResolveReason?: string }

/** Try to fetch a single transaction from Spring REST API by ID */
async function fetchTxnFromSpring(txnId: string): Promise<IngestedTransaction | null> {
  try {
    const res = await fetch(`${ingestionApiBase()}/transaction/${encodeURIComponent(txnId)}`)
    if (!res.ok) return null
    const raw = await res.json() as Record<string, unknown>
    const id = (raw.transaction_id ?? raw.txn_id ?? raw.transactionId) as string
    if (!id) return null
    return {
      txn_id:          String(id),
      source_account:  String(raw.source_account ?? raw.source ?? raw.sourceAccount ?? ''),
      target_account:  String(raw.target_account ?? raw.target ?? raw.targetAccount ?? ''),
      amount:          Number(raw.amount ?? 0),
      timestamp:       String(raw.timestamp ?? raw.received_at ?? ''),
      is_high_risk:    Boolean(raw.is_high_risk ?? raw.isHighRisk ?? raw.is_fraud_flag ?? false),
      risk_score:      raw.risk_score != null ? Number(raw.risk_score) : undefined,
    }
  } catch { return null }
}

export default function InvestigatePage() {
  const { txnId: urlTxnId } = useParams()
  const navigate             = useNavigate()
  const location             = useLocation()
  const locationState        = location.state as InvestigateLocationState | null
  const pinnedId             = useDashboardUiStore(s => s.pinnedTxnIdForXai)
  const { fraudAlerts, transactions } = useStreamStore()

  const activeTxnId = (urlTxnId ?? pinnedId ?? '').trim()
  const [inputId, setInputId]     = useState(activeTxnId)
  const [mlResult, setMlResult]   = useState<ExplainResponse | null>(null)
  const [txnData, setTxnData]     = useState<IngestedTransaction | null>(null)
  const [loading, setLoading]     = useState(false)
  const [mlError, setMlError]     = useState<string | null>(null)
  const [selectedRingKey, setSelectedRingKey] = useState<string | null>(null)

  useEffect(() => { setInputId(activeTxnId) }, [activeTxnId])

  const { rings } = useGraphRingsPoll({ enabled: true, intervalMs: 5000 })

  const ringAccountSet  = useMemo(() => aggregateDetectedRingAccounts(fraudAlerts, rings), [fraudAlerts, rings])
  const ringAccounts    = useMemo(() => [...ringAccountSet], [ringAccountSet])
  const ringTxns        = useMemo(() => filterRingTransactions(transactions, ringAccounts), [transactions, ringAccounts])
  const backEdgeTxnIds  = useMemo(() => aggregateBackEdgeTxnIds(rings), [rings])
  const detectionLabels = useMemo(() => uniqueDetectionLabels(fraudAlerts, rings), [fraudAlerts, rings])
  const detectionMethod = detectionLabels.length > 0 ? detectionLabels.join(' · ') : null
  const ringDisplayGroups = useMemo(() => buildRingDisplayGroups(fraudAlerts, rings), [fraudAlerts, rings])

  const streamRingsKey   = useMemo(() => fraudAlerts.map(a => a.alert_id).join('|'), [fraudAlerts])
  const engineRingsKey   = useMemo(() => rings.map(r => r.ring_id).join('|'), [rings])
  const displayGroupsKey = useMemo(() => ringDisplayGroups.map(g => g.key).join('|'), [ringDisplayGroups])

  const perRingSubgraphs = useMemo(() =>
    ringDisplayGroups.map((g, idx) => {
      const accts   = [...g.accountSet]
      const txns    = filterRingTransactions(transactions, accts)
      const graphData = buildGraphFromTransactions(txns, g.accountSet, g.backEdgeTxnIds, g.centrality)
      return { g, idx, txns, graphData }
    }), [ringDisplayGroups, transactions])

  const engineRingsForTxn = useMemo(() => {
    if (!txnData) return []
    return engineRingsTouchingTxn(txnData.txn_id, txnData.source_account, txnData.target_account, rings)
  }, [txnData, rings])

  const isInRing = useMemo(() => {
    if (!txnData) return false
    return ringTxns.some(t => t.txn_id === txnData.txn_id) ||
      (ringAccountSet.has(txnData.source_account) && ringAccountSet.has(txnData.target_account))
  }, [txnData, ringTxns, ringAccountSet])

  const ctxRef = useRef({ transactions, ringAccounts, ringTxns, backEdgeTxnIds })
  ctxRef.current = { transactions, ringAccounts, ringTxns, backEdgeTxnIds }

  /* ── main lookup ── */
  useEffect(() => {
    const id = (urlTxnId ?? '').trim()
    if (!id) { setTxnData(null); setMlResult(null); setMlError(null); setLoading(false); return }

    let cancelled = false
    setLoading(true)
    setTxnData(null)
    setMlResult(null)
    setMlError(null)
    useDashboardUiStore.getState().setPinnedTxnIdForXai(id)

    void (async () => {
      const { transactions: allTx } = ctxRef.current

      /* 1. Find transaction data — stream first, then Spring REST */
      let txn: IngestedTransaction | null =
        allTx.find(t => t.txn_id.toLowerCase() === id.toLowerCase()) ?? null

      if (!txn) txn = await fetchTxnFromSpring(id)

      if (!cancelled && txn) setTxnData(txn)

      /* 2. ML score — try DB first, then rescore on demand */
      try {
        let ml: import('../types/explain').ExplainResponse | null = null
        try {
          ml = await postExplain(id)
        } catch (e) {
          const msg = e instanceof Error ? e.message : ''
          if (!/404/.test(msg)) throw e   // real error — rethrow
          // 404 = not in DB yet — fall through to rescore
        }

        // Rescore if: not in DB, OR score is 0 with no SHAP (stale/unprocessed row)
        const needsRescore = !ml || (
          ml.risk_score === 0 &&
          (ml.shap_values ?? []).every(f => Math.abs(f.contribution) < 1e-9)
        )

        if (needsRescore) {
          const txnForRescore = txn ?? { txn_id: id } as import('../types/fraudStream').IngestedTransaction
          ml = await postRescore({
            txn_id:       id,
            source:       txnForRescore.source_account ?? undefined,
            target:       txnForRescore.target_account ?? undefined,
            amount:       txnForRescore.amount ?? undefined,
            timestamp:    txnForRescore.timestamp ?? undefined,
            is_high_risk: txnForRescore.is_high_risk ?? undefined,
          })
        }

        if (!cancelled && ml) setMlResult(ml)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (!cancelled) setMlError('ML scorer: ' + msg.slice(0, 120))
      }

      if (!cancelled) setLoading(false)
    })()

    return () => { cancelled = true }
  }, [urlTxnId, streamRingsKey, engineRingsKey, displayGroupsKey])

  function handleLookup() {
    if (!inputId.trim()) return
    useDashboardUiStore.getState().setPinnedTxnIdForXai(inputId.trim())
    void navigate(`/investigate/${encodeURIComponent(inputId.trim())}`, { replace: true })
  }

  /* ── derived display values ── */
  const displayScore = mlResult?.risk_score ?? (txnData?.risk_score ?? null)
  const displayHigh  = mlResult?.is_high_risk ?? txnData?.is_high_risk ?? false
  const riskLevel    = txnData
    ? getRiskLevel({ ...txnData, risk_score: displayScore ?? txnData.risk_score }, null)
    : displayScore != null
    ? (displayScore >= 0.65 ? 'high' : displayScore >= 0.30 ? 'moderate' : 'low')
    : null
  const badge = riskLevel ? RISK_BADGE[riskLevel] : null

  const hasShap = (mlResult?.shap_values ?? []).length > 0
  const hasLime = (mlResult?.lime_values ?? []).length > 0
  const notFound = !loading && !txnData && !mlResult

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-6xl">

      {/* ── top bar ── */}
      <div className="fg-card mb-4 flex flex-wrap items-center gap-3 p-3">
        <div className="live-dot h-2 w-2 shrink-0 rounded-full bg-fg-red" />
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">Detection Logic</span>
        {detectionMethod
          ? <span className="rounded border border-fg-red/30 bg-red-950/40 px-2 py-0.5 font-mono text-xs text-fg-red">{detectionMethod}</span>
          : <span className="font-mono text-xs text-zinc-600">Awaiting ring detection…</span>}
        {rings.length > 0 && (
          <span className="ml-auto truncate font-mono text-xs text-zinc-600">
            Engine rings · {rings.map(r => r.ring_id).join(', ')}
          </span>
        )}
      </div>

      <div className="grid min-h-0 h-[calc(100vh-240px)] grid-cols-1 gap-4 lg:grid-cols-[55%_45%]">

        {/* ── left: ring subgraphs ── */}
        <div className="fg-card flex min-h-0 flex-col overflow-hidden">
          <div className="shrink-0 border-b border-zinc-800 px-3 py-2.5">
            <span className="font-mono text-xs uppercase tracking-widest text-zinc-400">Detected rings · subgraphs</span>
            {ringDisplayGroups.length > 0 && (
              <span className="ml-2 font-mono text-xs text-zinc-600">
                {ringDisplayGroups.length} view{ringDisplayGroups.length > 1 ? 's' : ''} · {ringAccounts.length} nodes
              </span>
            )}
          </div>
          <div className="min-h-[280px] flex-1 overflow-y-auto">
            {ringDisplayGroups.length === 0
              ? <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-700">No rings yet — run Live Injection</div>
              : (
                <div className="flex flex-col gap-6 p-3">
                  {perRingSubgraphs.map(({ g, idx, txns, graphData }) => {
                    const accent = SUBGRAPH_ACCENTS[idx % SUBGRAPH_ACCENTS.length]!
                    const isSelected = selectedRingKey === g.key
                    return (
                      <div
                        key={g.key}
                        onClick={() => setSelectedRingKey(isSelected ? null : g.key)}
                        className={`rounded border p-2 cursor-pointer transition-all duration-200 ${
                          isSelected
                            ? 'border-red-500/60 bg-red-950/20 ring-1 ring-red-500/30'
                            : 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-600'
                        }`}
                      >
                        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 px-1">
                          <span className="font-mono text-[11px] font-medium text-zinc-300">{g.title}</span>
                          <span className="font-mono text-[10px] text-zinc-600">{g.accountSet.size} nodes · {txns.length} edges</span>
                          {isSelected && <span className="ml-auto font-mono text-[10px] text-red-400">● Selected</span>}
                        </div>
                        {txns.length > 0
                          ? <Suspense fallback={<div className="h-[220px] flex items-center justify-center text-zinc-500">Loading…</div>}>
                              <ForceGraph2D width={520} height={220} graphData={graphData} backgroundColor="#09090b"
                                nodeId="id" nodeColor={() => accent}
                                linkColor={l => (l as { isBackEdge?: boolean }).isBackEdge ? accent : `${accent}66`}
                                linkWidth={2} cooldownTicks={80} />
                            </Suspense>
                          : <div className="flex h-[80px] items-center justify-center font-mono text-[11px] text-zinc-600">No buffered edges for this ring yet</div>
                        }
                        {txns.length > 0 && (
                          <p className="mt-1 px-1 font-mono text-[10px] text-zinc-600">Click to inspect {txns.length} transaction{txns.length > 1 ? 's' : ''}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
          </div>
        </div>

        {/* ── right: transaction detail or ring transaction list ── */}
        <div className="fg-card flex flex-col overflow-auto">

          {/* header tabs */}
          <div className="shrink-0 border-b border-zinc-800 px-4 py-2 flex items-center gap-3">
            <button
              onClick={() => setSelectedRingKey(null)}
              className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded transition-colors ${
                !selectedRingKey ? 'bg-zinc-800 text-zinc-200' : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >Transaction Lookup</button>
            <button
              onClick={() => {
                const firstKey = perRingSubgraphs[0]?.g.key
                if (firstKey) setSelectedRingKey(firstKey)
              }}
              disabled={perRingSubgraphs.length === 0}
              className={`font-mono text-[10px] uppercase tracking-widest px-2 py-1 rounded transition-colors ${
                selectedRingKey ? 'bg-red-950/60 text-red-400 border border-red-800/40' : 'text-zinc-500 hover:text-zinc-300'
              } disabled:opacity-30`}
            >Ring Transactions {selectedRingKey ? '●' : ''}</button>
          </div>

          {/* ── RING TRANSACTION LIST VIEW ── */}
          {selectedRingKey && (() => {
            const selected = perRingSubgraphs.find(p => p.g.key === selectedRingKey)
            const ringTxnList = selected?.txns ?? []
            const accent = SUBGRAPH_ACCENTS[(perRingSubgraphs.findIndex(p => p.g.key === selectedRingKey)) % SUBGRAPH_ACCENTS.length]!
            return (
              <div className="flex flex-col flex-1 min-h-0">
                <div className="shrink-0 px-4 py-2.5 border-b border-zinc-800 flex items-center gap-3">
                  <span className="size-2 rounded-full animate-pulse" style={{ backgroundColor: accent }} />
                  <span className="font-mono text-xs text-zinc-300">{selected?.g.title}</span>
                  <span className="ml-auto font-mono text-[10px] text-zinc-500">{ringTxnList.length} transactions</span>
                </div>
                {ringTxnList.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-600">
                    No transactions buffered for this ring yet
                  </div>
                ) : (
                  <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/60">
                    {ringTxnList.map((t, i) => {
                      const score = t.risk_score
                      const scoreColor = score == null ? 'text-zinc-500'
                        : score >= 0.65 ? 'text-red-400'
                        : score >= 0.30 ? 'text-amber-400'
                        : 'text-emerald-400'
                      return (
                        <motion.div
                          key={t.txn_id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03 }}
                          className="px-4 py-3 hover:bg-zinc-900/60 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <span className="font-mono text-[10px] text-zinc-500 break-all">{t.txn_id}</span>
                            {t.is_high_risk && (
                              <span className="shrink-0 rounded border border-red-800/50 bg-red-950/30 px-1.5 py-0.5 font-mono text-[9px] text-red-400 uppercase">HIGH RISK</span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <div>
                              <span className="font-mono text-[9px] text-zinc-600">FROM </span>
                              <span className="font-mono text-[10px] text-zinc-300">{t.source_account?.slice(0, 14)}…</span>
                            </div>
                            <div>
                              <span className="font-mono text-[9px] text-zinc-600">TO </span>
                              <span className="font-mono text-[10px] text-zinc-300">{t.target_account?.slice(0, 14)}…</span>
                            </div>
                            <div>
                              <span className="font-mono text-[9px] text-zinc-600">AMOUNT </span>
                              <span className="font-mono text-[10px] text-zinc-200 font-semibold">
                                ${t.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div>
                              <span className="font-mono text-[9px] text-zinc-600">SCORE </span>
                              <span className={`font-mono text-[10px] font-semibold ${scoreColor}`}>
                                {score != null ? `${Math.round(score * 100)}%` : '—'}
                              </span>
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-between">
                            <span className="font-mono text-[9px] text-zinc-600">
                              {t.timestamp ? new Date(t.timestamp).toLocaleTimeString() : ''}
                            </span>
                            <motion.button
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                setSelectedRingKey(null)
                                setInputId(t.txn_id)
                                useDashboardUiStore.getState().setPinnedTxnIdForXai(t.txn_id)
                                void navigate(`/investigate/${encodeURIComponent(t.txn_id)}`, { replace: true })
                              }}
                              className="rounded border border-fg-red/40 bg-fg-red/10 px-2 py-0.5 font-mono text-[10px] text-fg-red hover:bg-fg-red hover:text-white transition-all"
                            >
                              Inspect →
                            </motion.button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })()}

          {/* ── SINGLE TRANSACTION LOOKUP VIEW ── */}
          {!selectedRingKey && (
          <>
          {/* search bar */}
          <div className="shrink-0 border-b border-zinc-800 p-4">
            <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Transaction lookup</p>
            <div className="flex gap-2">
              <input
                value={inputId}
                onChange={e => setInputId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
                placeholder="Paste transaction UUID…"
                className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 font-mono text-xs text-zinc-100 focus:border-zinc-500 focus:outline-none"
              />
              <motion.button whileTap={{ scale: 0.96 }} onClick={handleLookup}
                disabled={!inputId.trim() || loading}
                className="rounded border border-fg-red bg-fg-red/10 px-3 py-1.5 font-mono text-xs text-fg-red transition-all hover:bg-fg-red hover:text-white disabled:opacity-40">
                {loading ? '…' : 'LOOKUP'}
              </motion.button>
            </div>
          </div>

          {/* spinner */}
          {loading && (
            <div className="flex items-center justify-center py-10">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="h-6 w-6 rounded-full border-2 border-fg-red border-t-transparent" />
            </div>
          )}

          {/* not found */}
          {notFound && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-zinc-600">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3"/>
                <path d="M16 10v7M16 21v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <p className="font-mono text-xs">Transaction not found in stream or API</p>
              <p className="font-mono text-[10px] text-zinc-700">Make sure the UUID is from the Live Transactions ticker</p>
            </div>
          )}

          {/* main result */}
          <AnimatePresence>
            {(txnData || mlResult) && !loading && (
              <motion.div key="result" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col gap-0 divide-y divide-zinc-800">

                {/* ── resolved-from banner ── */}
                {locationState?.xaiResolvedFromAccount && (
                  <div className="px-4 py-2 font-mono text-[10px] text-cyan-400/80 bg-cyan-950/20">
                    Resolved from account <span className="text-cyan-300">{locationState.xaiResolvedFromAccount.slice(0,16)}…</span>
                    {locationState.xaiResolveReason && <span className="ml-1 text-zinc-600">— {locationState.xaiResolveReason}</span>}
                  </div>
                )}

                {/* ── risk score hero ── */}
                <div className="px-4 py-5 text-center">
                  {displayScore != null ? (
                    <>
                      <div className={`text-6xl font-bold tabular-nums ${
                        displayScore > 0.65 ? 'text-red-400' : displayScore > 0.30 ? 'text-amber-400' : 'text-emerald-400'
                      }`}>
                        {Math.round(displayScore * 100)}%
                      </div>
                      <div className="mt-1 font-mono text-xs uppercase tracking-widest text-zinc-500">ML Risk Score</div>
                      {badge && (
                        <span className={`mt-2 inline-flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-xs font-semibold ${badge.border} ${badge.bg} ${badge.text}`}>
                          <span className={`size-1.5 rounded-full ${badge.dot}`} />
                          {badge.label}
                        </span>
                      )}
                      <div className="mt-2 font-mono text-[10px] text-zinc-600">
                        {mlResult?.forced_high
                          ? '⚠ Flagged HIGH RISK by ingest (ML score is independent)'
                          : displayHigh
                          ? '⚠ Kafka ML flag: HIGH_RISK'
                          : 'ML flag: below threshold'}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1">
                      <div className="text-4xl font-bold text-zinc-600">—</div>
                      <div className="font-mono text-xs text-zinc-600">ML scorer hasn't processed this txn yet</div>
                      <div className="font-mono text-[10px] text-zinc-700">Score will appear once the Kafka scorer writes to DB</div>
                    </div>
                  )}
                </div>

                {/* ── ring membership ── */}
                <div className="px-4 py-3">
                  {isInRing ? (
                    <div className="rounded-lg border border-red-800/50 bg-red-950/20 px-3 py-2.5">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="font-mono text-xs font-semibold text-red-400 uppercase tracking-wide">Part of Fraud Ring</span>
                      </div>
                      <p className="font-mono text-[11px] text-zinc-400">
                        Detected via <span className="text-zinc-200">{detectionMethod ?? 'Tarjan SCC'}</span>
                        {engineRingsForTxn.length > 0 && (
                          <span className="text-zinc-500"> · {engineRingsForTxn.map(r => r.ring_id).join(', ')}</span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      <span className="font-mono text-xs text-zinc-400">Not part of any detected fraud ring</span>
                    </div>
                  )}
                </div>

                {/* ── transaction metadata ── */}
                <div className="px-4 py-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Transaction Details</p>
                  <div className="space-y-1.5">
                    {[
                      ['TXN ID',    txnData?.txn_id  ?? mlResult?.txn_id],
                      ['FROM',      txnData?.source_account],
                      ['TO',        txnData?.target_account],
                      ['AMOUNT',    txnData?.amount != null ? `$${txnData.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : (mlResult?.amount != null ? `$${mlResult.amount.toLocaleString()}` : undefined)],
                      ['TIMESTAMP', txnData?.timestamp ? new Date(txnData.timestamp).toLocaleString() : mlResult?.timestamp],
                      ['RISK SCORE', displayScore != null ? `${Math.round(displayScore * 100)}%` : undefined],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-start justify-between gap-2">
                        <span className="shrink-0 font-mono text-[10px] text-zinc-600">{label}</span>
                        {value
                          ? <span className="break-all text-right font-mono text-[11px] text-zinc-300">{String(value)}</span>
                          : <span className="font-mono text-[10px] text-zinc-700">—</span>
                        }
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── SHAP feature importance ── */}
                <div className="px-4 py-3">
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Feature Importance (SHAP)</p>
                  {hasShap ? (
                    <div className="space-y-2">
                      {(mlResult!.shap_values).map(f => {
                        const maxVal = Math.max(...mlResult!.shap_values.map(x => Math.abs(x.contribution)), 0.001)
                        const pct = (Math.abs(f.contribution) / maxVal) * 100
                        const isNeutral = Math.abs(f.contribution) < 1e-9
                        return (
                          <div key={f.feature}>
                            <div className="mb-0.5 flex items-center justify-between">
                              <span className="font-mono text-[10px] text-zinc-400">{f.feature}</span>
                              <span className={`font-mono text-[10px] font-semibold ${
                                isNeutral ? 'text-zinc-600' : f.contribution >= 0 ? 'text-red-400' : 'text-emerald-400'
                              }`}>
                                {isNeutral ? '0.000' : `${f.contribution >= 0 ? '+' : ''}${f.contribution.toFixed(3)}`}
                              </span>
                            </div>
                            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${isNeutral ? 2 : pct}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                                className="h-full rounded-full"
                                style={{ backgroundColor: isNeutral ? '#3f3f46' : f.contribution >= 0 ? '#ef4444' : '#22c55e' }}
                              />
                            </div>
                          </div>
                        )
                      })}
                      {mlResult!.shap_values.every(f => Math.abs(f.contribution) < 1e-9) && (
                        <p className="mt-1 font-mono text-[10px] text-zinc-600">
                          All features near-zero — model sees this as genuinely low risk with no dominant driver.
                        </p>
                      )}
                    </div>
                  ) : mlResult ? (
                    <p className="rounded border border-zinc-800 bg-zinc-900/40 px-3 py-2 font-mono text-[10px] text-zinc-600">
                      SHAP not yet available. The scorer will write it shortly.
                    </p>
                  ) : (
                    <p className="font-mono text-[10px] text-zinc-700">Waiting for ML scorer to process this transaction…</p>
                  )}
                </div>

                {/* ── raw ML features ── */}
                {mlResult?.raw_features && Object.keys(mlResult.raw_features).length > 0 && (
                  <div className="px-4 py-3">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">ML Input Features</p>
                    <div className="space-y-1">
                      {Object.entries(mlResult.raw_features).map(([k, v]) => (
                        <div key={k} className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-zinc-500">{k}</span>
                          <span className="font-mono text-[10px] text-zinc-300">{typeof v === 'number' ? v.toFixed(4) : String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* ── LIME ── */}
                {hasLime && (
                  <div className="px-4 py-3">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">LIME Explanation</p>
                    <div className="space-y-1">
                      {mlResult!.lime_values.slice(0, 6).map(l => (
                        <div key={l.feature} className="flex items-center justify-between">
                          <span className="font-mono text-[10px] text-zinc-500">{l.feature}</span>
                          <span className={`font-mono text-[10px] ${l.weight >= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                            {l.weight >= 0 ? '+' : ''}{l.weight.toFixed(4)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── ML error (non-404) ── */}
                {mlError && (
                  <div className="px-4 py-2">
                    <p className="font-mono text-[10px] text-amber-600">{mlError}</p>
                  </div>
                )}

              </motion.div>
            )}
          </AnimatePresence>

          {/* empty initial state */}
          {!loading && !txnData && !mlResult && !notFound && (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-zinc-700">
              <span className="font-mono text-xs">Enter a transaction UUID above</span>
              {perRingSubgraphs.length > 0 && (
                <button
                  onClick={() => setSelectedRingKey(perRingSubgraphs[0]!.g.key)}
                  className="mt-2 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-400 hover:text-zinc-200 hover:border-zinc-500 transition-all"
                >
                  ← View ring transactions
                </button>
              )}
            </div>
          )}
          </>
          )}
        </div>
      </div>
    </motion.div>
  )
}
