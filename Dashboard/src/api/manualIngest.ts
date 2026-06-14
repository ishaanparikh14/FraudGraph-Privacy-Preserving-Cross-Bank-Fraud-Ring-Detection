import { ingestionApiBase } from './ingestionApi'
import { readTxnIdFromIngestResponse, sha256Utf8Hex } from './injectDemoFraudRing'

export async function postTransaction(payload: Record<string, unknown>) {
  const res = await fetch(`${ingestionApiBase()}/transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) throw new Error(`POST /transaction failed: ${res.status}`)
  return res.json()
}

function randomAlnum(len: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]!
  return s
}

function randomAmount(min: number, max: number): number {
  return +(Math.random() * (max - min) + min).toFixed(2)
}

/** N unique stable labels for one inject batch (hashed by Spring → graph nodes). */
function uniqueNodeAccounts(n: number): string[] {
  const set = new Set<string>()
  while (set.size < n) {
    set.add(`MANUAL_NODE_${randomAlnum(8)}`)
  }
  return [...set]
}

const ts = () => new Date().toISOString()

/** Same idea as `simulator.choose_distinct_accounts`: random directed hop in the pool. */
function randomDistinctPair(accts: string[]): { s: string; t: string } {
  const n = accts.length
  let si = Math.floor(Math.random() * n)
  let ti = Math.floor(Math.random() * n)
  while (ti === si) ti = Math.floor(Math.random() * n)
  return { s: accts[si]!, t: accts[ti]! }
}

/**
 * Extra traffic among the N accounts — stratified into LOW / MODERATE tiers.
 * ~60% low-risk, ~40% moderate, no high-risk (those come from ring edges).
 */
function appendLiveStyleRandomEdges(posts: Promise<unknown>[], accts: string[]) {
  const N = accts.length
  const extra = Math.min(Math.max(3 * N, 24), 220)
  for (let e = 0; e < extra; e++) {
    const { s, t } = randomDistinctPair(accts)
    const isModerate = Math.random() < 0.4
    // moderate risk_score: 0.30 – 0.64; low: 0.00 – 0.29
    const risk_score = isModerate
      ? +(0.30 + Math.random() * 0.34).toFixed(3)
      : +(Math.random() * 0.29).toFixed(3)
    posts.push(
      postTransaction({
        source_account: s,
        target_account: t,
        amount: isModerate ? randomAmount(2_000, 12_000) : randomAmount(50, 4_000),
        is_high_risk: false,
        risk_score,
        timestamp: ts(),
      }),
    )
  }
}

/**
 * Manual inject: same N accounts get (1) a Hamiltonian backbone cycle, (2) many random low-risk hops
 * like the live simulator, (3) optional high-risk K-cycle + alert. Every hop → Spring → Kafka → scorer → graph.
 *
 * - ringNodes = 0: cycle + random churn, no alert.
 * - ringNodes = 1: + one high-risk hop (no alert).
 * - ringNodes >= 2: + K-cycle + POST /alerts/fraud-ring.
 * - ringNodes = totalNodes: high-risk N-cycle + same random low-risk churn among those nodes.
 */
export async function injectManual(totalNodes: number, ringNodes: number): Promise<void> {
  const N = Math.max(2, Math.min(200, Math.floor(totalNodes)))
  const K = Math.max(0, Math.min(N, Math.floor(ringNodes)))
  const accounts = uniqueNodeAccounts(N)

  const posts: Promise<unknown>[] = []

  if (K === N) {
    for (let j = 0; j < N; j++) {
      posts.push(
        postTransaction({
          source_account: accounts[j]!,
          target_account: accounts[(j + 1) % N]!,
          amount: randomAmount(10_000, 100_000),
          is_high_risk: true,
          risk_score: +(0.75 + Math.random() * 0.25).toFixed(3),
          timestamp: ts(),
        }),
      )
    }
    appendLiveStyleRandomEdges(posts, accounts)
  } else {
    for (let i = 0; i < N; i++) {
      posts.push(
        postTransaction({
          source_account: accounts[i]!,
          target_account: accounts[(i + 1) % N]!,
          amount: randomAmount(500, 15_000),
          is_high_risk: false,
          risk_score: +(Math.random() * 0.29).toFixed(3),
          timestamp: ts(),
        }),
      )
    }

    appendLiveStyleRandomEdges(posts, accounts)

    if (K >= 2) {
      for (let j = 0; j < K; j++) {
        posts.push(
          postTransaction({
            source_account: accounts[j]!,
            target_account: accounts[(j + 1) % K]!,
            amount: randomAmount(10_000, 100_000),
            is_high_risk: true,
            risk_score: +(0.75 + Math.random() * 0.25).toFixed(3),
            timestamp: ts(),
          }),
        )
      }
    } else if (K === 1) {
      posts.push(
        postTransaction({
          source_account: accounts[0]!,
          target_account: accounts[1]!,
          amount: randomAmount(10_000, 100_000),
          is_high_risk: true,
          risk_score: +(0.75 + Math.random() * 0.25).toFixed(3),
          timestamp: ts(),
        }),
      )
    }
  }

  const results = await Promise.allSettled(posts)
  const failed = results.filter((r) => r.status === 'rejected').length
  if (failed > 0) {
    throw new Error(`${failed}/${results.length} POST /transaction calls failed`)
  }

  if (K >= 2) {
    const ringLabels = accounts.slice(0, K)
    const cycle_accounts = await Promise.all(ringLabels.map((r) => sha256Utf8Hex(r)))
    const base = ingestionApiBase()
    const res = await fetch(`${base}/alerts/fraud-ring`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cycle_accounts,
        detection_method: 'MANUAL_INJECT',
        reason: 'Manual demo ring injection (K-node cycle on first K of N graph nodes)',
        edge_ids: [],
      }),
    })
    if (!res.ok) throw new Error(`POST /alerts/fraud-ring failed: ${res.status}`)
  }
}

/** @deprecated Prefer injectManual — kept for older scripts. */
export async function postBatchTransactions(count: number, _fraudCount: number) {
  const n = Math.max(1, Math.min(500, Math.floor(count)))
  for (let i = 0; i < n; i++) {
    await postTransaction({
      source_account: `ACCT_${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      target_account: `ACCT_${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
      amount: +(Math.random() * 50000).toFixed(2),
      timestamp: new Date().toISOString(),
    })
  }
}

/** @deprecated Prefer injectManual. */
export async function injectSyntheticRingAfterBatch(fraudCount: number) {
  if (fraudCount <= 0) return
  const base = ingestionApiBase()
  const labels = Array.from({ length: 3 }, (_, i) => `FG-SYN-${i}-${Math.random().toString(36).slice(2, 8)}`)
  const amount = 5000
  const edgeIds: string[] = []
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${base}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_account: labels[i],
        target_account: labels[(i + 1) % 3],
        amount,
      }),
    })
    if (!res.ok) throw new Error(`ring tx ${res.status}`)
    try {
      const tid = readTxnIdFromIngestResponse(await res.json())
      if (tid) edgeIds.push(tid)
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 80))
  }
  const cycle_accounts = await Promise.all(labels.map((l) => sha256Utf8Hex(l)))
  await fetch(`${base}/alerts/fraud-ring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cycle_accounts,
      back_edge_source: cycle_accounts[2],
      back_edge_target: cycle_accounts[0],
      edge_ids: edgeIds,
      total_amount: amount * 3,
      reason: 'Synthetic ring after manual batch',
      source: 'dashboard-manual',
      severity: 'high',
      detection_method: 'dashboard_manual_closed_cycle',
    }),
  }).then((r) => {
    if (!r.ok) throw new Error(`fraud-ring ${r.status}`)
  })
}
