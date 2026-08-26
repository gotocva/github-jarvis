import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/store/auth'

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const location = useLocation()

  if (!token || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return <>{children}</>
}
