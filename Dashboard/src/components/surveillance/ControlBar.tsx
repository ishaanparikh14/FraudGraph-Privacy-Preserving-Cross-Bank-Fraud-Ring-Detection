import { AnimatePresence, motion } from 'framer-motion'

export type ControlBarProps = {
  isPaused: boolean
  onTogglePause: () => void
  simActive: boolean
  onToggleSim: () => void
  onOpenInject: () => void
  onGlobalClear: () => void
}

export function ControlBar({
  isPaused,
  onTogglePause,
  simActive,
  onToggleSim,
  onOpenInject,
  onGlobalClear,
}: ControlBarProps) {
  return (
    <div className="fg-card flex flex-wrap items-center gap-4 px-4 py-3">

      {/* ── live injection toggle ── */}
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">Live Injection</span>
        <button
          type="button"
          onClick={onToggleSim}
          className={`relative h-5 w-10 rounded-full transition-colors duration-200 ${simActive ? 'bg-fg-green' : 'bg-zinc-700'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${simActive ? 'translate-x-5' : 'translate-x-0.5'}`}
          />
        </button>
        <span className={`font-mono text-xs ${simActive ? 'text-fg-green' : 'text-zinc-500'}`}>
          {simActive ? 'ACTIVE' : 'IDLE'}
        </span>
      </div>

      <div className="h-6 w-px bg-zinc-800" />

      {/* ── manual inject button ── */}
      <motion.button
        type="button"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.96 }}
        onClick={onOpenInject}
        className="flex items-center gap-2 rounded-lg border border-red-900 bg-red-950/30 px-3.5 py-1.5 font-mono text-xs font-semibold text-red-400 transition-all hover:border-red-700 hover:bg-red-900/40 hover:text-red-300"
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
          <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M5.5 3v5M3 5.5h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
        Manual Inject
      </motion.button>

      {/* ── spacer ── */}
      <div className="ml-auto flex items-center gap-2">

        {/* pause / play */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onTogglePause}
          className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-800/80 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-all hover:border-zinc-500"
        >
          <AnimatePresence mode="wait">
            {isPaused ? (
              <motion.span key="play" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                ▶ RESUME
              </motion.span>
            ) : (
              <motion.span key="pause" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                ⏸ PAUSE
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

        {/* global clear */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.96 }}
          onClick={onGlobalClear}
          className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-500 transition-all hover:border-red-900/60 hover:text-red-400"
        >
          ⊗ Clear All
        </motion.button>
      </div>
    </div>
  )
}
