import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { StreamBootstrap } from './components/StreamBootstrap'
import AppLayout from './layouts/AppLayout'
import AnalyticsPage from './pages/AnalyticsPage'
import HomePage from './pages/HomePage'
import InvestigatePage from './pages/InvestigatePage'
import LiveSurveillancePage from './pages/LiveSurveillancePage'
import PrivacyPage from './pages/PrivacyPage'
import UploadPage from './pages/UploadPage'

export default function App() {
  return (
    <BrowserRouter>
      <StreamBootstrap />
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/surveillance" element={<LiveSurveillancePage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
          <Route path="/investigate" element={<InvestigatePage />} />
          <Route path="/investigate/:txnId" element={<InvestigatePage />} />
          <Route path="/upload" element={<UploadPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
