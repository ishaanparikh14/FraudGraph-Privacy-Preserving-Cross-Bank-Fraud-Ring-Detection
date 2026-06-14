/**
 * InjectDrawer — slide-in panel for manual fraud-ring injection.
 *
 * Features:
 *  - Quick-preset buttons (Mini Ring, Standard, Large Network)
 *  - Visual node/ring sliders with live diagram preview
 *  - Animated inject button with progress shimmer
 *  - Per-inject history log with timestamps
 *  - Framer-motion slide-in from right
 */

import { AnimatePresence, motion } from 'framer-motion'
import { useCallback, useState } from 'react'
import { injectManual } from '../../api/manualIngest'
import { useStreamStore } from '../../store/streamStore'

/* ─── types ──────────────────────────────────────────────────── */

interface HistoryEntry {
  id: number
  time: string
  totalNodes: number
  ringNodes: number
  status: 'ok' | 'err'
  msg: string
}

interface Preset {
  label: string
  desc: string
  total: number
  ring: number
  color: string
  moderate?: boolean  // preset is a moderate-only scenario
}

/* ─── presets ────────────────────────────────────────────────── */

const PRESETS: Preset[] = [
  { label: 'Low Noise',  desc: 'Clean traffic only',      total: 20, ring: 0, color: '#22c55e' },
  { label: 'Moderate',   desc: '~40% moderate risk',      total: 20, ring: 0, color: '#f59e0b', moderate: true },
  { label: 'High Risk',  desc: '5 ring / 15 total',       total: 15, ring: 5, color: '#ef4444' },
  { label: 'Max Threat', desc: '8 ring / 30 total',       total: 30, ring: 8, color: '#dc2626' },
]

/* ─── mini node diagram ───────────────────────────────────────── */

/**
 * Shows nodes in 3 tiers:
 *  - First `ring` nodes → red (high risk / fraud ring)
 *  - Next ~40% of remaining → amber (moderate)
 *  - Rest → gray (low risk)
 */
function NodeDiagram({ total, ring }: { total: number; ring: number }) {
  const n = Math.min(total, 18)
  const r = Math.min(ring, n)
  const modCount = Math.round((n - r) * 0.4)
  const cx = 60, cy = 60, radius = 46

  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    const tier = i < r ? 'high' : i < r + modCount ? 'moderate' : 'low'
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), tier }
  })

  const links = Array.from({ length: n }, (_, i) => ({
    x1: nodes[i]!.x, y1: nodes[i]!.y,
    x2: nodes[(i + 1) % n]!.x, y2: nodes[(i + 1) % n]!.y,
    high: i < r && r >= 2,
  }))

  const nodeColor = (tier: string) =>
    tier === 'high' ? '#ef4444' : tier === 'moderate' ? '#f59e0b' : '#3f3f46'
  const nodeGlow = (tier: string) =>
    tier === 'high' ? 'rgba(239,68,68,0.25)' : tier === 'moderate' ? 'rgba(245,158,11,0.2)' : 'none'

  return (
    <svg width={120} height={120} viewBox="0 0 120 120" className="shrink-0">
      <circle cx={cx} cy={cy} r={radius + 4} fill="none" stroke="#27272a" strokeWidth="0.5" />
      {links.map((l, i) => (
        <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke={l.high ? 'rgba(239,68,68,0.55)' : 'rgba(63,63,70,0.4)'}
          strokeWidth={l.high ? 1.5 : 0.7}
        />
      ))}
      {nodes.map((nd, i) => (
        <g key={i}>
          {nd.tier !== 'low' && (
            <circle cx={nd.x} cy={nd.y} r={5.5} fill={nodeGlow(nd.tier)} stroke="none" />
          )}
          <circle cx={nd.x} cy={nd.y} r={3}
            fill={nodeColor(nd.tier)}
            stroke={nodeColor(nd.tier)}
            strokeWidth="0.4"
          />
        </g>
      ))}
      {/* legend */}
      <circle cx={14} cy={108} r={3} fill="#ef4444" />
      <text x={20} y={111} fill="#71717a" fontSize="7" fontFamily="monospace">hi</text>
      <circle cx={36} cy={108} r={3} fill="#f59e0b" />
      <text x={42} y={111} fill="#71717a" fontSize="7" fontFamily="monospace">mod</text>
      <circle cx={66} cy={108} r={3} fill="#3f3f46" />
      <text x={72} y={111} fill="#71717a" fontSize="7" fontFamily="monospace">low</text>
    </svg>
  )
}

