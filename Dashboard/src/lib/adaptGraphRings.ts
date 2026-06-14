import type { GraphEngineRing } from '../types/graphEngine'

type RawNode = { id?: string; centrality_score?: number }
type RawEdge = { txn_id?: string; from?: string; to?: string }
type RawRing = {
  ring_id?: string
  nodes?: RawNode[]
  edges?: RawEdge[]
  priority_rank?: number
  detection_method?: string
  dfs_back_edge?: { from?: string; to?: string }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

/** Maps Person 3 native JSON to the prompt’s simplified `GraphEngineRing`. */
export function adaptPerson3RingsPayload(json: unknown): GraphEngineRing[] {
  if (!isRecord(json) || !Array.isArray(json.rings)) return []
  const out: GraphEngineRing[] = []
  for (const r of json.rings as RawRing[]) {
    if (!r?.ring_id) continue
    const nodes = Array.isArray(r.nodes) ? r.nodes : []
    const edges = Array.isArray(r.edges) ? r.edges : []
    const node_ids = nodes.map((n) => n.id).filter((id): id is string => typeof id === 'string')
    const edge_ids = edges.map((e) => e.txn_id).filter((id): id is string => typeof id === 'string')
    const centrality: Record<string, number> = {}
    for (const n of nodes) {
      if (n.id && typeof n.centrality_score === 'number') centrality[n.id] = n.centrality_score
    }
    let dfs_back_edge_txn_id: string | null = null
    const be = r.dfs_back_edge
    if (be?.from && be?.to) {
      const hit = edges.find((e) => e.from === be.from && e.to === be.to)
      if (hit?.txn_id) dfs_back_edge_txn_id = hit.txn_id
    }
    out.push({
      ring_id: r.ring_id,
      node_ids,
      edge_ids,
      priority_rank: typeof r.priority_rank === 'number' ? r.priority_rank : 0,
      detection_method: r.detection_method,
      dfs_back_edge_txn_id,
      centrality: Object.keys(centrality).length ? centrality : undefined,
    })
  }
  return out
}
