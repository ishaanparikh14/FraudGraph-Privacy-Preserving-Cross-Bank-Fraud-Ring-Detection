import { motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { getSimulatorStatus, startSimulator, stopSimulator } from '../api/simulatorControl'
import { ControlBar } from '../components/surveillance/ControlBar'
import { GraphPanel } from '../components/surveillance/GraphPanel'
import { InjectDrawer } from '../components/surveillance/InjectDrawer'
import { TickerPanel } from '../components/surveillance/TickerPanel'
import { useStreamStore } from '../store/streamStore'
import type { IngestedTransaction } from '../types/fraudStream'

export default function LiveSurveillancePage() {
  const [isPaused, setIsPaused]       = useState(false)
  const [simActive, setSimActive]     = useState(false)
  const [drawerOpen, setDrawerOpen]   = useState(false)
  const [simCtlError, setSimCtlError] = useState<string | null>(null)

  const transactions = useStreamStore((s) => s.transactions)
  const fraudAlerts  = useStreamStore((s) => s.fraudAlerts)

  const frozenRef = useRef<IngestedTransaction[]>([])

  const togglePause = () => {
    if (!isPaused) frozenRef.current = transactions
    setIsPaused((p) => !p)
  }

  const displayTransactions = isPaused ? frozenRef.current : transactions

  /** Keep toggle aligned with Python control server. */
  useEffect(() => {
    let cancelled = false
    const tick = () => {
      void getSimulatorStatus()
        .then((s) => {
          if (cancelled) return
          setSimActive(Boolean(s.enabled))
          setSimCtlError(null)
        })
        .catch((e: unknown) => {
          if (cancelled) return
          setSimCtlError(e instanceof Error ? e.message : String(e))
          setSimActive(false)
        })
    }
    tick()
    const id = window.setInterval(tick, 3000)
    return () => { cancelled = true; window.clearInterval(id) }
  }, [])

  const onToggleSim = async () => {
    try {
      setSimCtlError(null)
      if (!simActive) {
        await startSimulator()
        const s = await getSimulatorStatus()
        setSimActive(Boolean(s.enabled))
      } else {
        await stopSimulator()
        setSimActive(false)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Simulator control failed'
      setSimCtlError(msg)
      try {
        const s = await getSimulatorStatus()
        setSimActive(Boolean(s.enabled))
      } catch {
        setSimActive(false)
      }
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex h-full flex-col gap-4"
    >
      {simCtlError && (
        <p className="rounded border border-amber-900/60 bg-amber-950/30 px-3 py-2 font-mono text-xs text-amber-200">
          Simulator control unreachable — run{' '}
          <span className="text-amber-100">python simulator.py</span> from{' '}
          <span className="text-amber-100">Fraud-Graph-Detection/src</span>.
          <span className="mt-1 block text-amber-200/70">{simCtlError}</span>
        </p>
      )}

      <ControlBar
        isPaused={isPaused}
        onTogglePause={togglePause}
        simActive={simActive}
        onToggleSim={() => void onToggleSim()}
        onOpenInject={() => setDrawerOpen(true)}
        onGlobalClear={() => useStreamStore.getState().reset()}
      />

      <div className="flex min-h-0 flex-1 gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        <div className="min-w-0 flex-[7]">
          <GraphPanel
            transactions={displayTransactions}
            fraudAlerts={fraudAlerts}
            isPaused={isPaused}
          />
        </div>
        <div className="min-w-0 flex-[3]">
          <TickerPanel transactions={displayTransactions} isPaused={isPaused} />
        </div>
      </div>

      <InjectDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </motion.div>
  )
}
