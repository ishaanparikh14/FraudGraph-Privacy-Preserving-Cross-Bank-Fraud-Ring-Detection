import type { IngestedTransaction } from '../types/fraudStream'

export type AccountResolveResult = {
  txnId: string
  reason: string
}

/**
 * ML /explain is keyed by transaction_id. Graph "nodes" are accounts.
 * Map an account id to a representative ring edge (txn) for the same XAI pipeline.
 */
export function resolveAccountToExplainTxn(
  accountId: string,
  ringAccounts: string[],
  ringTxns: IngestedTransaction[],
  backEdgeTxnIds: ReadonlySet<string> | null,
  allTransactions: IngestedTransaction[],
): AccountResolveResult | null {
  const id = accountId.trim()
  if (!id) return null

  const inRingSet = ringAccounts.length > 0 && ringAccounts.includes(id)
  const pool: IngestedTransaction[] =
    inRingSet && ringTxns.length > 0
      ? ringTxns
      : allTransactions.filter((t) => t.source_account === id || t.target_account === id)

  if (pool.length === 0) return null

  const touches = (t: IngestedTransaction) => t.source_account === id || t.target_account === id

  if (backEdgeTxnIds?.size) {
    for (const bid of backEdgeTxnIds) {
      const be = pool.find((t) => t.txn_id === bid && touches(t))
      if (be) {
        return {
          txnId: be.txn_id,
          reason: 'DFS back-edge transaction for this account (graph engine)',
        }
      }
    }
  }

  const incident = pool.find(touches)
  if (!incident) return null

  return {
    txnId: incident.txn_id,
    reason: inRingSet
      ? 'First ring-internal edge touching this account (for ML explain)'
      : 'Recent stream edge touching this account (for ML explain)',
  }
}
