import { BarChart3, LayoutDashboard, Radio, Search, ShieldCheck, Upload } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { ConnectionPill } from '../components/ConnectionPill'

const NAV_ITEMS = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/surveillance', icon: Radio, label: 'Live Surveillance' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/investigate', icon: Search, label: 'XAI & Forensics' },
  { to: '/upload', icon: Upload, label: 'Upload & Analyze' },
  { to: '/privacy', icon: ShieldCheck, label: 'Security & Privacy' },
]

export default function Sidebar() {
  return (
    <aside className="flex h-screen w-60 flex-shrink-0 flex-col border-r border-[var(--fg-border)] bg-[var(--fg-bg-surface)]">
      <div className="flex items-center gap-2.5 border-b border-[var(--fg-border)] px-4 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-fg-red font-mono text-sm font-bold text-white">
          FG
        </div>
        <div>
          <p className="text-sm font-semibold leading-none text-zinc-100">FraudGraph</p>
          <p className="mt-0.5 font-mono text-xs text-zinc-500">Command Center</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-2 py-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'}>
            {({ isActive }) => (
              <div
                className={`flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-all duration-150 ${
                  isActive
                    ? 'border-l-2 border-fg-red bg-zinc-800 pl-[10px] text-zinc-100'
                    : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-200'
                }`}
              >
                <item.icon size={16} />
                {item.label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[var(--fg-border)] px-4 py-4">
        <ConnectionPill />
      </div>
    </aside>
  )
}
