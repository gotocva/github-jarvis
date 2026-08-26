import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Building2,
  Loader2,
  Search,
  ShieldOff,
  UserX,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { useOrgData, type RepoRole } from '@/store/org-data'
import { useOrgStore } from '@/store/orgs'

const ROLE_STYLES: Record<RepoRole, string> = {
  admin: 'border-red-500/40 text-red-600 dark:text-red-400',
  maintain: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  write: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  triage: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  read: 'border-border text-muted-foreground',
}

interface AccessHit {
  /** `owner/repo`, the selection key. */
  id: string
  org: string
  repo: string
  role: RepoRole
}

interface SearchResult {
  login: string
  avatarUrl?: string
  hits: AccessHit[]
  /** Accounts where the person is an organization member, not just a collaborator. */
  memberships: string[]
  /** Accounts that couldn't be read, so the result may be incomplete. */
  skipped: string[]
}

export function RevokeAccess() {
  const { token, username } = useAuth()
  const accounts = useOrgStore((s) => s.orgs)
  const loadUsers = useOrgData((s) => s.loadUsers)
  const removeUserLocally = useOrgData((s) => s.removeUserLocally)

  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; label: string } | null>(
    null,
  )
  const [result, setResult] = useState<SearchResult | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [alsoRemoveMembership, setAlsoRemoveMembership] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [noAccounts, setNoAccounts] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revokeProgress, setRevokeProgress] = useState({ done: 0, total: 0 })

  const target = query.trim()
  const isSelf = target.toLowerCase() === username?.toLowerCase()

  /**
   * Walks every account the token can see and reads its user list — the same
   * data the org Users tab builds, so anything already visited is a cache hit.
   */
  const runSearch = async () => {
    if (!token || !target || isSelf) return
    setSearching(true)
    setResult(null)
    setSelected([])
    setNoAccounts(false)

    // Searching an empty account list would report "no access found" for
    // somebody who has plenty, so make sure there is something to search.
    let searchable = accounts
    if (searchable.length === 0) {
      setProgress({ done: 0, total: 1, label: 'accounts' })
      await useOrgStore.getState().load(token, username ?? undefined, true)
      searchable = useOrgStore.getState().orgs
      if (searchable.length === 0) {
        setProgress(null)
        setSearching(false)
        setNoAccounts(true)
        return
      }
    }

    const hits: AccessHit[] = []
    const memberships: string[] = []
    const skipped: string[] = []
    let avatarUrl: string | undefined
    let login = target

    for (const [index, account] of searchable.entries()) {
      setProgress({ done: index, total: searchable.length, label: account.login })
      try {
        // Forced: a stale list would answer "no access" for somebody who has it,
        // which is the one wrong answer this screen must not give. Conditional
        // requests make the re-read cheap when nothing has changed.
        await loadUsers(account.login, token, username ?? undefined, true)
        const users = useOrgData.getState().users[account.login]?.data
        if (!users) {
          skipped.push(account.login)
          continue
        }
        const match = users.find((u) => u.login.toLowerCase() === target.toLowerCase())
        if (!match) continue

        login = match.login
        avatarUrl ??= match.avatarUrl
        if (match.isOrgMember && !account.personal) memberships.push(account.login)
        for (const access of match.access) {
          hits.push({
            id: `${account.login}/${access.repo}`,
            org: account.login,
            repo: access.repo,
            role: access.role,
          })
        }
      } catch {
        skipped.push(account.login)
      }
    }

    setProgress(null)
    setSearching(false)
    setResult({ login, avatarUrl, hits, memberships, skipped })
    setSelected(hits.map((h) => h.id))
  }

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  const allSelected = Boolean(result && result.hits.length > 0 && selected.length === result.hits.length)

  const confirmRevoke = async () => {
    if (!token || !result) return
    const chosen = result.hits.filter((h) => selected.includes(h.id))
    const orgsToLeave = alsoRemoveMembership ? result.memberships : []

    setConfirming(false)
    setRevoking(true)
    setRevokeProgress({ done: 0, total: chosen.length + orgsToLeave.length })

    const failures: string[] = []
    const revoked: AccessHit[] = []
    let done = 0
    const step = () => setRevokeProgress((p) => ({ ...p, done: (done += 1) }))

    await mapWithConcurrency(chosen, 4, async (hit) => {
      try {
        await removeCollaborator(hit.org, hit.repo, result.login, token, username ?? undefined)
        revoked.push(hit)
      } catch (error) {
        failures.push(
          `${hit.org}/${hit.repo}: ${error instanceof Error ? error.message : 'failed'}`,
        )
      }
      step()
    })

    for (const org of orgsToLeave) {
      try {
        await removeOrgMembership(org, result.login, token, username ?? undefined)
      } catch (error) {
        failures.push(`${org} membership: ${error instanceof Error ? error.message : 'failed'}`)
      }
      step()
    }

    // Keep the cached org user lists in step with what we just removed.
    const fullyCleared = new Set(
      [...new Set(revoked.map((h) => h.org))].filter((org) =>
        result.hits.filter((h) => h.org === org).every((h) => revoked.includes(h)),
      ),
    )
    for (const org of fullyCleared) {
      removeUserLocally(org, result.login, username ?? undefined)
    }

    setRevoking(false)
    const remaining = result.hits.filter((h) => !revoked.includes(h))
    setResult({ ...result, hits: remaining, memberships: failures.length ? result.memberships : [] })
    setSelected(remaining.map((h) => h.id))

    if (failures.length === 0) {
      toast.success(`Revoked ${revoked.length} grant${revoked.length === 1 ? '' : 's'}`, {
        description: `${result.login} no longer has access to ${revoked.length} repositor${revoked.length === 1 ? 'y' : 'ies'}.`,
      })
    } else {
      toast.error(`${failures.length} revocation${failures.length === 1 ? '' : 's'} failed`, {
        description: failures.slice(0, 3).join(' · '),
      })
    }
  }

  const byOrg = (result?.hits ?? []).reduce<Record<string, AccessHit[]>>((acc, hit) => {
    ;(acc[hit.org] ??= []).push(hit)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Find a user's access</CardTitle>
          <CardDescription>
            Reads every organization and personal repository this token can see — live,
            not from cache — and lists everything the account can reach.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void runSearch()
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="min-w-56 flex-1 space-y-2">
              <Label htmlFor="revoke-username">GitHub username</Label>
              <Input
                id="revoke-username"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="octocat"
                autoCapitalize="none"
                spellCheck={false}
                disabled={searching}
              />
            </div>
            <Button type="submit" disabled={!target || searching || isSelf}>
              {searching ? <Loader2 className="animate-spin" /> : <Search className="size-4" />}
              {searching ? 'Searching…' : 'Search'}
            </Button>
          </form>

          {isSelf && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>That's your own account</AlertTitle>
              <AlertDescription>
                Revoking your own access would lock you out of this app. Search for
                somebody else.
              </AlertDescription>
            </Alert>
          )}

          {progress && (
            <div className="space-y-1.5">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Reading {progress.label} — {progress.done} of {progress.total} accounts…
              </p>
            </div>
          )}

          {noAccounts && (
            <Alert variant="destructive">
              <AlertCircle className="size-4" />
              <AlertTitle>Nothing to search</AlertTitle>
              <AlertDescription>
                This token can't see any organizations or personal repositories, so there
                is nowhere to look. Check the token's scopes and try again.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {result && result.hits.length === 0 && (
        <EmptyState
          icon={UserX}
          title={`No access found for ${result.login}`}
          description={
            result.skipped.length > 0
              ? `${result.skipped.join(', ')} could not be read, so this answer is incomplete.`
              : `${result.login} is not a collaborator on any repository this token can see.`
          }
        />
      )}

      {result && result.hits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <Avatar className="size-7">
                <AvatarImage src={result.avatarUrl} alt="" />
                <AvatarFallback className="text-[10px]">
                  {result.login.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              {result.login}
              <Badge variant="secondary">
                {result.hits.length} repositor{result.hits.length === 1 ? 'y' : 'ies'}
              </Badge>
              {Object.keys(byOrg).length > 1 && (
                <Badge variant="outline">{Object.keys(byOrg).length} accounts</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Everything selected below will be revoked in one pass.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.skipped.length > 0 && (
              <Alert>
                <AlertCircle className="size-4" />
                <AlertTitle>Partial search</AlertTitle>
                <AlertDescription>
                  {result.skipped.join(', ')} could not be read, so this list may be
                  incomplete.
                </AlertDescription>
              </Alert>
            )}

            <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
              <Checkbox
                checked={allSelected ? true : selected.length > 0 ? 'indeterminate' : false}
                onCheckedChange={() =>
                  setSelected(allSelected ? [] : result.hits.map((h) => h.id))
                }
                disabled={revoking}
                aria-label="Select all repositories"
              />
              <span className="text-sm font-medium tabular-nums">
                {selected.length} of {result.hits.length} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                className="ml-auto"
                disabled={revoking || selected.length === 0}
                onClick={() => setConfirming(true)}
              >
                {revoking ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Revoking {revokeProgress.done}/{revokeProgress.total}…
                  </>
                ) : (
                  <>
                    <ShieldOff className="size-4" />
                    Revoke access
                  </>
                )}
              </Button>
            </div>

            {result.memberships.length > 0 && (
              <label className="flex items-start gap-2.5 rounded-md border p-3 text-sm">
                <Checkbox
                  checked={alsoRemoveMembership}
                  onCheckedChange={(v) => setAlsoRemoveMembership(v === true)}
                  disabled={revoking}
                  className="mt-0.5"
                />
                <span>
                  <span className="font-medium">Also remove organization membership</span>
                  <span className="block text-muted-foreground">
                    {result.login} is a member of {result.memberships.join(', ')}. Without
                    this they keep membership and any access it grants.
                  </span>
                </span>
              </label>
            )}

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead className="hidden w-48 sm:table-cell">Account</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead className="w-28">Permission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.hits.map((hit) => (
                    <TableRow
                      key={hit.id}
                      data-state={selected.includes(hit.id) ? 'selected' : undefined}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.includes(hit.id)}
                          onCheckedChange={() => toggle(hit.id)}
                          disabled={revoking}
                          aria-label={`Select ${hit.id}`}
                        />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Building2 className="size-3.5" />
                          {hit.org}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        <Link
                          to={`/orgs/${hit.org}/repos/${hit.repo}?tab=users`}
                          className="font-medium hover:underline"
                        >
                          {hit.repo}
                        </Link>
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          {hit.org}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn('capitalize', ROLE_STYLES[hit.role])}>
                          {hit.role}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Revoke {selected.length} grant{selected.length === 1 ? '' : 's'} for{' '}
              {result?.login}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  They will be removed as a collaborator from {selected.length} repositor
                  {selected.length === 1 ? 'y' : 'ies'}
                  {alsoRemoveMembership && result && result.memberships.length > 0
                    ? `, and removed from ${result.memberships.join(', ')}`
                    : ''}
                  . Access granted through a team is managed by that team and is not
                  changed here.
                </p>
                <p>This cannot be undone from this app.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmRevoke}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Revoke access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
