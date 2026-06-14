import type { IngestedTransaction } from '../types/fraudStream'

export interface GraphNode {
  id: string
  isHighRisk: boolean
  isModerate: boolean   // risk_score in [0.30, 0.65)
  inRing: boolean
  centralityScore: number
  maxRiskScore: number  // highest risk_score seen on any edge touching this node
  txnId?: string
}

export interface GraphLink {
  source: string
  target: string
  inRing: boolean
  isBackEdge: boolean
  txnId: string
  riskScore?: number
}

export function buildGraphFromTransactions(
  transactions: IngestedTransaction[],
  ringAccountSet: Set<string>,
  backEdgeTxnIds: ReadonlySet<string> | null,
  centralityMap: Record<string, number>,
): { nodes: GraphNode[]; links: GraphLink[] } {
  const slice = transactions.slice(0, 500)
  const nodeMap = new Map<string, GraphNode>()
  const links: GraphLink[] = []

  for (const txn of slice) {
    const s = txn.source_account
    const t = txn.target_account
    if (!s || !t) continue

    const inRing    = ringAccountSet.size > 0 && ringAccountSet.has(s) && ringAccountSet.has(t)
    const isBackEdge = Boolean(backEdgeTxnIds?.size && backEdgeTxnIds.has(txn.txn_id))
    const rs         = txn.risk_score ?? (txn.is_high_risk ? 1.0 : 0.0)

    const makeNode = (id: string): GraphNode => ({
      id,
      isHighRisk: false,
      isModerate: false,
      inRing: ringAccountSet.has(id),
      centralityScore: centralityMap[id] ?? 0,
      maxRiskScore: 0,
    })

    if (!nodeMap.has(s)) nodeMap.set(s, makeNode(s))
    if (!nodeMap.has(t)) nodeMap.set(t, makeNode(t))

    const ns = nodeMap.get(s)!
    const nt = nodeMap.get(t)!

    // propagate risk upward — node takes worst-case of all its edges
    ns.maxRiskScore = Math.max(ns.maxRiskScore, rs)
    nt.maxRiskScore = Math.max(nt.maxRiskScore, rs)

    if (txn.is_high_risk || rs >= 0.65) {
      ns.isHighRisk = true
      nt.isHighRisk = true
    } else if (rs >= 0.30) {
      if (!ns.isHighRisk) ns.isModerate = true
      if (!nt.isHighRisk) nt.isModerate = true
    }

    ns.inRing = ns.inRing || ringAccountSet.has(s)
    nt.inRing = nt.inRing || ringAccountSet.has(t)

    links.push({ source: s, target: t, inRing, isBackEdge, txnId: txn.txn_id, riskScore: rs })
  }

  // second pass — ring membership override
  for (const l of links) {
    const a = nodeMap.get(l.source as string)
    const b = nodeMap.get(l.target as string)
    if (a) {
      a.inRing = a.inRing || (ringAccountSet.size > 0 && ringAccountSet.has(a.id))
      a.txnId  = l.txnId
    }
    if (b) {
      b.inRing = b.inRing || (ringAccountSet.size > 0 && ringAccountSet.has(b.id))
    }
  }

  return { nodes: [...nodeMap.values()], links }
}
