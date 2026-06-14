/**
 * GraphPanel — custom canvas-based fraud graph renderer.
 *
 * Concept: a dark "neural network" aesthetic with:
 *  - Smooth spring-physics force simulation (no library)
 *  - Animated particles that travel along edges
 *  - Pulsing glow on ring/high-risk nodes
 *  - Framer-motion fade-in overlay text
 *  - Click on ring node → navigate to XAI
 */

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGraphRingsPoll } from '../../hooks/useGraphRingsPoll'
import {
  aggregateBackEdgeTxnIds,
  aggregateDetectedRingAccounts,
  mergeRingCentrality,
} from '../../lib/detectedRingsAggregate'
import { buildGraphFromTransactions, type GraphNode, type GraphLink } from '../../lib/graphFromTransactions'
import { useDashboardUiStore } from '../../store/dashboardUiStore'
import type { FraudAlert, IngestedTransaction } from '../../types/fraudStream'

/* ─── types ──────────────────────────────────────────────────── */

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
}

interface Particle {
  linkIndex: number
  t: number       // 0‥1 progress along edge
  speed: number
  color: string
}

/* ─── constants ───────────────────────────────────────────────── */
const REPULSION    = 4800
const LINK_DIST    = 90
const SPRING_K     = 0.018
const DAMPING      = 0.82
const CENTER_PULL  = 0.004
const MAX_NODES    = 80          // cap for perf

const COL_NORMAL     = '#3f3f46'
const COL_MODERATE   = '#f59e0b'
const COL_RISK       = '#ef4444'
const COL_RING       = '#ef4444'
const COL_EDGE       = 'rgba(63,63,70,0.45)'
const COL_MOD_EDGE   = 'rgba(245,158,11,0.35)'
const COL_RING_EDGE  = 'rgba(239,68,68,0.55)'

/* ─── helpers ────────────────────────────────────────────────── */

function initPositions(nodes: GraphNode[], w: number, h: number): SimNode[] {
  return nodes.map((n, i) => {
    const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2
    const r = Math.min(w, h) * 0.28
    return {
      ...n,
      x: w / 2 + r * Math.cos(angle) + (Math.random() - 0.5) * 40,
      y: h / 2 + r * Math.sin(angle) + (Math.random() - 0.5) * 40,
      vx: 0,
      vy: 0,
    }
  })
}

function tickPhysics(nodes: SimNode[], links: GraphLink[], w: number, h: number) {
  const cx = w / 2
  const cy = h / 2
  const n = nodes.length
  const idxMap = new Map(nodes.map((nd, i) => [nd.id, i]))

  // repulsion
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = nodes[j].x - nodes[i].x
      const dy = nodes[j].y - nodes[i].y
      const dist2 = dx * dx + dy * dy + 1
      const f = REPULSION / dist2
      const fx = f * dx / Math.sqrt(dist2)
      const fy = f * dy / Math.sqrt(dist2)
      nodes[i].vx -= fx; nodes[i].vy -= fy
      nodes[j].vx += fx; nodes[j].vy += fy
    }
  }

  // spring along links
  for (const l of links) {
    const si = idxMap.get(l.source as string)
    const ti = idxMap.get(l.target as string)
    if (si == null || ti == null) continue
    const a = nodes[si], b = nodes[ti]
    const dx = b.x - a.x, dy = b.y - a.y
    const dist = Math.sqrt(dx * dx + dy * dy) || 1
    const force = (dist - LINK_DIST) * SPRING_K
    const fx = force * dx / dist, fy = force * dy / dist
    a.vx += fx; a.vy += fy
    b.vx -= fx; b.vy -= fy
  }

  // center gravity + damping + integrate
  for (const nd of nodes) {
    nd.vx += (cx - nd.x) * CENTER_PULL
    nd.vy += (cy - nd.y) * CENTER_PULL
    nd.vx *= DAMPING; nd.vy *= DAMPING
    nd.x += nd.vx; nd.y += nd.vy
    // clamp
    nd.x = Math.max(12, Math.min(w - 12, nd.x))
    nd.y = Math.max(12, Math.min(h - 12, nd.y))
  }
}

/* ─── component ──────────────────────────────────────────────── */

type Props = {
  transactions: IngestedTransaction[]
  fraudAlerts: FraudAlert[]
  isPaused: boolean
}

