import type { FraudAlert } from '../types/fraudStream'
import type { GraphEngineRing } from '../types/graphEngine'

export function pickRingForAlert(rings: GraphEngineRing[], alert: FraudAlert | null): GraphEngineRing | null {
  if (rings.length === 0) return null
  const sorted = [...rings].sort((a, b) => a.priority_rank - b.priority_rank)

  if (alert?.alert_id) {
    const byId = sorted.find((r) => r.ring_id === alert.alert_id)
    if (byId) return byId
  }

  if (alert?.cycle_accounts?.length) {
    const wanted = new Set(alert.cycle_accounts)
    let best: GraphEngineRing | null = null
    let bestOverlap = -1
    for (const r of sorted) {
      const ids = new Set(r.node_ids)
      let overlap = 0
      for (const id of wanted) {
        if (ids.has(id)) overlap++
      }
      if (overlap > bestOverlap) {
        bestOverlap = overlap
        best = r
      }
    }
    if (best && bestOverlap > 0) return best
  }

  return sorted[0] ?? null
}
