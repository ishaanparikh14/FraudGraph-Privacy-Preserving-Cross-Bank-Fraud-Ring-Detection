import type { FraudAlert, IngestedTransaction, TransactionMetric } from '../types/fraudStream'

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function bool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (v === 1 || v === '1') return true
  if (v === 0 || v === '0') return false
  if (v === 'true') return true
  if (v === 'false') return false
  return null
}

/** Accepts Spring `IngestedTransaction` broadcast or prompt-shaped camelCase. */
export function parseTransactionBody(raw: unknown): {
  ok: true; data: IngestedTransaction } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: 'Transaction body is not an object' }

  const txn_id =
    str(raw.txn_id) ??
    str(raw.transaction_id) ??
    str(raw.transactionId)
  const source_account =
    str(raw.source_account) ?? str(raw.sourceAccount) ?? str(raw.source)
  const target_account =
    str(raw.target_account) ?? str(raw.targetAccount) ?? str(raw.target)

  if (!txn_id) return { ok: false, reason: 'Missing txn_id / transaction_id' }
  if (!source_account || !target_account) {
    return { ok: false, reason: 'Missing source_account or target_account' }
  }

  const amount = num(raw.amount) ?? 0
  const ts =
    str(raw.timestamp) ?? str(raw.received_at) ?? str(raw.receivedAt) ?? new Date().toISOString()
  const is_high_risk =
    bool(raw.is_high_risk) ??
    bool(raw.isHighRisk) ??
    bool(raw.is_fraud_flag) ??
    bool(raw.fraudFlag) ??
    bool(raw.fraud_flag) ??
    false

  const data: IngestedTransaction = {
    txn_id,
    source_account,
    target_account,
    amount,
    timestamp: ts,
    is_high_risk,
  }
  const rs = num(raw.risk_score) ?? num(raw.riskScore)
  if (rs != null) data.risk_score = rs
  return { ok: true, data }
}

export function parseFraudAlertBody(raw: unknown): { ok: true; data: FraudAlert } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: 'Fraud alert body is not an object' }

  const alert_id = str(raw.alert_id) ?? str(raw.alertId)
  let cycle_accounts = raw.cycle_accounts
  if (!Array.isArray(cycle_accounts)) cycle_accounts = raw.cycleAccounts
  if (!Array.isArray(cycle_accounts) || cycle_accounts.length === 0) {
    return { ok: false, reason: 'Missing or empty cycle_accounts' }
  }
  const accounts = cycle_accounts.filter((x): x is string => typeof x === 'string')
  if (accounts.length === 0) return { ok: false, reason: 'cycle_accounts has no strings' }

  let edge_ids: string[] = []
  if (Array.isArray(raw.edge_ids)) edge_ids = raw.edge_ids.filter((x): x is string => typeof x === 'string')
  if (edge_ids.length === 0 && Array.isArray(raw.edgeIds)) {
    edge_ids = raw.edgeIds.filter((x): x is string => typeof x === 'string')
  }

  const reason = str(raw.reason) ?? 'Fraud ring alert'
  const detection_method = str(raw.detection_method) ?? str(raw.detectionMethod) ?? undefined
  const source = str(raw.source) ?? undefined
  const timestamp = str(raw.timestamp) ?? str(raw.detected_at) ?? str(raw.detectedAt) ?? undefined

  const data: FraudAlert = {
    alert_id: alert_id ?? 'unknown',
    cycle_accounts: accounts,
    edge_ids,
    reason,
    detection_method,
    source,
    timestamp,
  }
  return { ok: true, data }
}

/** Spring sends `total_transactions` + `updated_at`; prompt schema uses throughput-style fields. */
export function parseMetricsBody(raw: unknown): { ok: true; data: TransactionMetric } | { ok: false; reason: string } {
  if (!isRecord(raw)) return { ok: false, reason: 'Metrics body is not an object' }

  const tps = num(raw.throughput_per_sec) ?? num(raw.throughputPerSec)
  const total_processed =
    num(raw.total_processed) ?? num(raw.totalProcessed) ?? num(raw.total_transactions) ?? num(raw.totalTransactions)
  const fraud_detected = num(raw.fraud_detected) ?? num(raw.fraudDetected) ?? 0
  const timestamp =
    str(raw.timestamp) ?? str(raw.updated_at) ?? str(raw.updatedAt) ?? new Date().toISOString()

  if (tps == null && total_processed == null) {
    return { ok: false, reason: 'Missing throughput_per_sec and total_processed / total_transactions' }
  }

  const data: TransactionMetric = {
    throughput_per_sec: tps ?? 0,
    total_processed: total_processed ?? 0,
    fraud_detected: fraud_detected ?? 0,
    timestamp,
  }
  return { ok: true, data }
}
