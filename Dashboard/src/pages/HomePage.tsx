import { motion } from 'framer-motion'
import { Brain, Eye, LayoutDashboard, Network, Radio, Search, ShieldCheck, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useStreamStore } from '../store/streamStore'

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
}
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
}

const cards = [
  {
    id: '01',
    icon: Zap,
    color: 'text-fg-blue',
    title: 'Stream Ingest',
    body: 'Kafka-backed STOMP stream ingests cross-bank transactions in real-time. Each transaction carries a hashed account ID — zero PII.',
  },
  {
    id: '02',
    icon: Brain,
    color: 'text-fg-amber',
    title: 'ML Scoring',
    body: 'XGBoost/LSTM scores each transaction for fraud likelihood. SHAP values generate per-node feature attributions for forensic review.',
  },
  {
    id: '03',
    icon: Network,
    color: 'text-fg-red',
    title: 'Graph Engine',
    body: "Tarjan's SCC isolates strongly connected components. PageRank weights node centrality. Detected cycles emit as fraud alert events.",
  },
  {
    id: '04',
    icon: Eye,
    color: 'text-fg-green',
    title: 'Real-Time UI',
    body: 'Force-directed graph renders rings in red with pulsing glow. Ticker, XAI forensics, and privacy audit logs update from live stream.',
  },
]

const quickNav = [
  { to: '/', label: 'Home', icon: LayoutDashboard },
  { to: '/surveillance', label: 'Surveillance', icon: Radio },
  { to: '/investigate', label: 'Forensics', icon: Search },
  { to: '/privacy', label: 'Privacy', icon: ShieldCheck },
]

export default function HomePage() {
  const connection = useStreamStore((s) => s.connection)
  const txLen = useStreamStore((s) => s.transactions.length)
  const alertLen = useStreamStore((s) => s.fraudAlerts.length)

  const stompLabel =
    connection === 'live'
      ? 'LIVE'
      : connection === 'connecting'
        ? 'CONNECTING'
        : connection === 'reconnecting'
          ? 'RECONNECTING'
          : 'IDLE'

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="mx-auto max-w-5xl px-2 py-8"
    >
      <h1 className="font-display text-5xl font-bold tracking-tight text-zinc-100">
        Fraud<span className="text-fg-red">Graph</span>
      </h1>
      <p className="mt-3 text-lg text-zinc-400">Privacy-Preserving Cross-Bank Fraud Ring Detection — Real-Time.</p>
      <p className="mt-1 max-w-2xl text-sm text-zinc-500">
        Graph-based financial surveillance using Tarjan&apos;s SCC and PageRank to identify complex money laundering cycles
        across pseudonymized accounts.
      </p>

      <div className="mb-4 mt-12 flex items-center gap-3">
        <span className="font-mono text-xs uppercase tracking-widest text-zinc-500">Detection Pipeline</span>
        <div className="h-px flex-1 bg-zinc-800" />
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cards.map((c) => (
          <motion.div
            key={c.id}
            variants={itemVariants}
            whileHover={{ scale: 1.02, borderColor: 'var(--fg-border-hover)' }}
            whileTap={{ scale: 0.98 }}
            className="fg-card cursor-pointer p-5"
          >
            <p className="mb-3 font-mono text-xs text-fg-red">{c.id}</p>
            <c.icon size={20} className={`mb-2 ${c.color}`} />
            <p className="mb-1.5 text-sm font-semibold text-zinc-100">{c.title}</p>
            <p className="text-xs leading-relaxed text-zinc-500">{c.body}</p>
          </motion.div>
        ))}
      </motion.div>

      <div className="fg-card mt-8 flex flex-row flex-wrap items-stretch p-3">
        <div className="flex flex-1 flex-col items-center gap-0.5 py-1">
          <span className="font-mono text-xs uppercase text-zinc-500">STOMP STATUS</span>
          <span
            className={`flex items-center gap-1 font-mono text-lg font-bold ${
              connection === 'live' ? 'text-fg-green' : connection === 'idle' ? 'text-zinc-500' : 'text-fg-amber'
            }`}
          >
            {connection === 'live' ? <span className="live-dot size-2 rounded-full bg-fg-green" /> : null}
            {stompLabel}
          </span>
        </div>
        <div className="hidden h-8 w-px bg-zinc-800 sm:block" />
        <div className="flex flex-1 flex-col items-center gap-0.5 py-1">
          <span className="font-mono text-xs uppercase text-zinc-500">BUFFER SIZE</span>
          <span className="font-mono text-lg font-bold text-zinc-100">{txLen}</span>
        </div>
        <div className="hidden h-8 w-px bg-zinc-800 sm:block" />
        <div className="flex flex-1 flex-col items-center gap-0.5 py-1">
          <span className="font-mono text-xs uppercase text-zinc-500">FRAUD ALERTS</span>
          <span className="font-mono text-lg font-bold text-zinc-100">{alertLen}</span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {quickNav.map(({ to, label, icon: Icon }) => (
          <Link key={to} to={to}>
            <motion.div
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.97 }}
              className="fg-card flex cursor-pointer flex-col items-center gap-2 p-4 text-center transition-colors hover:border-zinc-600"
            >
              <Icon size={18} className="text-zinc-500" />
              <span className="text-xs font-medium text-zinc-400">{label}</span>
            </motion.div>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
