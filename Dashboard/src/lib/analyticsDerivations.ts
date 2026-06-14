import type { GraphEngineRing } from '../types/graphEngine'
import type { FraudAlert, IngestedTransaction } from '../types/fraudStream'
import { isTickerFraudSurface } from './tickerFraudSurface'

export const VOLUME_WINDOW_MS = 10_000

function parseTs(iso: string): number {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : Date.now()
}

/**
 * Same notion of “flagged” as the ticker: ingest flag, optional ring id, risk_score threshold,
 * or membership in the latest STOMP fraud alert (cycle / edge_ids).
 */
export function isAnalyticsFraudSurface(txn: IngestedTransaction, latestAlert: FraudAlert | null): boolean {
  return isTickerFraudSurface(txn, latestAlert)
}

/**
 * Bucket transactions into fixed time windows (default 10s) for line chart.
 * Returns rows sorted by time ascending (oldest window first for X axis).
 */
export function bucketVolumeOverTime(
  transactions: IngestedTransaction[],
  windowMs = VOLUME_WINDOW_MS,
  latestAlert: FraudAlert | null = null,
): { bucketStart: number; label: string; total: number; highRisk: number }[] {
  const map = new Map<number, { total: number; highRisk: number }>()
  for (const tx of transactions) {
    const t = parseTs(tx.timestamp)
    const bucket = Math.floor(t / windowMs) * windowMs
    const cur = map.get(bucket) ?? { total: 0, highRisk: 0 }
    cur.total += 1
    if (isAnalyticsFraudSurface(tx, latestAlert)) cur.highRisk += 1
    map.set(bucket, cur)
  }
  const keys = [...map.keys()].sort((a, b) => a - b)
  return keys.map((bucketStart) => {
    const v = map.get(bucketStart)!
    const d = new Date(bucketStart)
    const label = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return { bucketStart, label, total: v.total, highRisk: v.highRisk }
  })
}

export function fraudRatioStats(
  transactions: IngestedTransaction[],
  latestAlert: FraudAlert | null = null,
): { fraud: number; total: number; pct: number } {
  const total = transactions.length
  if (total === 0) return { fraud: 0, total: 0, pct: 0 }
  const fraud = transactions.filter((tx) => isAnalyticsFraudSurface(tx, latestAlert)).length
  return { fraud, total, pct: (fraud / total) * 100 }
}

const AMOUNT_BINS = [
  { key: '$0–10k', min: 0, max: 10_000 },
  { key: '$10k–50k', min: 10_000, max: 50_000 },
  { key: '$50k–100k', min: 50_000, max: 100_000 },
  { key: '$100k+', min: 100_000, max: Infinity },
] as const

export function amountDistribution(transactions: IngestedTransaction[]): { range: string; count: number }[] {
  const counts = Object.fromEntries(AMOUNT_BINS.map((b) => [b.key, 0])) as Record<string, number>
  for (const tx of transactions) {
    const a = typeof tx.amount === 'number' && Number.isFinite(tx.amount) ? tx.amount : 0
    for (const b of AMOUNT_BINS) {
      if (a >= b.min && a < b.max) {
        counts[b.key] += 1
        break
      }
    }
  }
  return AMOUNT_BINS.map((b) => ({ range: b.key, count: counts[b.key] ?? 0 }))
}

export function topAccountsByVolume(transactions: IngestedTransaction[], limit = 12): { account: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const tx of transactions) {
    if (tx.source_account) tally.set(tx.source_account, (tally.get(tx.source_account) ?? 0) + 1)
    if (tx.target_account) tally.set(tx.target_account, (tally.get(tx.target_account) ?? 0) + 1)
  }
  return [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([raw, count]) => ({
      account: raw.length > 16 ? `${raw.slice(0, 14)}…` : raw,
      count,
    }))
}

const RISK_BINS = [
  { key: '0–0.25', min: 0, max: 0.25 },
  { key: '0.25–0.5', min: 0.25, max: 0.5 },
  { key: '0.5–0.75', min: 0.5, max: 0.75 },
  { key: '0.75–1', min: 0.75, max: 1.01 },
] as const

export function riskScoreDistribution(
  transactions: IngestedTransaction[],
): { bin: string; count: number }[] | null {
  const withScore = transactions.filter((t) => t.risk_score != null && Number.isFinite(t.risk_score))
  if (withScore.length === 0) return null
  const counts = Object.fromEntries(RISK_BINS.map((b) => [b.key, 0])) as Record<string, number>
  for (const tx of withScore) {
    const r = tx.risk_score!
    const clamped = Math.max(0, Math.min(1, r))
    for (const b of RISK_BINS) {
      if (clamped >= b.min && clamped < b.max) {
        counts[b.key] += 1
        break
      }
    }
  }
  return RISK_BINS.map((b) => ({ bin: b.key, count: counts[b.key] ?? 0 }))
}

export function ringSizeDistribution(rings: GraphEngineRing[]): { sizeLabel: string; count: number }[] {
  const map = new Map<number, number>()
  for (const r of rings) {
    const n = r.node_ids?.length ?? 0
    if (n <= 0) continue
    map.set(n, (map.get(n) ?? 0) + 1)
  }
  const sizes = [...map.keys()].sort((a, b) => a - b)
  return sizes.map((s) => ({ sizeLabel: String(s), count: map.get(s) ?? 0 }))
}
