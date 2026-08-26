import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Loader2, Search, ShieldOff, Users } from 'lucide-react'
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
import { Checkbox } from '@/components/ui/checkbox'
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
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { mapWithConcurrency, removeCollaborator } from '@/lib/github'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import type { RepoRole } from '@/store/org-data'
import { repoKey, useRepoData, type RepoUser } from '@/store/repo-data'

/** Stable identity so the filter memo doesn't rerun on every render. */
const NO_USERS: RepoUser[] = []

const ROLE_STYLES: Record<RepoRole, string> = {
  admin: 'border-red-500/40 text-red-600 dark:text-red-400',
  maintain: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  write: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  triage: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  read: 'border-border text-muted-foreground',
}

export function RepoUsers({ org, repo }: { org: string; repo: string }) {
  const { token, username } = useAuth()
  const key = repoKey(org, repo)
  const resource = useRepoData((s) => s.users[key])
  const removeUsersLocally = useRepoData((s) => s.removeUsersLocally)
  const loadUsers = useRepoData((s) => s.loadUsers)

  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const deferredQuery = useDeferredValue(query)

  const users = resource?.data ?? NO_USERS
  const hasRows = users.length > 0
  const isSelf = (login: string) => login.toLowerCase() === username?.toLowerCase()

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (user) => user.login.toLowerCase().includes(q) || user.role.includes(q),
    )
  }, [users, deferredQuery])

  const selectable = filtered.filter((user) => !isSelf(user.login))
  const allSelected =
    selectable.length > 0 && selectable.every((u) => selected.includes(u.login))
  const someSelected = selected.length > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      const visible = new Set(selectable.map((u) => u.login))
      setSelected((prev) => prev.filter((login) => !visible.has(login)))
    } else {
      setSelected((prev) => [...new Set([...prev, ...selectable.map((u) => u.login)])])
    }
  }

  const toggle = (login: string) =>
    setSelected((prev) =>
      prev.includes(login) ? prev.filter((l) => l !== login) : [...prev, login],
    )

  const confirmRevoke = async () => {
    if (!token) return
    const logins = [...selected]
    setConfirming(false)
    setRevoking(true)
    setProgress({ done: 0, total: logins.length })

    const failures: { login: string; reason: string }[] = []
    const revoked: string[] = []

    await mapWithConcurrency(
      logins,
      4,
      async (login) => {
        try {
          await removeCollaborator(org, repo, login, token, username ?? undefined)
          revoked.push(login)
        } catch (error) {
          failures.push({
            login,
            reason: error instanceof Error ? error.message : 'Request failed',
          })
        }
      },
      (done, total) => setProgress({ done, total }),
    )

    removeUsersLocally(key, revoked, username ?? undefined)
    setSelected(failures.map((f) => f.login))
    setRevoking(false)

    if (failures.length === 0) {
      toast.success(
        `Revoked ${revoked.length} collaborator${revoked.length === 1 ? '' : 's'}`,
        { description: `No longer have access to ${org}/${repo}.` },
      )
    } else {
      toast.error(`${failures.length} of ${logins.length} revocations failed`, {
        description: failures
          .slice(0, 3)
          .map((f) => `${f.login}: ${f.reason}`)
          .join(' · '),
      })
    }
  }

  if (resource?.loading && users.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (resource?.error && !hasRows) {
    return (
      <EmptyState icon={Users} title="Couldn't load collaborators" description={resource.error} />
    )
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No collaborators"
        description={`Nobody has direct access to ${org}/${repo}.`}
      />
    )
  }

  const sync = () => {
    if (token) void loadUsers(org, repo, token, username ?? undefined, true)
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
          label={`The collaborator list for ${org}/${repo}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by username or permission…"
            className="pl-8"
          />
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} of {users.length}
        </span>
      </div>

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {selected.length} user{selected.length === 1 ? '' : 's'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={revoking}>
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={revoking}
            onClick={() => setConfirming(true)}
          >
            {revoking ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Revoking {progress.done}/{progress.total}…
              </>
            ) : (
              <>
                <ShieldOff className="size-4" />
                Revoke permission
              </>
            )}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching collaborators"
          description={`Nobody matches "${query}".`}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">
                  <Checkbox
                    checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                    onCheckedChange={toggleAll}
                    disabled={selectable.length === 0 || revoking}
                    aria-label="Select all collaborators"
                  />
                </TableHead>
                <TableHead>User</TableHead>
                <TableHead className="w-40">Permission</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((user) => {
                const self = isSelf(user.login)
                return (
                  <TableRow
                    key={user.id}
                    data-state={selected.includes(user.login) ? 'selected' : undefined}
                  >
                    <TableCell>
                      {self ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Checkbox disabled aria-label="You cannot revoke your own access" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>You can't revoke your own access</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Checkbox
                          checked={selected.includes(user.login)}
                          onCheckedChange={() => toggle(user.login)}
                          disabled={revoking}
                          aria-label={`Select ${user.login}`}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <Avatar className="size-8">
                          <AvatarImage src={user.avatarUrl} alt="" />
                          <AvatarFallback className="text-xs">
                            {user.login.slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <Link
                            to={`/orgs/${org}/users/${user.login}`}
                            className="font-medium hover:underline"
                          >
                            {user.login}
                          </Link>
                          {self && <p className="text-xs text-muted-foreground">That's you</p>}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn('capitalize', ROLE_STYLES[user.role])}
                      >
                        {user.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" asChild>
                        <a href={user.htmlUrl} target="_blank" rel="noreferrer noopener">
                          <ExternalLink className="size-4" />
                          <span className="sr-only">Open {user.login} on GitHub</span>
                        </a>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke access for {selected.length} user{selected.length === 1 ? '' : 's'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  These accounts will be removed as collaborators on{' '}
                  <span className="font-mono">{org}/{repo}</span>. Access they hold through
                  a team or through organization ownership isn't affected.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                  <ul className="space-y-0.5">
                    {selected.map((login) => (
                      <li key={login} className="font-mono text-xs">
                        {login}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Revoke permission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
