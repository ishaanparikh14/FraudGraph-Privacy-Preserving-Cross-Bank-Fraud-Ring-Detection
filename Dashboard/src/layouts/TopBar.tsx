import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useStreamStore } from '../store/streamStore'

const titles: Record<string, string> = {
  '/': 'Project Overview',
  '/surveillance': 'Live Surveillance',
  '/analytics': 'Analytics',
  '/investigate': 'XAI & Forensics',
  '/upload': 'Upload & Analyze',
  '/privacy': 'Security & Privacy',
}

export default function TopBar() {
  const { pathname } = useLocation()
  const count = useStreamStore((s) => s.transactions.length)
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString())

  useEffect(() => {
    const id = window.setInterval(() => setClock(new Date().toLocaleTimeString()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const base = pathname.startsWith('/investigate') ? '/investigate' : pathname
  const title = titles[base] ?? titles['/']

  return (
    <header className="fg-glass flex h-[52px] flex-shrink-0 items-center justify-between px-4">
      <h1 className="text-sm font-semibold text-zinc-100">{title}</h1>
      <div className="flex items-center gap-3">
        <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-300">{count} txns</span>
        <span className="font-mono text-xs text-zinc-500">{clock}</span>
      </div>
    </header>
  )
}
