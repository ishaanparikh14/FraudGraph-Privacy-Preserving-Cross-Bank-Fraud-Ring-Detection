import type { FraudAlert, IngestedTransaction } from '../types/fraudStream'

export type RiskLevel = 'high' | 'moderate' | 'low'

/**
 * Derives a 3-tier risk level for a transaction.
 *
 * Tiers:
 *  high     — is_high_risk flag, fraud_ring_id, or risk_score >= 0.65, or in active ring alert
 *  moderate — risk_score >= 0.30 (or is_moderate flag), not already high
 *  low      — everything else
 */
export function getRiskLevel(
  txn: IngestedTransaction,
  latestAlert: FraudAlert | null = null,
): RiskLevel {
  // Explicit high-risk markers
  if (txn.is_high_risk) return 'high'
  if (txn.fraud_ring_id) return 'high'
  if (txn.risk_score != null && txn.risk_score >= 0.65) return 'high'

  // Ring alert overlap
  if (latestAlert) {
    if (latestAlert.edge_ids.length > 0 && latestAlert.edge_ids.includes(txn.txn_id)) return 'high'
    const accounts = latestAlert.cycle_accounts
    if (
      accounts.length > 0 &&
      accounts.includes(txn.source_account) &&
      accounts.includes(txn.target_account)
    ) return 'high'
  }

  // Moderate band
  if (txn.risk_score != null && txn.risk_score >= 0.30) return 'moderate'

  // Check is_moderate flag (injected by manual inject)
  const ext = txn as IngestedTransaction & { is_moderate?: boolean }
  if (ext.is_moderate) return 'moderate'

  return 'low'
}

/** Badge config keyed by risk level */
export const RISK_BADGE = {
  high: {
    label: 'HIGH RISK',
    border: 'border-red-800',
    bg: 'bg-red-950/50',
    text: 'text-red-400',
    dot: 'bg-red-500',
    rowBorder: 'border-red-500/70',
  },
  moderate: {
    label: 'MODERATE',
    border: 'border-amber-800',
    bg: 'bg-amber-950/40',
    text: 'text-amber-400',
    dot: 'bg-amber-400',
    rowBorder: 'border-amber-500/60',
  },
  low: {
    label: 'LOW RISK',
    border: 'border-emerald-900',
    bg: 'bg-emerald-950/30',
    text: 'text-emerald-500',
    dot: 'bg-emerald-500',
    rowBorder: 'border-zinc-700/50',
  },
} as const satisfies Record<RiskLevel, {
  label: string
  border: string
  bg: string
  text: string
  dot: string
  rowBorder: string
}>
