import type { FraudAlert, IngestedTransaction } from '../types/fraudStream'

/** Aligns with default `SCORER_THRESHOLD` in kafka_scorer.py (border hint only). */
export const DEFAULT_ML_BORDER_THRESHOLD = 0.3

/**
 * Ticker “fraud” styling: ML flags, optional risk_score, or current ring alert (edges / cycle-internal txns).
 */
export function isTickerFraudSurface(
  txn: IngestedTransaction,
  latestAlert: FraudAlert | null,
  mlBorderThreshold = DEFAULT_ML_BORDER_THRESHOLD,
): boolean {
  if (txn.is_high_risk) return true
  if (txn.fraud_ring_id) return true
  if (txn.risk_score != null && txn.risk_score >= mlBorderThreshold) return true

  if (!latestAlert) return false

  const ringAccounts = latestAlert.cycle_accounts
  const accountSet = ringAccounts.length > 0 ? new Set(ringAccounts) : null
  if (latestAlert.edge_ids.length > 0 && latestAlert.edge_ids.includes(txn.txn_id)) return true
  if (
    accountSet &&
    accountSet.size > 0 &&
    accountSet.has(txn.source_account) &&
    accountSet.has(txn.target_account)
  ) {
    return true
  }

  return false
}
