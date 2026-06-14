import type { IngestedTransaction } from '../types/fraudStream'

export function filterRingTransactions(
  transactions: IngestedTransaction[],
  cycleAccounts: string[],
): IngestedTransaction[] {
  const set = new Set(cycleAccounts)
  return transactions.filter((t) => set.has(t.source_account) && set.has(t.target_account))
}
