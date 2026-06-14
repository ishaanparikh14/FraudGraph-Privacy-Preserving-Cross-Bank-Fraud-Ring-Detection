import type { FraudAlert, IngestedTransaction } from '../types/fraudStream'

export interface PseudonymEntry {
  accountHash: string
  txCount: number
  lastSeen: string
  isFraudLinked: boolean
  directions: ('SOURCE' | 'TARGET')[]
}

export function pseudonymDirectory(
  transactions: IngestedTransaction[],
  fraudAlerts: FraudAlert[],
): PseudonymEntry[] {
  const fraudAccounts = new Set<string>()
  for (const a of fraudAlerts) {
    for (const id of a.cycle_accounts) fraudAccounts.add(id)
  }

  const agg = new Map<
    string,
    { txCount: number; lastSeen: string; dirs: Set<'SOURCE' | 'TARGET'>; sawFraud: boolean }
  >()

  for (const t of transactions) {
    const ts = t.timestamp
    const touch = (id: string, dir: 'SOURCE' | 'TARGET') => {
      const cur = agg.get(id) ?? {
        txCount: 0,
        lastSeen: ts,
        dirs: new Set<'SOURCE' | 'TARGET'>(),
        sawFraud: fraudAccounts.has(id),
      }
      cur.txCount += 1
      cur.dirs.add(dir)
      if (ts > cur.lastSeen) cur.lastSeen = ts
      cur.sawFraud = cur.sawFraud || fraudAccounts.has(id)
      agg.set(id, cur)
    }
    touch(t.source_account, 'SOURCE')
    touch(t.target_account, 'TARGET')
  }

  const out: PseudonymEntry[] = []
  for (const [accountHash, v] of agg) {
    out.push({
      accountHash,
      txCount: v.txCount,
      lastSeen: v.lastSeen,
      isFraudLinked: v.sawFraud,
      directions: [...v.dirs],
    })
  }
  return out.sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
}

export function formatRelativeTime(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return '—'
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
