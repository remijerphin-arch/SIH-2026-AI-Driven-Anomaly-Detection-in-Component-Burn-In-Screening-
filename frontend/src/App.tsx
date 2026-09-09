import { Navigate, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { LandingPage } from '@/pages/LandingPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { ComponentsPage } from '@/pages/ComponentsPage'
import { ComponentDetailPage } from '@/pages/ComponentDetailPage'
import { BurnInPage } from '@/pages/BurnInPage'
import { AnomalyPage } from '@/pages/AnomalyPage'
import { PredictionPage } from '@/pages/PredictionPage'
import { AnalyticsPage } from '@/pages/AnalyticsPage'
import { UploadPage } from '@/pages/UploadPage'
import { ReportsPage } from '@/pages/ReportsPage'
import { ReportViewPage } from '@/pages/ReportViewPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route element={<AppLayout />}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/components" element={<ComponentsPage />} />
        <Route path="/components/:id" element={<ComponentDetailPage />} />
        <Route path="/burn-in" element={<BurnInPage />} />
        <Route path="/anomaly" element={<AnomalyPage />} />
        <Route path="/prediction" element={<PredictionPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/upload" element={<UploadPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/reports/:id" element={<ReportViewPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
