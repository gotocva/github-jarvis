import { useDeferredValue, useMemo, useState } from 'react'
import {
  ChevronDown,
  ExternalLink,
  Loader2,
  Search,
  ShieldOff,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { CacheNotice } from '@/components/cache-notice'
import { EmptyState } from '@/components/empty-state'
import { InlineError } from '@/components/inline-error'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  mapWithConcurrency,
  removeCollaborator,
  removeOrgMembership,
} from '@/lib/github'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { useOrgData, type OrgUser, type RepoRole } from '@/store/org-data'

/** Stable identity so the filter memo doesn't rerun on every render. */
const NO_USERS: OrgUser[] = []

const ROLE_STYLES: Record<RepoRole, string> = {
  admin: 'border-red-500/40 text-red-600 dark:text-red-400',
  maintain: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  write: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  triage: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  read: 'border-border text-muted-foreground',
}

export function OrgUsers({
  org,
  onNavigateToRepos,
}: {
  org: string
  onNavigateToRepos?: () => void
}) {
  const { token, username } = useAuth()
  const resource = useOrgData((s) => s.users[org])
  const loadUsers = useOrgData((s) => s.loadUsers)
  const removeUserLocally = useOrgData((s) => s.removeUserLocally)

  const [query, setQuery] = useState('')
  const deferredQuery = useDeferredValue(query)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [target, setTarget] = useState<OrgUser | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)

  const users = resource?.data ?? NO_USERS
  const hasRows = users.length > 0

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (user) =>
        user.login.toLowerCase().includes(q) ||
        user.access.some((a) => a.repo.toLowerCase().includes(q)),
    )
  }, [users, deferredQuery])

  const confirmRemove = async () => {
    if (!target || !token) return
    const user = target
    setTarget(null)
    setRemoving(user.login)

    const toastId = toast.loading(
      `Removing ${user.login} from ${user.access.length} repositor${
        user.access.length === 1 ? 'y' : 'ies'
      }…`,
    )

    const failures: string[] = []
    await mapWithConcurrency(user.access, 4, async (access) => {
      try {
        await removeCollaborator(org, access.repo, user.login, token, username ?? undefined)
      } catch {
        failures.push(access.repo)
      }
    })

    let membershipRemoved = false
    let membershipError: string | null = null
    if (user.isOrgMember) {
      try {
        await removeOrgMembership(org, user.login, token, username ?? undefined)
        membershipRemoved = true
      } catch (error) {
        membershipError = error instanceof Error ? error.message : 'unknown error'
      }
    }

    setRemoving(null)

    if (failures.length === 0 && !membershipError) {
      removeUserLocally(org, user.login, username ?? undefined)
      toast.success(`${user.login} removed from ${org}`, {
        id: toastId,
        description:
          user.access.length > 0
            ? `Revoked access to ${user.access.length} repositor${
                user.access.length === 1 ? 'y' : 'ies'
              }${membershipRemoved ? ' and the organization' : ''}.`
            : membershipRemoved
              ? 'Organization membership revoked.'
              : 'Nothing to revoke.',
      })
    } else {
      toast.error(`Partially removed ${user.login}`, {
        id: toastId,
        description: [
          failures.length > 0 && `Failed on: ${failures.join(', ')}.`,
          membershipError && `Org membership: ${membershipError}.`,
          'See the Activity Log for details.',
        ]
          .filter(Boolean)
          .join(' '),
      })
    }
  }

  if (resource?.loading && users.length === 0) {
    const progress = resource.progress
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {progress && progress.total > 0
            ? `Reading collaborators — ${progress.done} of ${progress.total} repositories…`
            : 'Loading repositories and members…'}
        </p>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (resource?.error && !hasRows) {
    return <EmptyState icon={Users} title="Couldn't load users" description={resource.error} />
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No users found"
        description={`Nobody has repository access in ${org} that this token can see.`}
        action={
          onNavigateToRepos && (
            <Button variant="outline" size="sm" onClick={onNavigateToRepos}>
              View repositories
            </Button>
          )
        }
      />
    )
  }

  const sync = () => {
    if (token) void loadUsers(org, token, username ?? undefined, true)
  }

  return (
    <div className="space-y-4">
      {resource?.error && (
        <InlineError message={resource.error} onRetry={sync} />
      )}

      {resource?.fromCache && !resource?.error && (
        <CacheNotice
          cachedAt={resource.cachedAt}
          onSync={sync}
          syncing={resource.loading}
          label={`The user list for ${org}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by username or repository…"
            className="pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} of {users.length}
        </span>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead className="hidden w-32 sm:table-cell">Membership</TableHead>
              <TableHead className="hidden min-w-56 md:table-cell">Repository access</TableHead>
              <TableHead className="w-32 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((user) => {
              const isOpen = expanded === user.login
              const isSelf = user.login.toLowerCase() === username?.toLowerCase()
              return (
                <TableRow key={user.id} className="align-top">
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar className="size-8">
                        <AvatarImage src={user.avatarUrl} alt="" />
                        <AvatarFallback className="text-xs">
                          {user.login.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <a
                          href={user.htmlUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1 font-medium hover:underline"
                        >
                          {user.login}
                          <ExternalLink className="size-3 opacity-50" />
                        </a>
                        {isSelf && (
                          <p className="text-xs text-muted-foreground">That's you</p>
                        )}
                        <p className="text-xs text-muted-foreground md:hidden">
                          {user.isOrgMember ? 'Member' : 'Outside'} ·{' '}
                          {user.access.length} repo{user.access.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={user.isOrgMember ? 'secondary' : 'outline'}>
                      {user.isOrgMember ? 'Member' : 'Outside'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden whitespace-normal md:table-cell">
                    {user.access.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        No direct repository grants
                      </span>
                    ) : (
                      <div className="space-y-1.5">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : user.login)}
                          className="inline-flex items-center gap-1 text-sm hover:underline"
                        >
                          {user.access.length} repositor
                          {user.access.length === 1 ? 'y' : 'ies'}
                          <ChevronDown
                            className={cn(
                              'size-3.5 transition-transform',
                              isOpen && 'rotate-180',
                            )}
                          />
                        </button>
                        {isOpen && (
                          <div className="flex flex-wrap gap-1.5 pt-1">
                            {user.access.map((access) => (
                              <Badge
                                key={access.repo}
                                variant="outline"
                                className={cn('font-normal', ROLE_STYLES[access.role])}
                              >
                                {access.repo}
                                <span className="ml-1 opacity-70">· {access.role}</span>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={removing === user.login || isSelf}
                      onClick={() => setTarget(user)}
                    >
                      {removing === user.login ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <ShieldOff className="size-4" />
                      )}
                      Remove
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={Boolean(target)} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {target?.login} from {org}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>This revokes their access across the whole organization:</p>
                <ul className="list-inside list-disc space-y-1">
                  {target && target.access.length > 0 && (
                    <li>
                      Removed as a collaborator from {target.access.length} repositor
                      {target.access.length === 1 ? 'y' : 'ies'}
                    </li>
                  )}
                  {target?.isOrgMember && <li>Organization membership revoked</li>}
                </ul>
                <p>
                  Access granted through a team is managed by that team and will not be
                  changed here. This cannot be undone from this app.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRemove}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Remove access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
