/** UI-facing ring (adapted from Person 3 GET /api/graph/rings). */
export interface GraphEngineRing {
  ring_id: string
  node_ids: string[]
  edge_ids: string[]
  priority_rank: number
  detection_method?: string
  /** Transaction id on the DFS back-edge, when inferable from Person 3 payload. */
  dfs_back_edge_txn_id?: string | null
  centrality?: Record<string, number>
}

export interface GraphEngineRingsResponse {
  rings: GraphEngineRing[]
}

export interface BenchmarkSummary {
  tarjan_ms?: number
  pagerank_ms?: number
  graphTarjanMs?: number
  sqlNaiveJoinMs?: number
  total_nodes: number
  total_edges: number
  rings_found: number
  nodeCount?: number
  edgeCount?: number
  datasetNote?: string
}
