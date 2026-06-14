function mlBase(): string {
  const v = import.meta.env.VITE_ML_BASE_URL
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return '/person2-ml'
}

export interface UploadRing {
  ring_id:       string
  accounts:      string[]
  txn_count:     number
  txn_ids:       string[]
  total_amount:  number
}

export interface UploadTransaction {
  txn_id:       string
  sender:       string
  receiver:     string
  amount:       number
  timestamp:    string
  risk_score:   number
  is_high_risk: boolean
  in_ring:      boolean
  shap:         Record<string, number>
}

export interface UploadResult {
  upload_id:       string
  created_at:      string
  total_txns:      number
  flagged_txns:    number
  ring_count:      number
  avg_risk_score:  number
  rings:           UploadRing[]
  transactions:    UploadTransaction[]
  columns_used:    Record<string, string>
  currency_symbol?: string
}

export interface NeedsMappingResult {
  status:        'needs_mapping'
  columns:       string[]
  sample_rows:   Record<string, string>[]
  auto_detected: Record<string, string | null>
  message:       string
}

export interface UploadSummary {
  upload_id:     string
  filename:      string
  created_at:    string
  total_txns:    number
  flagged_txns:  number
  ring_count:    number
  avg_risk_score: number
}

export async function postUploadAnalyze(
  file: File,
  colMap?: {
    col_sender?: string
    col_receiver?: string
    col_amount?: string
    col_timestamp?: string
    col_txn_id?: string
  }
): Promise<UploadResult | NeedsMappingResult> {
  const form = new FormData()
  form.append('file', file)
  if (colMap?.col_sender)    form.append('col_sender',    colMap.col_sender)
  if (colMap?.col_receiver)  form.append('col_receiver',  colMap.col_receiver)
  if (colMap?.col_amount)    form.append('col_amount',    colMap.col_amount)
  if (colMap?.col_timestamp) form.append('col_timestamp', colMap.col_timestamp)
  if (colMap?.col_txn_id)    form.append('col_txn_id',    colMap.col_txn_id)

  const res = await fetch(`${mlBase()}/upload/analyze`, { method: 'POST', body: form })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Upload failed: ${res.status} ${t.slice(0, 300)}`)
  }
  return res.json()
}

export async function fetchUploadResults(): Promise<UploadSummary[]> {
  const res = await fetch(`${mlBase()}/upload/results`)
  if (!res.ok) return []
  const body = await res.json() as { uploads: UploadSummary[] }
  return body.uploads ?? []
}

export async function fetchUploadResult(uploadId: string): Promise<UploadResult> {
  const res = await fetch(`${mlBase()}/upload/results/${encodeURIComponent(uploadId)}`)
  if (!res.ok) throw new Error(`Not found: ${uploadId}`)
  return res.json()
}