export function GraphPanel({ transactions, fraudAlerts, isPaused }: Props) {
  const navigate = useNavigate()
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapRef    = useRef<HTMLDivElement>(null)
  const stateRef   = useRef<{
    nodes: SimNode[]
    links: GraphLink[]
    particles: Particle[]
    w: number
    h: number
    frame: number
    tick: number
  }>({ nodes: [], links: [], particles: [], w: 800, h: 500, frame: 0, tick: 0 })

  const { rings } = useGraphRingsPoll({ enabled: !isPaused, intervalMs: 3000 })

  const ringAccountSet = useMemo(
    () => aggregateDetectedRingAccounts(fraudAlerts, rings),
    [fraudAlerts, rings],
  )
  const backEdgeTxnIds = useMemo(() => aggregateBackEdgeTxnIds(rings), [rings])
  const centralityMap  = useMemo(() => mergeRingCentrality(rings), [rings])

  const graphData = useMemo(
    () => buildGraphFromTransactions(
      transactions.slice(0, MAX_NODES),
      ringAccountSet,
      backEdgeTxnIds,
      centralityMap,
    ),
    [transactions, ringAccountSet, backEdgeTxnIds, centralityMap],
  )

  /* sync graph data → sim nodes (preserve positions for existing nodes) */
  useEffect(() => {
    const s = stateRef.current
    const newIds = new Set(graphData.nodes.map(n => n.id))
    const oldMap = new Map(s.nodes.map(n => [n.id, n]))

    s.nodes = graphData.nodes.map(n => {
      const old = oldMap.get(n.id)
      return old
        ? { ...n, x: old.x, y: old.y, vx: old.vx, vy: old.vy }
        : { ...n, x: s.w / 2 + (Math.random() - 0.5) * 120, y: s.h / 2 + (Math.random() - 0.5) * 120, vx: 0, vy: 0 }
    })
    s.links = graphData.links

    // seed particles on ring edges
    s.particles = s.particles.filter(p => p.linkIndex < s.links.length && newIds.size > 0)
    const ringLinks = s.links.reduce<number[]>((acc, l, i) => {
      if (l.inRing || l.isBackEdge) acc.push(i)
      return acc
    }, [])
    if (ringLinks.length > 0 && s.particles.filter(p => ringLinks.includes(p.linkIndex)).length < ringLinks.length * 3) {
      for (const li of ringLinks) {
        for (let k = 0; k < 3; k++) {
          s.particles.push({ linkIndex: li, t: Math.random(), speed: 0.004 + Math.random() * 0.006, color: COL_RING })
        }
      }
    }
    // normal edge particles (sparse)
    const normalLinks = s.links.reduce<number[]>((acc, l, i) => {
      if (!l.inRing && !l.isBackEdge) acc.push(i)
      return acc
    }, [])
    const existingNormal = new Set(s.particles.filter(p => !ringLinks.includes(p.linkIndex)).map(p => p.linkIndex))
    for (const li of normalLinks) {
      if (!existingNormal.has(li) && Math.random() < 0.3) {
        const rs = (s.links[li] as GraphLink & { riskScore?: number }).riskScore ?? 0
        const isMod = rs >= 0.30
        s.particles.push({
          linkIndex: li,
          t: Math.random(),
          speed: 0.002 + Math.random() * 0.003,
          color: isMod ? 'rgba(245,158,11,0.55)' : 'rgba(161,161,170,0.4)',
        })
      }
    }
    // cap particles
    if (s.particles.length > 300) s.particles = s.particles.slice(-300)
  }, [graphData])

  /* resize observer */
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      const w = Math.max(200, r.width)
      const h = Math.max(200, r.height)
      stateRef.current.w = w
      stateRef.current.h = h
      const canvas = canvasRef.current
      if (canvas) { canvas.width = w; canvas.height = h }
      if (stateRef.current.nodes.length === 0 && graphData.nodes.length > 0) {
        stateRef.current.nodes = initPositions(graphData.nodes, w, h)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [graphData.nodes])

  /* ── animation loop ─────────────────────────────────────────── */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let rafId: number
    let running = true

    const draw = () => {
      if (!running) return
      const s = stateRef.current
      const { w, h, nodes, links, particles } = s

      if (!isPaused) {
        // run several physics ticks per frame for snappier settling
        for (let i = 0; i < 2; i++) tickPhysics(nodes, links, w, h)
        s.tick++
      }

      ctx.clearRect(0, 0, w, h)

      const idxMap = new Map(nodes.map((n, i) => [n.id, i]))

      /* ── background grid (subtle) ── */
      ctx.strokeStyle = 'rgba(39,39,42,0.4)'
      ctx.lineWidth = 0.5
      const grid = 40
      for (let x = 0; x < w; x += grid) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke()
      }
      for (let y = 0; y < h; y += grid) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke()
      }

      /* ── edges ── */
      for (const l of links) {
        const si = idxMap.get(l.source as string)
        const ti = idxMap.get(l.target as string)
        if (si == null || ti == null) continue
        const a = nodes[si], b = nodes[ti]

        const isHigh = l.inRing || l.isBackEdge
        const isMod  = !isHigh && (l as GraphLink & { riskScore?: number }).riskScore != null &&
                       ((l as GraphLink & { riskScore?: number }).riskScore ?? 0) >= 0.30

        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.strokeStyle = isHigh ? COL_RING_EDGE : isMod ? COL_MOD_EDGE : COL_EDGE
        ctx.lineWidth   = isHigh ? 1.5 : isMod ? 0.9 : 0.7
        ctx.stroke()

        // arrow head on ring edges only
        if (isHigh) {
          const angle = Math.atan2(b.y - a.y, b.x - a.x)
          const ax = b.x - Math.cos(angle) * 10
          const ay = b.y - Math.sin(angle) * 10
          ctx.beginPath()
          ctx.moveTo(ax, ay)
          ctx.lineTo(ax - 6 * Math.cos(angle - 0.4), ay - 6 * Math.sin(angle - 0.4))
          ctx.lineTo(ax - 6 * Math.cos(angle + 0.4), ay - 6 * Math.sin(angle + 0.4))
          ctx.closePath()
          ctx.fillStyle = COL_RING
          ctx.fill()
        }
      }

      /* ── particles ── */
      for (const p of particles) {
        if (!isPaused) {
          p.t += p.speed
          if (p.t > 1) p.t = 0
        }
        const l = links[p.linkIndex]
        if (!l) continue
        const si = idxMap.get(l.source as string)
        const ti = idxMap.get(l.target as string)
        if (si == null || ti == null) continue
        const a = nodes[si], b = nodes[ti]
        const px = a.x + (b.x - a.x) * p.t
        const py = a.y + (b.y - a.y) * p.t

        ctx.beginPath()
        ctx.arc(px, py, 2.2, 0, Math.PI * 2)
        ctx.fillStyle = p.color
        if (l.inRing || l.isBackEdge) {
          ctx.shadowBlur = 8
          ctx.shadowColor = '#ef4444'
        }
        ctx.fill()
        ctx.shadowBlur = 0
      }

      /* ── nodes ── */
      const pulse = Math.sin(s.tick * 0.04) * 0.5 + 0.5   // 0‥1 oscillator

      for (const nd of nodes) {
        const r = Math.max(4, (nd.centralityScore ?? 0.05) * 14 + 4)

        if (nd.inRing) {
          // outer glow ring — red
          const glow = ctx.createRadialGradient(nd.x, nd.y, r * 0.5, nd.x, nd.y, r * 2.8)
          glow.addColorStop(0, `rgba(239,68,68,${0.35 + pulse * 0.25})`)
          glow.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.beginPath()
          ctx.arc(nd.x, nd.y, r * 2.8, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        } else if (nd.isHighRisk) {
          // outer glow — red (non-ring high risk)
          const glow = ctx.createRadialGradient(nd.x, nd.y, r * 0.5, nd.x, nd.y, r * 2.2)
          glow.addColorStop(0, `rgba(239,68,68,${0.2 + pulse * 0.15})`)
          glow.addColorStop(1, 'rgba(239,68,68,0)')
          ctx.beginPath()
          ctx.arc(nd.x, nd.y, r * 2.2, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        } else if (nd.isModerate) {
          // outer glow — amber (moderate)
          const glow = ctx.createRadialGradient(nd.x, nd.y, r * 0.5, nd.x, nd.y, r * 1.8)
          glow.addColorStop(0, `rgba(245,158,11,${0.18 + pulse * 0.12})`)
          glow.addColorStop(1, 'rgba(245,158,11,0)')
          ctx.beginPath()
          ctx.arc(nd.x, nd.y, r * 1.8, 0, Math.PI * 2)
          ctx.fillStyle = glow
          ctx.fill()
        }

        // node fill
        ctx.beginPath()
        ctx.arc(nd.x, nd.y, r, 0, Math.PI * 2)
        const fill = nd.inRing
          ? COL_RING
          : nd.isHighRisk
          ? COL_RISK
          : nd.isModerate
          ? COL_MODERATE
          : COL_NORMAL
        ctx.fillStyle = fill
        ctx.fill()

        // border
        ctx.strokeStyle = nd.inRing
          ? `rgba(239,68,68,${0.7 + pulse * 0.3})`
          : nd.isHighRisk
          ? `rgba(239,68,68,0.55)`
          : nd.isModerate
          ? `rgba(245,158,11,0.55)`
          : 'rgba(82,82,91,0.4)'
        ctx.lineWidth = nd.inRing ? 1.5 : nd.isHighRisk || nd.isModerate ? 1 : 0.8
        ctx.stroke()

        // inner highlight
        ctx.beginPath()
        ctx.arc(nd.x - r * 0.28, nd.y - r * 0.28, r * 0.35, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255,255,255,0.08)'
        ctx.fill()
      }

      s.frame++
      rafId = requestAnimationFrame(draw)
    }

    rafId = requestAnimationFrame(draw)
    return () => { running = false; cancelAnimationFrame(rafId) }
  }, [isPaused])

  /* ── click handling ─────────────────────────────────────────── */
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    for (const nd of stateRef.current.nodes) {
      const r = Math.max(4, (nd.centralityScore ?? 0.05) * 14 + 4) + 4
      const dx = nd.x - mx, dy = nd.y - my
      if (dx * dx + dy * dy < r * r) {
        const id = nd.txnId ?? nd.id
        useDashboardUiStore.getState().setPinnedTxnIdForXai(id)
        void navigate(`/investigate/${encodeURIComponent(id)}`)
        return
      }
    }
  }, [navigate])

  const ringCount  = useMemo(() => graphData.nodes.filter(n => n.inRing).length, [graphData])
  const totalNodes = graphData.nodes.length

  return (
    <div
      ref={wrapRef}
      className={`fg-card relative h-full min-h-[420px] overflow-hidden transition-shadow duration-700 ${ringCount > 0 ? 'ring-active-glow' : ''}`}
    >

      {/* status badge */}
      <div className="absolute left-3 top-3 z-20 flex items-center gap-2">
        {isPaused ? (
          <span className="rounded border border-amber-900 bg-amber-950/40 px-2 py-0.5 font-mono text-xs text-amber-500">
            ⏸ PAUSED
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-mono text-xs text-fg-green">
            <span className="live-dot size-1.5 rounded-full bg-fg-green" />
            LIVE
          </span>
        )}
      </div>

      {/* stats overlay */}
      <div className="absolute right-3 top-3 z-20 flex gap-2 font-mono text-xs">
        <span className="rounded border border-zinc-800 bg-zinc-950/70 px-2 py-0.5 text-zinc-400">
          {totalNodes} nodes
        </span>
        <AnimatePresence>
          {ringCount > 0 && (
            <motion.span
              key="ring-badge"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="rounded border border-red-900 bg-red-950/60 px-2 py-0.5 text-red-400"
            >
              ⬡ {ringCount} ring
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {/* legend */}
      <div className="absolute bottom-3 left-3 z-20 flex gap-3 font-mono text-xs text-zinc-500">
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-zinc-600" /> low
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-amber-500" /> moderate
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-red-500" /> high
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block size-2 rounded-full bg-red-600 ring-1 ring-red-500/50" /> ring
        </span>
      </div>

      {/* empty state */}
      <AnimatePresence>
        {totalNodes === 0 && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 text-zinc-600"
          >
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="1" strokeDasharray="4 3" />
              <circle cx="20" cy="20" r="3" fill="currentColor" />
            </svg>
            <span className="font-mono text-xs">Waiting for transactions…</span>
          </motion.div>
        )}
      </AnimatePresence>

      <canvas
        ref={canvasRef}
        className="h-full w-full cursor-crosshair"
        onClick={handleClick}
        title="Click a fraud-ring node to investigate"
      />
    </div>
  )
}
