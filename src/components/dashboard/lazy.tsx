import { lazy, Suspense } from 'react'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Recharts and react-day-picker are only needed on a Dashboard tab, so they load
 * on demand rather than in the initial bundle.
 */
const RepoDashboardImpl = lazy(() =>
  import('@/components/repo-dashboard').then((m) => ({ default: m.RepoDashboard })),
)

const UserDashboardImpl = lazy(() =>
  import('@/components/user-dashboard').then((m) => ({ default: m.UserDashboard })),
)

function DashboardFallback() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-72" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  )
}

export function RepoDashboard(props: { org: string; repo: string }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <RepoDashboardImpl {...props} />
    </Suspense>
  )
}

export function UserDashboard(props: { org: string; login: string }) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <UserDashboardImpl {...props} />
    </Suspense>
  )
}
