export interface ShapFeature {
  feature: string
  contribution: number
}

export interface LimeFeature {
  feature: string
  weight: number
}

export interface ExplainResponse {
  txn_id:       string
  risk_score:   number
  is_high_risk?: boolean
  forced_high?:  boolean         // true = flagged HIGH by ingest flag, not purely by ML score
  risk_label?:  string           // 'HIGH RISK' | 'MODERATE RISK' | 'LOW RISK' | 'HIGH RISK (flagged)'
  shap_values:  ShapFeature[]
  lime_values:  LimeFeature[]
  timestamp?:   string
  amount?:      number
  total_volume?: number
  source?:      string           // SHA-256 account hash
  target?:      string
  raw_features?: Record<string, number>  // {amount, velocity, time_delta, freq_ratio}
}
