import { motion } from 'framer-motion'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  amountDistribution,
  bucketVolumeOverTime,
  fraudRatioStats,
  topAccountsByVolume,
  VOLUME_WINDOW_MS,
} from '../lib/analyticsDerivations'
import { detectionMethodTooltip, fraudAlertDetectionLabel } from '../lib/fraudAlertDetectionLabel'
import { formatRelativeTime } from '../lib/sessionAnalytics'
import { useStreamStore } from '../store/streamStore'

const FRAUD_RATIO_WARN = 20

const CHART_COLORS = {
  zinc: '#52525b',
  cyan: '#22d3ee',
  amber: '#f59e0b',
  red: '#ef4444',
}

export default function AnalyticsPage() {
  const navigate = useNavigate()
  const transactions = useStreamStore((s) => s.transactions)
  const fraudAlerts = useStreamStore((s) => s.fraudAlerts)
  const latestAlert = fraudAlerts[0] ?? null

  const volumeData = useMemo(
    () => bucketVolumeOverTime(transactions, VOLUME_WINDOW_MS, latestAlert),
    [transactions, latestAlert],
  )
  const ratio = useMemo(() => fraudRatioStats(transactions, latestAlert), [transactions, latestAlert])
  const amounts = useMemo(() => amountDistribution(transactions), [transactions])
  const topAccts = useMemo(() => topAccountsByVolume(transactions, 10), [transactions])

  const gaugeData = useMemo(() => {
    const safeTotal = Math.max(ratio.total, 1)
    const rest = safeTotal - ratio.fraud
    return [
      { name: 'flagged', value: ratio.fraud, fill: ratio.pct > FRAUD_RATIO_WARN ? CHART_COLORS.red : CHART_COLORS.amber },
      { name: 'other', value: Math.max(rest, 0), fill: CHART_COLORS.zinc },
    ]
  }, [ratio])

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 pb-2">
      <div className="fg-card border border-zinc-800 p-4">
        <h2 className="font-display text-lg font-semibold text-zinc-100">Stream analytics</h2>
        <p className="mt-1 font-mono text-xs text-zinc-500">
          Derived live from the transaction buffer ({transactions.length} txns). “Flagged” matches the ticker: ingest{' '}
          <span className="text-zinc-400">is_fraud_flag</span>, the latest STOMP ring alert (<span className="text-zinc-400">edge_ids</span> /
          cycle-internal edges), and buffered <span className="text-zinc-400">risk_score</span> when present. Live sim often sends no ingest flag —
          use ring alert + buffer overlap to see non-zero fraud ratio.
        </p>
      </div>

      <div className="fg-card border border-zinc-800 p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-zinc-100">Fraud ring alerts (session)</h2>
          <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-500">{fraudAlerts.length}</span>
        </div>
        <p className="mb-3 font-mono text-[11px] leading-relaxed text-zinc-600">
          Same STOMP feed as Security &amp; Privacy. Labels match <span className="text-zinc-500">detection_method</span> from JSON (e.g.{' '}
          <span className="text-zinc-400">tarjan_scc</span> → <span className="text-zinc-400">Tarjan&apos;s SCC</span>) or a short inference from{' '}
          <span className="text-zinc-500">reason</span> when the field is absent.
        </p>
        {fraudAlerts.length === 0 ? (
          <p className="py-6 text-center font-mono text-xs text-zinc-600">No alerts in this session yet.</p>
        ) : (
          <div className="max-h-[min(280px,40vh)] overflow-auto rounded border border-zinc-800">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-zinc-900/90 font-mono uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2">Alert</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Detection</th>
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">When</th>
                </tr>
              </thead>
              <tbody>
                {fraudAlerts.map((a) => {
                  const algo = fraudAlertDetectionLabel(a)
                  return (
                    <tr
                      key={a.alert_id}
                      className="cursor-pointer border-t border-zinc-800 text-zinc-300 transition-colors hover:bg-zinc-900/50"
                      onClick={() => {
                        const e = a.edge_ids[0]
                        if (e) void navigate(`/investigate/${encodeURIComponent(e)}`)
                        else void navigate('/investigate')
                      }}
                    >
                      <td className="px-3 py-2 font-mono text-zinc-400">
                        {a.alert_id.length <= 14 ? a.alert_id : `${a.alert_id.slice(0, 12)}…`}
                      </td>
                      <td className="px-3 py-2 font-mono text-zinc-500">{a.cycle_accounts.length}</td>
                      <td className="px-3 py-2">
                        {algo === '—' ? (
                          <span className="font-mono text-[10px] text-zinc-600">—</span>
                        ) : (
                          <span
                            className="rounded border border-fg-red/25 bg-red-950/35 px-1.5 py-0.5 font-mono text-[10px] text-fg-red"
                            title={detectionMethodTooltip(a)}
                          >
                            {algo}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">{a.source ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-zinc-500">
                        {a.timestamp ? formatRelativeTime(a.timestamp) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="fg-card min-h-[280px] border border-zinc-800 p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500">Volume / 10s</h3>
          {volumeData.length === 0 ? (
            <p className="py-12 text-center font-mono text-xs text-zinc-600">No timestamps yet — start the stream or inject.</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={volumeData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 10 }} />
                <YAxis tick={{ fill: '#71717a', fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="total" name="All txns" stroke={CHART_COLORS.cyan} dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="highRisk" name="Flagged" stroke={CHART_COLORS.amber} dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="fg-card flex min-h-[280px] flex-col border border-zinc-800 p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500">Fraud ratio</h3>
          {ratio.total === 0 ? (
            <p className="flex flex-1 items-center justify-center font-mono text-xs text-zinc-600">No transactions buffered.</p>
          ) : (
            <div className="flex flex-1 flex-row items-center justify-center gap-6">
              <ResponsiveContainer width={200} height={200}>
                <PieChart>
                  <Pie
                    data={gaugeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={58}
                    outerRadius={78}
                    stroke="none"
                  >
                    {gaugeData.map((e, idx) => (
                      <Cell key={idx} fill={e.fill} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => [v as number, 'count']} />
                </PieChart>
              </ResponsiveContainer>
              <div>
                <p className={`font-display text-4xl font-bold ${ratio.pct > FRAUD_RATIO_WARN ? 'text-fg-red' : 'text-zinc-100'}`}>
                  {ratio.pct.toFixed(1)}%
                </p>
                <p className="font-mono text-xs text-zinc-500">
                  {ratio.fraud} / {ratio.total} flagged in buffer
                </p>
                {ratio.pct > FRAUD_RATIO_WARN ? (
                  <p className="mt-2 font-mono text-[11px] text-fg-red/90">&gt; {FRAUD_RATIO_WARN}% — spike visible</p>
                ) : null}
              </div>
            </div>
          )}
        </div>

        <div className="fg-card min-h-[260px] border border-zinc-800 p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500">Amount distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={amounts}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="range" tick={{ fill: '#71717a', fontSize: 10 }} />
              <YAxis tick={{ fill: '#71717a', fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }} />
              <Bar dataKey="count" fill={CHART_COLORS.cyan} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="fg-card min-h-[260px] border border-zinc-800 p-4">
          <h3 className="mb-2 font-mono text-xs uppercase tracking-widest text-zinc-500">Top accounts (appearances)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart layout="vertical" data={topAccts} margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#71717a', fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="account" width={100} tick={{ fill: '#a1a1aa', fontSize: 9 }} />
              <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', fontSize: 11 }} />
              <Bar dataKey="count" fill={CHART_COLORS.amber} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  )
}
