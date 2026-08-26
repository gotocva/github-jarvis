import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from '@/components/protected-route'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppLayout } from '@/layouts/app-layout'
import { ActivityLogPage } from '@/pages/activity-log'
import { DashboardPage } from '@/pages/dashboard'
import { GiveAccessPage } from '@/pages/give-access'
import { LoginPage } from '@/pages/login'
import { NotFoundPage } from '@/pages/not-found'
import { OrganizationPage } from '@/pages/organization'
import { RepositoryPage } from '@/pages/repository'

export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/orgs/:org" element={<OrganizationPage />} />
            <Route path="/orgs/:org/repos/:repo" element={<RepositoryPage />} />
            <Route path="/give-access" element={<GiveAccessPage />} />
            <Route path="/activity" element={<ActivityLogPage />} />
          </Route>
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors closeButton position="bottom-right" />
    </TooltipProvider>
  )
}
