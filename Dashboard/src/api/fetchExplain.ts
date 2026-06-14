import type { ExplainResponse, LimeFeature, ShapFeature } from '../types/explain'

function mlBase(): string {
  const v = import.meta.env.VITE_ML_BASE_URL
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return '/person2-ml'
}

function normalizeExplain(raw: Record<string, unknown>): ExplainResponse {
  const txn_id       = typeof raw.txn_id     === 'string' ? raw.txn_id     : String(raw.transaction_id ?? '')
  const risk_score   = typeof raw.risk_score === 'number' ? raw.risk_score : 0
  const is_high_risk = typeof raw.is_high_risk === 'boolean' ? raw.is_high_risk : undefined
  const forced_high  = typeof raw.forced_high  === 'boolean' ? raw.forced_high  : undefined
  const risk_label   = typeof raw.risk_label   === 'string'  ? raw.risk_label   : undefined

  // SHAP — prefer top_features list, fall back to shap_values dict
  const shap_values: ShapFeature[] = []
  if (Array.isArray(raw.top_features)) {
    for (const row of raw.top_features as Record<string, unknown>[]) {
      const name  = typeof row.name  === 'string' ? row.name  : typeof row.feature === 'string' ? row.feature : 'feature'
      const value = typeof row.value === 'number' ? row.value : typeof row.contribution === 'number' ? row.contribution : 0
      shap_values.push({ feature: name, contribution: value })
    }
  }
  if (shap_values.length === 0 && raw.shap_values && typeof raw.shap_values === 'object' && !Array.isArray(raw.shap_values)) {
    for (const [k, v] of Object.entries(raw.shap_values as Record<string, unknown>)) {
      if (typeof v === 'number' && Number.isFinite(v)) shap_values.push({ feature: k, contribution: v })
    }
  }

  // LIME
  const lime_values: LimeFeature[] = []
  if (Array.isArray(raw.lime_explanation)) {
    for (const row of raw.lime_explanation as unknown[]) {
      if (Array.isArray(row) && row.length >= 2)
        lime_values.push({ feature: String(row[0]), weight: Number(row[1]) })
    }
  }

  const timestamp    = typeof raw.timestamp === 'string' && raw.timestamp.trim() ? raw.timestamp.trim() : undefined
  const amount       = typeof raw.amount       === 'number' ? raw.amount       : undefined
  const total_volume = typeof raw.total_volume === 'number' ? raw.total_volume : amount
  const source       = typeof raw.source       === 'string' ? raw.source       : undefined
  const target       = typeof raw.target       === 'string' ? raw.target       : undefined

  let raw_features: Record<string, number> | undefined
  if (raw.raw_features && typeof raw.raw_features === 'object' && !Array.isArray(raw.raw_features)) {
    raw_features = raw.raw_features as Record<string, number>
  }

  return { txn_id, risk_score, is_high_risk, forced_high, risk_label, shap_values, lime_values, timestamp, amount, total_volume, source, target, raw_features }
}

export async function postExplain(txnId: string): Promise<ExplainResponse> {
  const res = await fetch(`${mlBase()}/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ txn_id: txnId }),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`POST /explain failed: ${res.status} ${t.slice(0, 300)}`)
  }
  return normalizeExplain((await res.json()) as Record<string, unknown>)
}

/** Re-run model + SHAP inline for any transaction — always returns fresh scores */
export async function postRescore(txn: {
  txn_id: string
  source?: string
  target?: string
  amount?: number
  timestamp?: string
  received_at?: string
  is_fraud_flag?: boolean
  is_high_risk?: boolean
}): Promise<ExplainResponse> {
  const res = await fetch(`${mlBase()}/rescore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(txn),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`POST /rescore failed: ${res.status} ${t.slice(0, 300)}`)
  }
  return normalizeExplain((await res.json()) as Record<string, unknown>)
}

export async function fetchMlHealth() {
  const res = await fetch(`${mlBase()}/health`)
  if (!res.ok) throw new Error('ML health check failed')
  return res.json()
}

export async function fetchRecentScoredIds(limit = 20): Promise<string[]> {
  try {
    const res  = await fetch(`${mlBase()}/explain/recent?limit=${limit}`)
    if (!res.ok) return []
    const body = (await res.json()) as { txn_ids?: unknown }
    if (Array.isArray(body.txn_ids)) return body.txn_ids.filter((x): x is string => typeof x === 'string')
    return []
  } catch { return [] }
}
