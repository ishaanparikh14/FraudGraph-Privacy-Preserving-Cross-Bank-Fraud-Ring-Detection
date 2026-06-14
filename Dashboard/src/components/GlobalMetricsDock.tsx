import { Activity, Database, Radio, Server } from 'lucide-react'
import { useStreamStore } from '../store/streamStore'
import { useBackendHealth } from '../hooks/useBackendHealth'

function Dot({ ok, title }: { ok: boolean; title: string }) {
  return (
    <span title={title} className="flex items-center gap-1">
      <span className={`size-2 rounded-full ${ok ? 'bg-fg-green' : 'bg-fg-red'}`} />
    </span>
  )
}

export function GlobalMetricsDock() {
  const metrics = useStreamStore((s) => s.metrics)
  const health = useBackendHealth(6000)

  return (
    <footer className="flex h-9 flex-shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950/90 px-3 font-mono text-[11px] text-zinc-400 backdrop-blur-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-0.5">
        <span className="text-zinc-500">Live metrics</span>
        <span className="text-zinc-300">
          TPS{' '}
          <span className="text-fg-green">{metrics ? metrics.throughput_per_sec.toFixed(2) : '—'}</span>
        </span>
        <span>
          Total{' '}
          <span className="text-zinc-200">{metrics ? metrics.total_processed : '—'}</span>
        </span>
        <span>
          Fraud{' '}
          <span className={metrics && metrics.fraud_detected > 0 ? 'text-fg-amber' : 'text-zinc-200'}>
            {metrics ? metrics.fraud_detected : '—'}
          </span>
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="hidden text-zinc-600 sm:inline">Backends</span>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1" title="STOMP / Spring">
            <Radio size={12} className="text-zinc-600" />
            <Dot ok={health.stomp} title="STOMP stream" />
          </span>
          <span className="flex items-center gap-1" title="Graph engine">
            <Database size={12} className="text-zinc-600" />
            <Dot ok={health.graph} title="Graph engine API" />
          </span>
          <span className="flex items-center gap-1" title="ML XAI">
            <Activity size={12} className="text-zinc-600" />
            <Dot ok={health.ml} title="ML /explain" />
          </span>
          <span className="flex items-center gap-1" title="Simulator control">
            <Server size={12} className="text-zinc-600" />
            <Dot ok={health.simulator} title="Simulator :8095" />
          </span>
        </div>
      </div>
    </footer>
  )
}
