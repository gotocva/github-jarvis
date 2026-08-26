import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Activity,
  Building2,
  CheckCircle2,
  RefreshCw,
  UserPlus,
  XCircle,
} from 'lucide-react'
import { CacheNotice } from '@/components/cache-notice'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { listActivity, onActivity, type ActivityEntry } from '@/lib/activity-log'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useOrgStore } from '@/store/orgs'

export function DashboardPage() {
  const { user, username, token } = useAuth()
  const { orgs, loading, error, load, fromCache, cachedAt } = useOrgStore()
  const [recent, setRecent] = useState<ActivityEntry[]>([])

  useEffect(() => {
    void listActivity(100).then(setRecent)
    return onActivity((entry) => setRecent((prev) => [entry, ...prev].slice(0, 100)))
  }, [])

  const failures = recent.filter((e) => e.status === 'error').length
  const successes = recent.length - failures

  return (
    <>
      <PageHeader
        title={`Welcome back, ${user?.login ?? 'there'}`}
        description="Organizations, repository access and every API call this app makes."
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => token && load(token, username ?? undefined, true)}
            disabled={loading}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            Refresh
          </Button>
        }
      />

      {fromCache && (
        <CacheNotice
          cachedAt={cachedAt ?? undefined}
          onSync={() => token && load(token, username ?? undefined, true)}
          syncing={loading}
          label="Your organization list"
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Building2}
          label="Organizations"
          value={loading && orgs.length === 0 ? null : orgs.length}
        />
        <StatCard icon={Activity} label="Recent API calls" value={recent.length} />
        <StatCard
          icon={CheckCircle2}
          label="Successful"
          value={successes}
          tone="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={XCircle}
          label="Failed"
          value={failures}
          tone={failures > 0 ? 'text-destructive' : undefined}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your organizations</CardTitle>
          <CardDescription>
            Open one to browse its repositories and the people who can reach them.
          </CardDescription>
          <CardAction>
            <Button asChild size="sm">
              <Link to="/give-access">
                <UserPlus className="size-4" />
                Give access
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {loading && orgs.length === 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!loading && !error && orgs.length === 0 && (
            <EmptyState
              icon={Building2}
              title="No organizations"
              description="This token can't see any organizations. A classic token needs the read:org scope, and SSO-protected orgs must have the token authorized."
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((org) => (
              <Link
                key={org.id}
                to={`/orgs/${org.login}`}
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <Avatar className="size-10 rounded-md">
                  <AvatarImage src={org.avatar_url} alt="" />
                  <AvatarFallback className="rounded-md">
                    {org.login.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate font-medium">{org.login}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {org.description ?? 'No description'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest API activity</CardTitle>
          <CardDescription>The five most recent calls to GitHub.</CardDescription>
          <CardAction>
            <Button asChild variant="ghost" size="sm">
              <Link to="/activity">View all</Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-2">
          {recent.length === 0 && (
            <p className="text-sm text-muted-foreground">Nothing recorded yet.</p>
          )}
          {recent.slice(0, 5).map((entry) => (
            <div
              key={entry.id ?? `${entry.ts}-${entry.endpoint}`}
              className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
            >
              <Badge
                variant={entry.status === 'success' ? 'secondary' : 'destructive'}
                className="font-mono text-[11px]"
              >
                {entry.statusCode || 'ERR'}
              </Badge>
              <span className="truncate">{entry.label}</span>
              <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                {entry.durationMs}ms
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Activity
  label: string
  value: number | null
  tone?: string
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4">
        <div className="rounded-lg bg-muted p-2.5">
          <Icon className={cn('size-5 text-muted-foreground', tone)} />
        </div>
        <div>
          {value === null ? (
            <Skeleton className="h-7 w-10" />
          ) : (
            <p className={cn('text-2xl font-semibold tabular-nums', tone)}>{value}</p>
          )}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  )
}
