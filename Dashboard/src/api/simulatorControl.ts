function simBase(): string {
  const v = import.meta.env.VITE_SIMULATOR_CONTROL_URL
  if (typeof v === 'string' && v.trim()) return v.trim().replace(/\/$/, '')
  return '/simulator-control'
}

export type SimulatorStatusJson = {
  enabled?: boolean
  auto_start?: boolean
  tx_per_second?: number
  fraud_interval_seconds?: number
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return { raw: text }
  }
}

export async function getSimulatorStatus(): Promise<SimulatorStatusJson> {
  const url = `${simBase()}/status`
  const res = await fetch(url)
  const body = await readJson(res)
  if (!res.ok) {
    throw new Error(`Simulator status HTTP ${res.status}: ${JSON.stringify(body)}`)
  }
  return (body && typeof body === 'object' ? body : {}) as SimulatorStatusJson
}

export async function startSimulator(): Promise<SimulatorStatusJson> {
  const res = await fetch(`${simBase()}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await readJson(res)
  if (!res.ok) {
    throw new Error(`POST /start failed (${res.status}): ${JSON.stringify(body)}`)
  }
  return (body && typeof body === 'object' ? body : {}) as SimulatorStatusJson
}

export async function stopSimulator(): Promise<SimulatorStatusJson> {
  const res = await fetch(`${simBase()}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await readJson(res)
  if (!res.ok) {
    throw new Error(`POST /stop failed (${res.status}): ${JSON.stringify(body)}`)
  }
  return (body && typeof body === 'object' ? body : {}) as SimulatorStatusJson
}
