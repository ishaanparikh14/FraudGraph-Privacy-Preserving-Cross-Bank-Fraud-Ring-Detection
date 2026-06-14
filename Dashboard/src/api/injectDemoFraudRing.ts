import { ingestionApiBase } from './ingestionApi'

export async function sha256Utf8Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export function readTxnIdFromIngestResponse(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const o = body as Record<string, unknown>
  const top = o.transaction_id
  if (typeof top === 'string' && top.trim()) return top.trim()
  const data = o.data
  if (data && typeof data === 'object') {
    const tid = (data as Record<string, unknown>).transaction_id
    if (typeof tid === 'string' && tid.trim()) return tid.trim()
  }
  return null
}

export async function postFraudRingAlert(cycleAccounts: string[], detectionMethod = 'TARJAN_SCC') {
  const res = await fetch(`${ingestionApiBase()}/alerts/fraud-ring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cycle_accounts: cycleAccounts,
      detection_method: detectionMethod,
      reason: 'Manual demo injection',
      edge_ids: [],
    }),
  })
  if (!res.ok) throw new Error(`POST /alerts/fraud-ring failed: ${res.status}`)
  return res.json()
}

const DEMO_RING_RAW = ['fg-dash-a', 'fg-dash-b', 'fg-dash-c'] as const

/** 3-cycle + STOMP alert — matches Spring hashed accounts. */
export async function injectDemoFraudRing(): Promise<void> {
  const base = ingestionApiBase()
  const amount = 7500
  const edgeIds: string[] = []

  for (let i = 0; i < DEMO_RING_RAW.length; i++) {
    const source_account = DEMO_RING_RAW[i]
    const target_account = DEMO_RING_RAW[(i + 1) % DEMO_RING_RAW.length]
    const res = await fetch(`${base}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_account, target_account, amount }),
    })
    if (!res.ok) throw new Error(`POST /transaction ${res.status}`)
    try {
      const tid = readTxnIdFromIngestResponse(await res.json())
      if (tid) edgeIds.push(tid)
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 100))
  }

  const cycle_accounts = await Promise.all(DEMO_RING_RAW.map((x) => sha256Utf8Hex(x)))
  await fetch(`${base}/alerts/fraud-ring`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cycle_accounts,
      back_edge_source: cycle_accounts[2],
      back_edge_target: cycle_accounts[0],
      edge_ids: edgeIds,
      total_amount: amount * DEMO_RING_RAW.length,
      reason: 'Dashboard preset ring',
      source: 'dashboard',
      severity: 'high',
      detection_method: 'dashboard_preset_ring',
    }),
  }).then((r) => {
    if (!r.ok) throw new Error(`fraud-ring ${r.status}`)
  })
}
