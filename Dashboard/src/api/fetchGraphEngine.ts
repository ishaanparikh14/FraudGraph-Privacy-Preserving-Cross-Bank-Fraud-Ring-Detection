import { adaptPerson3RingsPayload } from '../lib/adaptGraphRings'
import type { BenchmarkSummary, GraphEngineRing } from '../types/graphEngine'

function graphBase(): string {
  const v = import.meta.env.VITE_GRAPH_ENGINE_BASE_URL
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return '/person3-api'
}

export async function fetchRings(): Promise<{ rings: GraphEngineRing[] }> {
  const res = await fetch(`${graphBase()}/api/graph/rings`)
  if (!res.ok) throw new Error(`GET /api/graph/rings failed: ${res.status}`)
  const json: unknown = await res.json()
  return { rings: adaptPerson3RingsPayload(json) }
}

export async function fetchBenchmarkSummary(): Promise<BenchmarkSummary> {
  const res = await fetch(`${graphBase()}/api/benchmark/summary`)
  if (!res.ok) throw new Error(`GET /api/benchmark/summary failed: ${res.status}`)
  const j = (await res.json()) as Record<string, unknown>
  const nodeCount = typeof j.nodeCount === 'number' ? j.nodeCount : 0
  const edgeCount = typeof j.edgeCount === 'number' ? j.edgeCount : 0
  const tarjan = typeof j.graphTarjanMs === 'number' ? j.graphTarjanMs : typeof j.tarjan_ms === 'number' ? j.tarjan_ms : 0
  return {
    tarjan_ms: tarjan,
    graphTarjanMs: typeof j.graphTarjanMs === 'number' ? j.graphTarjanMs : undefined,
    sqlNaiveJoinMs: typeof j.sqlNaiveJoinMs === 'number' ? j.sqlNaiveJoinMs : undefined,
    total_nodes: nodeCount,
    total_edges: edgeCount,
    rings_found: 0,
    nodeCount,
    edgeCount,
    datasetNote: typeof j.datasetNote === 'string' ? j.datasetNote : '',
  }
}
