import { useStreamStore } from '../store/streamStore'

const styles: Record<string, string> = {
  idle: 'bg-zinc-700 text-zinc-200',
  connecting: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500/40',
  live: 'bg-fg-green/15 text-fg-green ring-1 ring-fg-green/30',
  reconnecting: 'bg-fg-amber/25 text-fg-amber ring-1 ring-fg-amber/50',
}

const labels: Record<string, string> = {
  idle: 'IDLE',
  connecting: 'CONNECTING',
  live: 'LIVE',
  reconnecting: 'RECONNECTING',
}

export function ConnectionPill() {
  const connection = useStreamStore((s) => s.connection)
  const streamError = useStreamStore((s) => s.streamError)

  return (
    <div className="space-y-1">
      <div
        className={`fg-card inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs ${styles[connection]}`}
      >
        <span
          className={`size-1.5 rounded-full ${connection === 'live' ? 'live-dot bg-fg-green' : connection === 'connecting' ? 'bg-blue-400' : connection === 'reconnecting' ? 'bg-fg-amber' : 'bg-zinc-500'}`}
        />
        <span className="font-mono">{labels[connection]}</span>
      </div>
      {streamError ? (
        <p className="font-mono text-[11px] text-fg-red" title={streamError}>
          {streamError}
        </p>
      ) : null}
    </div>
  )
}
