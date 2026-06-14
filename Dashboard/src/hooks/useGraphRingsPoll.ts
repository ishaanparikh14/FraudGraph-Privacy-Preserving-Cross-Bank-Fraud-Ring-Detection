import { useEffect, useState } from 'react'
import { fetchRings } from '../api/fetchGraphEngine'
import type { GraphEngineRing } from '../types/graphEngine'

export function useGraphRingsPoll(opts: { enabled: boolean; intervalMs?: number }) {
  const [rings, setRings] = useState<GraphEngineRing[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!opts.enabled) {
      setRings([])
      setError(null)
      setLoading(false)
      return
    }

    let cancelled = false
    const ms = opts.intervalMs ?? 3000

    const tick = async () => {
      setLoading(true)
      try {
        const { rings: r } = await fetchRings()
        if (!cancelled) {
          setRings(r)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void tick()
    const id = window.setInterval(() => void tick(), ms)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [opts.enabled, opts.intervalMs])

  return { rings, error, loading }
}
