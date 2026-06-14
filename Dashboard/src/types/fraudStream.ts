export interface IngestedTransaction {
  txn_id: string
  source_account: string
  target_account: string
  amount: number
  timestamp: string
  is_high_risk: boolean
  fraud_ring_id?: string
  centrality_score?: number
  risk_score?: number
}

export interface FraudAlert {
  alert_id: string
  cycle_accounts: string[]
  edge_ids: string[]
  reason: string
  detection_method?: string
  /** Ingest origin, e.g. `graph-engine` or `simulator` (Spring JSON `source`). */
  source?: string
  /** ISO time from alert (`detected_at` on Spring). */
  timestamp?: string
}

export interface TransactionMetric {
  throughput_per_sec: number
  total_processed: number
  fraud_detected: number
  timestamp: string
}

export type ConnectionState = 'idle' | 'connecting' | 'live' | 'reconnecting'
