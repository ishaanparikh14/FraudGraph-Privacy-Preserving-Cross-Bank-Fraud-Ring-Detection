import { useEffect, useState } from 'react'
import { fetchMlHealth } from '../api/fetchExplain'
import { fetchRings } from '../api/fetchGraphEngine'
import { getSimulatorStatus } from '../api/simulatorControl'
import { useStreamStore } from '../store/streamStore'

export type BackendHealth = {
  stomp: boolean
  graph: boolean
  ml: boolean
  simulator: boolean
}

export function useBackendHealth(pollMs = 5000) {
  const stompLive = useStreamStore((s) => s.connection === 'live')
  const [remote, setRemote] = useState({ graph: false, ml: false, simulator: false })

  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      let graph = false
      let ml = false
      let simulator = false
      try {
        await fetchRings()
        graph = true
      } catch {
        graph = false
      }
      try {
        await fetchMlHealth()
        ml = true
      } catch {
        ml = false
      }
      try {
        await getSimulatorStatus()
        simulator = true
      } catch {
        simulator = false
      }
      if (!cancelled) setRemote({ graph, ml, simulator })
    }
    void tick()
    const id = window.setInterval(() => void tick(), pollMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [pollMs])

  const health: BackendHealth = {
    stomp: stompLive,
    graph: remote.graph,
    ml: remote.ml,
    simulator: remote.simulator,
  }

  return health
}
