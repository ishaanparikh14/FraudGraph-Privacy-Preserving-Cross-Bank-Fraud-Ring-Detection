import { Outlet } from 'react-router-dom'
import { GlobalMetricsDock } from '../components/GlobalMetricsDock'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function AppLayout() {
  return (
    <div className="flex h-screen overflow-hidden bg-[var(--fg-bg-deepest)]">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-4">
          <Outlet />
        </main>
        <GlobalMetricsDock />
      </div>
    </div>
  )
}
