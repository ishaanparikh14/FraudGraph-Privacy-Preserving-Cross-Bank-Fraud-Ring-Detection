import type { FraudAlert } from '../types/fraudStream'

/** Normalize API / JSON slugs for lookup (tarjan_scc, Tarjan_SCC, tarjan-scc → same key). */
function normalizeDetectionKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/['\u2019`]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

const KNOWN: Record<string, string> = {
  tarjan_scc: "Tarjan's SCC",
  tarjans_scc: "Tarjan's SCC",
  tarjan: "Tarjan's algorithm",
  /** Same structural story as production (SCC / cycle); `source` in JSON tells if traffic is synthetic. */
  simulator_closed_cycle: "Tarjan's SCC",
  dashboard_manual_closed_cycle: 'Manual inject (dashboard)',
  dashboard_preset_ring: 'Demo preset ring',
  manual_inject: 'Manual inject',
  dfs_back_edge: 'DFS back-edge',
  dfs: 'DFS',
}

function humanizeUnderscores(s: string): string {
  return s.trim().replace(/_/g, ' ')
}

function smartTitleCase(s: string): string {
  return s.split(/\s+/).map((w) => {
    const u = w.toUpperCase()
    if (['SCC', 'DFS', 'BFS', 'API', 'ML', 'RF', 'SVM'].includes(u)) return u
    if (w.length <= 1) return w.toUpperCase()
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
  }).join(' ')
}

/**
 * Turn `detection_method` from JSON/STOMP into a short human-readable label.
 * Prefers explicit mappings (e.g. tarjan_scc → "Tarjan's SCC"); unknown slugs become title-cased words.
 */
export function formatDetectionMethodFromPayload(raw: string | undefined | null): string {
  const dm = raw?.trim()
  if (!dm) return ''

  const key = normalizeDetectionKey(dm)
  if (KNOWN[key]) return KNOWN[key]

  if (key.includes('tarjan') && key.includes('scc')) return "Tarjan's SCC"
  if (key.includes('tarjan')) return "Tarjan's algorithm"
  if (key.includes('simulator') && key.includes('closed')) return "Tarjan's SCC"
  if (key.includes('manual') && key.includes('inject')) return 'Manual inject'

  const spaced = humanizeUnderscores(dm.replace(/\s+/g, '_'))
  return smartTitleCase(spaced)
}

/**
 * Full alert: use JSON `detection_method` first; otherwise infer how the ring was found from `reason` / `source`.
 */
export function fraudAlertDetectionLabel(a: FraudAlert): string {
  const fromJson = formatDetectionMethodFromPayload(a.detection_method)
  if (fromJson) return fromJson

  const reason = (a.reason ?? '').trim()
  const src = (a.source ?? '').trim().toLowerCase()

  if (/tarjan/i.test(reason) && /scc|strongly\s+connected/i.test(reason)) return "Tarjan's SCC"
  if (/tarjan/i.test(reason)) return "Tarjan's algorithm"
  if (/dfs\s*back/i.test(reason) || /back-edge/i.test(reason)) return 'DFS back-edge'
  if (src === 'simulator' || /simulator/i.test(reason)) return "Tarjan's SCC"
  if (reason.length > 0) return reason.length > 44 ? `${reason.slice(0, 41)}…` : reason
  if (src === 'graph-engine') return "Tarjan's SCC"
  return '—'
}

/** Tooltip line: raw JSON value auditors can match to the wire payload. */
export function detectionMethodTooltip(a: FraudAlert): string {
  const parts: string[] = []
  const raw = a.detection_method?.trim()
  if (raw) parts.push(`detection_method (JSON): ${raw}`)
  if (a.source?.trim()) parts.push(`source: ${a.source.trim()}`)
  if (a.reason?.trim()) parts.push(`reason: ${a.reason.trim()}`)
  return parts.join('\n\n')
}