/* ─── component ──────────────────────────────────────────────── */

type Props = {
  open: boolean
  onClose: () => void
}

let _histId = 0

export function InjectDrawer({ open, onClose }: Props) {
  const [total, setTotal] = useState(15)
  const [ring, setRing]   = useState(5)
  const [injecting, setInjecting] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])

  const safeTotal = Math.max(2, Math.min(200, total))
  const safeRing  = Math.max(0, Math.min(safeTotal, ring))

  const applyPreset = (p: Preset) => {
    setTotal(p.total)
    setRing(p.ring)
  }

  const inject = useCallback(async () => {
    if (injecting) return
    setInjecting(true)
    const t = safeTotal, r = safeRing
    try {
      await injectManual(t, r)
      const entry: HistoryEntry = {
        id: ++_histId,
        time: new Date().toLocaleTimeString(),
        totalNodes: t,
        ringNodes: r,
        status: 'ok',
        msg: r >= 2
          ? `✓ ${t} nodes · ${r}-node ring · alert sent`
          : r === 1
          ? `✓ ${t} nodes · 1 high-risk edge`
          : `✓ ${t} nodes · no ring`,
      }
      setHistory(h => [entry, ...h].slice(0, 20))
    } catch (e) {
      const entry: HistoryEntry = {
        id: ++_histId,
        time: new Date().toLocaleTimeString(),
        totalNodes: t,
        ringNodes: r,
        status: 'err',
        msg: e instanceof Error ? e.message : 'Inject failed',
      }
      setHistory(h => [entry, ...h].slice(0, 20))
    } finally {
      setInjecting(false)
    }
  }, [injecting, safeTotal, safeRing])

  const ringPct = safeTotal > 0 ? (safeRing / safeTotal) * 100 : 0

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm"
          />

          {/* drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%', opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0 }}
            transition={{ type: 'spring', stiffness: 340, damping: 34 }}
            className="fixed right-0 top-0 z-40 flex h-full w-[360px] flex-col border-l border-zinc-800 bg-zinc-950 shadow-2xl"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
              <div>
                <h2 className="font-mono text-sm font-semibold text-zinc-100 tracking-wide">
                  Manual Injection
                </h2>
                <p className="mt-0.5 font-mono text-xs text-zinc-500">
                  Craft and fire a synthetic fraud scenario
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

              {/* presets */}
              <section>
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Quick presets</p>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="group flex flex-col gap-0.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2.5 text-left transition-all hover:border-zinc-600 hover:bg-zinc-800"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: p.color }} />
                        <span className="font-mono text-xs font-semibold text-zinc-200">{p.label}</span>
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">{p.desc}</span>
                    </button>
                  ))}
                </div>
              </section>

              {/* divider */}
              <div className="border-t border-zinc-800" />

              {/* sliders + diagram */}
              <section className="flex items-start gap-4">
                <div className="flex-1 space-y-4">
                  {/* total nodes */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="font-mono text-xs text-zinc-400">Total nodes</label>
                      <span className="font-mono text-xs font-semibold text-zinc-100">{safeTotal}</span>
                    </div>
                    <input
                      type="range" min={2} max={80} value={safeTotal}
                      onChange={e => { const v = +e.target.value; setTotal(v); setRing(r => Math.min(r, v)) }}
                      className="slider-track w-full"
                    />
                    <div className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-600">
                      <span>2</span><span>80</span>
                    </div>
                  </div>

                  {/* ring nodes */}
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label className="font-mono text-xs text-zinc-400">Ring nodes</label>
                      <span className={`font-mono text-xs font-semibold ${safeRing >= 2 ? 'text-red-400' : 'text-zinc-500'}`}>
                        {safeRing === 0 ? 'none' : safeRing === 1 ? '1 (hi-risk only)' : safeRing}
                      </span>
                    </div>
                    <input
                      type="range" min={0} max={safeTotal} value={safeRing}
                      onChange={e => setRing(+e.target.value)}
                      className="slider-track slider-red w-full"
                    />
                    <div className="mt-0.5 flex justify-between font-mono text-[10px] text-zinc-600">
                      <span>0</span><span>{safeTotal}</span>
                    </div>
                  </div>

                  {/* ring ratio bar */}
                  <div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
                      <motion.div
                        className="h-full rounded-full bg-red-500"
                        animate={{ width: `${ringPct}%` }}
                        transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                      />
                    </div>
                    <p className="mt-1 font-mono text-[10px] text-zinc-600">
                      {ringPct.toFixed(0)}% of graph in fraud ring
                    </p>
                  </div>
                </div>

                {/* diagram */}
                <NodeDiagram total={safeTotal} ring={safeRing} />
              </section>

              {/* scenario summary */}
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3 space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 mb-2">What will be injected</p>
                <SummaryLine icon="◈" label="Backbone cycle" value={`${safeTotal} edges`} col="zinc" />
                <SummaryLine icon="⟳" label="Low-risk churn" value={`~${Math.round(Math.min(3 * safeTotal, 220) * 0.6)} edges`} col="green" />
                <SummaryLine icon="◑" label="Moderate-risk" value={`~${Math.round(Math.min(3 * safeTotal, 220) * 0.4)} edges`} col="amber" />
                {safeRing >= 2 && <SummaryLine icon="⬡" label="High-risk ring" value={`${safeRing}-node cycle`} col="red" />}
                {safeRing >= 2 && <SummaryLine icon="⚡" label="Fraud ring alert" value="POST /alerts/fraud-ring" col="red" />}
                {safeRing === 1 && <SummaryLine icon="⚠" label="High-risk edge" value="1 edge, no ring alert" col="amber" />}
                {safeRing === 0 && <SummaryLine icon="✓" label="No fraud ring" value="clean + moderate only" col="zinc" />}
              </div>

              {/* inject button */}
              <button
                onClick={() => void inject()}
                disabled={injecting}
                className={`
                  relative w-full overflow-hidden rounded-lg border px-4 py-3
                  font-mono text-sm font-semibold tracking-wider transition-all
                  disabled:cursor-not-allowed disabled:opacity-50
                  ${safeRing >= 2
                    ? 'border-red-700 bg-red-950/40 text-red-400 hover:bg-red-900/50 hover:text-red-300'
                    : 'border-zinc-700 bg-zinc-800 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100'
                  }
                `}
              >
                {injecting && (
                  <motion.span
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
                    animate={{ x: ['-100%', '100%'] }}
                    transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  />
                )}
                <span className="relative flex items-center justify-center gap-2">
                  {injecting
                    ? <><Spinner />&nbsp;Injecting…</>
                    : safeRing >= 2
                    ? '⬡ INJECT FRAUD RING'
                    : '◈ INJECT TRANSACTIONS'
                  }
                </span>
              </button>

              {/* clear button */}
              <button
                onClick={() => useStreamStore.getState().reset()}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-xs text-zinc-500 transition-all hover:border-zinc-700 hover:text-zinc-300"
              >
                Clear graph data
              </button>

              {/* history */}
              {history.length > 0 && (
                <section>
                  <div className="border-t border-zinc-800 pt-4">
                    <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">Inject history</p>
                    <div className="space-y-1.5">
                      <AnimatePresence initial={false}>
                        {history.map(h => (
                          <motion.div
                            key={h.id}
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`
                              flex items-start gap-2 rounded border px-3 py-2
                              ${h.status === 'ok'
                                ? 'border-zinc-800 bg-zinc-900'
                                : 'border-red-950 bg-red-950/20'
                              }
                            `}
                          >
                            <span className={`mt-0.5 font-mono text-[10px] shrink-0 ${h.status === 'ok' ? 'text-zinc-500' : 'text-red-500'}`}>
                              {h.time}
                            </span>
                            <span className={`font-mono text-xs leading-relaxed ${h.status === 'ok' ? 'text-zinc-300' : 'text-red-400'}`}>
                              {h.msg}
                            </span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/* ─── helpers ────────────────────────────────────────────────── */

function SummaryLine({
  icon, label, value, col = 'zinc',
}: {
  icon: string; label: string; value: string; col?: 'zinc' | 'red' | 'amber' | 'green'
}) {
  const vc = col === 'red' ? 'text-red-400' : col === 'amber' ? 'text-amber-400' : col === 'green' ? 'text-emerald-500' : 'text-zinc-400'
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5 font-mono text-xs text-zinc-500">
        <span>{icon}</span>
        <span>{label}</span>
      </span>
      <span className={`font-mono text-xs ${vc}`}>{value}</span>
    </div>
  )
}

function Spinner() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
      <circle cx="6" cy="6" r="4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="16" strokeDashoffset="8" />
    </svg>
  )
}
