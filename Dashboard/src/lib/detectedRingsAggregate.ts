import { formatDetectionMethodFromPayload } from './fraudAlertDetectionLabel'
import type { FraudAlert } from '../types/fraudStream'
import type { GraphEngineRing } from '../types/graphEngine'

/** Union of every account that appears in any STOMP alert or graph-engine ring. */
export function aggregateDetectedRingAccounts(
  alerts: FraudAlert[],
  engineRings: GraphEngineRing[],
): Set<string> {
  const s = new Set<string>()
  
  // STOMP alerts are from manual injections, so always include them
  for (const a of alerts) {
    for (const id of a.cycle_accounts ?? []) {
      if (id) s.add(id)
    }
  }
  
  // Only include engine rings that start with MANUAL_NODE_ (manually injected fraud rings)
  // Ignore automatically detected rings from the simulator to avoid cluttering the visualization
  for (const r of engineRings) {
    const hasManualNodes = (r.node_ids ?? []).some(id => typeof id === 'string' && id.includes('MANUAL_NODE_'))
    if (hasManualNodes || (r.node_ids ?? []).length === 0) {
      // Include if it has manual nodes, or if it's empty
      for (const id of r.node_ids ?? []) {
        if (id) s.add(id)
      }
    }
  }
  return s
}

export function aggregateBackEdgeTxnIds(engineRings: GraphEngineRing[]): Set<string> {
  const out = new Set<string>()
  for (const r of engineRings) {
    const id = r.dfs_back_edge_txn_id
    if (typeof id === 'string' && id.length > 0) out.add(id)
  }
  return out
}

/** Per-node centrality: keep the max across rings so highlighted size stays meaningful. */
export function mergeRingCentrality(engineRings: GraphEngineRing[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of engineRings) {
    const c = r.centrality
    if (!c) continue
    for (const [node, score] of Object.entries(c)) {
      if (typeof score !== 'number' || !Number.isFinite(score)) continue
      const prev = out[node]
      out[node] = prev == null ? score : Math.max(prev, score)
    }
  }
  return out
}

/** Graph-engine rings that claim this txn id or both endpoints as member nodes. */
export function engineRingsTouchingTxn(
  txnId: string,
  sourceAccount: string,
  targetAccount: string,
  engineRings: GraphEngineRing[],
): GraphEngineRing[] {
  return engineRings.filter(
    (r) =>
      (Array.isArray(r.edge_ids) && r.edge_ids.includes(txnId)) ||
      (Array.isArray(r.node_ids) &&
        r.node_ids.includes(sourceAccount) &&
        r.node_ids.includes(targetAccount)),
  )
}

/** One forensic subgraph per group (engine ring, or STOMP footprint not already covered by engine nodes). */
export type RingDisplayGroup = {
  key: string
  title: string
  accountSet: Set<string>
  backEdgeTxnIds: Set<string>
  centrality: Record<string, number>
}

/**
 * Build disjoint UI groups: each graph-engine ring is its own subgraph; STOMP alerts are added only when they
 * introduce at least one account not present on any engine ring (avoids duplicating the same cycle twice). When
 * there are no engine rings, every non-empty alert becomes its own subgraph.
 */
export function buildRingDisplayGroups(alerts: FraudAlert[], engineRings: GraphEngineRing[]): RingDisplayGroup[] {
  const groups: RingDisplayGroup[] = []

  const sortedRings = [...engineRings].sort((a, b) => a.priority_rank - b.priority_rank)
  for (const r of sortedRings) {
    const accountSet = new Set<string>()
    for (const id of r.node_ids ?? []) {
      if (id) accountSet.add(id)
    }
    if (accountSet.size === 0) continue

    const backEdgeTxnIds = new Set<string>()
    const bid = r.dfs_back_edge_txn_id
    if (typeof bid === 'string' && bid.length > 0) backEdgeTxnIds.add(bid)

    groups.push({
      key: `engine:${r.ring_id}`,
      title: `Engine · ${r.ring_id}`,
      accountSet,
      backEdgeTxnIds,
      centrality: r.centrality ?? {},
    })
  }

  const engineUnion = new Set<string>()
  for (const g of groups) {
    for (const id of g.accountSet) engineUnion.add(id)
  }

  if (sortedRings.length > 0) {
    for (const a of alerts) {
      const accountSet = new Set<string>()
      for (const id of a.cycle_accounts ?? []) {
        if (id) accountSet.add(id)
      }
      if (accountSet.size === 0) continue

      const hasNovelNode = [...accountSet].some((id) => !engineUnion.has(id))
      if (!hasNovelNode) continue

      const backEdgeTxnIds = new Set<string>()
      for (const e of a.edge_ids ?? []) {
        if (typeof e === 'string' && e.length > 0) backEdgeTxnIds.add(e)
      }

      groups.push({
        key: `alert:${a.alert_id}`,
        title: `STOMP · ${a.alert_id}`,
        accountSet,
        backEdgeTxnIds,
        centrality: {},
      })
    }
  } else {
    for (const a of alerts) {
      const accountSet = new Set<string>()
      for (const id of a.cycle_accounts ?? []) {
        if (id) accountSet.add(id)
      }
      if (accountSet.size === 0) continue

      const backEdgeTxnIds = new Set<string>()
      for (const e of a.edge_ids ?? []) {
        if (typeof e === 'string' && e.length > 0) backEdgeTxnIds.add(e)
      }

      groups.push({
        key: `alert:${a.alert_id}`,
        title: `STOMP · ${a.alert_id}`,
        accountSet,
        backEdgeTxnIds,
        centrality: {},
      })
    }
  }

  return groups
}

export function uniqueDetectionLabels(alerts: FraudAlert[], engineRings: GraphEngineRing[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (x: string | undefined | null) => {
    const t = (x ?? '').trim()
    if (!t) return
    const label = formatDetectionMethodFromPayload(t)
    if (!label || seen.has(label)) return
    seen.add(label)
    ordered.push(label)
  }
  for (const a of alerts) push(a.detection_method)
  for (const r of engineRings) push(r.detection_method)
  return ordered
}
