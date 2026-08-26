import { useDeferredValue, useMemo, useState } from 'react'
import {
  CalendarClock,
  GitBranch,
  Loader2,
  Lock,
  Search,
  Star,
  Trash2,
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
import { deleteBranch, mapWithConcurrency } from '@/lib/github'
import { cn, daysSince, relativeTime } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { repoKey, useRepoData, type BranchRow } from '@/store/repo-data'

/** Stable identity so the filter memo doesn't rerun on every render. */
const NO_BRANCHES: BranchRow[] = []

/** A branch untouched for this long is offered up as "stale". */
const STALE_DAYS = 90

/** Above this many branches, the per-branch commit lookup waits for a click. */
const AUTO_COMMIT_LIMIT = 40

export function RepoBranches({ org, repo }: { org: string; repo: string }) {
  const { token, username } = useAuth()
  const key = repoKey(org, repo)
  const resource = useRepoData((s) => s.branches[key])
  const commitsLoaded = useRepoData((s) => s.commitsLoaded[key])
  const loadCommitDetails = useRepoData((s) => s.loadCommitDetails)
  const loadBranches = useRepoData((s) => s.loadBranches)
  const removeBranchesLocally = useRepoData((s) => s.removeBranchesLocally)

  const [query, setQuery] = useState('')
  const [staleOnly, setStaleOnly] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const deferredQuery = useDeferredValue(query)

  const branches = resource?.data ?? NO_BRANCHES
  const hasRows = branches.length > 0
  /** The default branch and protected branches can never be deleted here. */
  const isDeletable = (branch: BranchRow) => !branch.isDefault && !branch.protected

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return branches.filter((branch) => {
      if (q && !branch.name.toLowerCase().includes(q)) return false
      if (staleOnly) {
        const age = daysSince(branch.lastCommitDate)
        if (age === null || age < STALE_DAYS) return false
      }
      return true
    })
  }, [branches, deferredQuery, staleOnly])

  const selectable = filtered.filter(isDeletable)
  const allSelected = selectable.length > 0 && selectable.every((b) => selected.includes(b.name))
  const someSelected = selected.length > 0 && !allSelected

  const toggleAll = () => {
    if (allSelected) {
      const visible = new Set(selectable.map((b) => b.name))
      setSelected((prev) => prev.filter((name) => !visible.has(name)))
    } else {
      setSelected((prev) => [...new Set([...prev, ...selectable.map((b) => b.name)])])
    }
  }

  const toggle = (name: string) =>
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    )

  const selectStale = () => {
    const stale = branches.filter((b) => {
      const age = daysSince(b.lastCommitDate)
      return isDeletable(b) && age !== null && age >= STALE_DAYS
    })
    setSelected(stale.map((b) => b.name))
    toast.info(
      stale.length === 0
        ? `No branches older than ${STALE_DAYS} days`
        : `Selected ${stale.length} branch${stale.length === 1 ? '' : 'es'} with no commits in ${STALE_DAYS}+ days`,
    )
  }

  const confirmDelete = async () => {
    if (!token) return
    const names = [...selected]
    setConfirming(false)
    setDeleting(true)
    setProgress({ done: 0, total: names.length })

    const failures: { name: string; reason: string }[] = []
    const deleted: string[] = []

    await mapWithConcurrency(
      names,
      4,
      async (name) => {
        try {
          await deleteBranch(org, repo, name, token, username ?? undefined)
          deleted.push(name)
        } catch (error) {
          failures.push({
            name,
            reason: error instanceof Error ? error.message : 'Request failed',
          })
        }
      },
      (done, total) => setProgress({ done, total }),
    )

    removeBranchesLocally(key, deleted, username ?? undefined)
    setSelected(failures.map((f) => f.name))
    setDeleting(false)

    if (failures.length === 0) {
      toast.success(`Deleted ${deleted.length} branch${deleted.length === 1 ? '' : 'es'}`, {
        description: `Removed from ${org}/${repo}.`,
      })
    } else {
      toast.error(`${failures.length} of ${names.length} deletions failed`, {
        description: failures
          .slice(0, 3)
          .map((f) => `${f.name}: ${f.reason}`)
          .join(' · '),
      })
    }
  }

  if (resource?.loading && branches.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (resource?.error && !hasRows) {
    return (
      <EmptyState icon={GitBranch} title="Couldn't load branches" description={resource.error} />
    )
  }

  if (branches.length === 0) {
    return (
      <EmptyState
        icon={GitBranch}
        title="No branches"
        description={`${org}/${repo} has no branches visible to this token.`}
      />
    )
  }

  const loadingCommits = Boolean(resource?.progress)
  const canAutoLoad = branches.length <= AUTO_COMMIT_LIMIT

  const sync = () => {
    if (token) void loadBranches(org, repo, token, username ?? undefined, true)
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
          label={`The branch list for ${org}/${repo}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter branches…"
            className="pl-8"
          />
        </div>

        {!commitsLoaded ? (
          <Button
            variant="outline"
            size="sm"
            disabled={loadingCommits || !token}
            onClick={() => token && loadCommitDetails(org, repo, token, username ?? undefined)}
          >
            {loadingCommits ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CalendarClock className="size-4" />
            )}
            {loadingCommits
              ? `${resource?.progress?.done ?? 0}/${resource?.progress?.total ?? 0}`
              : `Load commit dates (${branches.length} calls)`}
          </Button>
        ) : (
          <>
            <Button
              variant={staleOnly ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setStaleOnly((v) => !v)}
            >
              <CalendarClock className="size-4" />
              Stale only ({STALE_DAYS}d+)
            </Button>
            <Button variant="outline" size="sm" onClick={selectStale}>
              Select stale
            </Button>
          </>
        )}

        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} of {branches.length}
        </span>
      </div>

      {!commitsLoaded && !loadingCommits && canAutoLoad && (
        <p className="text-xs text-muted-foreground">
          Load commit dates to see which branches are stale — it costs one API call per
          branch, so it's not automatic.
        </p>
      )}

      {selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium tabular-nums">
            {selected.length} branch{selected.length === 1 ? '' : 'es'} selected
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSelected([])} disabled={deleting}>
            Clear
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={deleting}
            onClick={() => setConfirming(true)}
          >
            {deleting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Deleting {progress.done}/{progress.total}…
              </>
            ) : (
              <>
                <Trash2 className="size-4" />
                Delete selected
              </>
            )}
          </Button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching branches"
          description={
            staleOnly
              ? `Nothing has gone ${STALE_DAYS}+ days without a commit.`
              : `No branch names match "${query}".`
          }
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
                    disabled={selectable.length === 0 || deleting}
                    aria-label="Select all deletable branches"
                  />
                </TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="hidden w-28 sm:table-cell">Commit</TableHead>
                <TableHead className="hidden lg:table-cell">Last commit</TableHead>
                <TableHead className="hidden w-40 md:table-cell">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((branch) => {
                const deletable = isDeletable(branch)
                const age = daysSince(branch.lastCommitDate)
                return (
                  <TableRow
                    key={branch.name}
                    data-state={selected.includes(branch.name) ? 'selected' : undefined}
                  >
                    <TableCell>
                      {deletable ? (
                        <Checkbox
                          checked={selected.includes(branch.name)}
                          onCheckedChange={() => toggle(branch.name)}
                          disabled={deleting}
                          aria-label={`Select ${branch.name}`}
                        />
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex">
                              <Checkbox disabled aria-label={`${branch.name} cannot be deleted`} />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            {branch.isDefault
                              ? 'The default branch cannot be deleted'
                              : 'This branch is protected'}
                          </TooltipContent>
                        </Tooltip>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex items-center gap-2">
                        <GitBranch className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="font-medium">{branch.name}</span>
                        {branch.isDefault && (
                          <Badge variant="secondary" className="gap-1 text-[10px]">
                            <Star className="size-2.5" />
                            default
                          </Badge>
                        )}
                        {branch.protected && (
                          <Badge variant="outline" className="gap-1 text-[10px]">
                            <Lock className="size-2.5" />
                            protected
                          </Badge>
                        )}
                      </div>
                      <p className="pt-0.5 pl-5 text-xs text-muted-foreground md:hidden">
                        {branch.sha.slice(0, 7)} · {relativeTime(branch.lastCommitDate)}
                      </p>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
                      {branch.sha.slice(0, 7)}
                    </TableCell>
                    <TableCell className="hidden max-w-sm lg:table-cell">
                      {branch.lastCommitMessage ? (
                        <div className="min-w-0">
                          <p className="truncate text-sm">{branch.lastCommitMessage}</p>
                          {branch.lastCommitAuthor && (
                            <p className="truncate text-xs text-muted-foreground">
                              {branch.lastCommitAuthor}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'hidden text-sm text-muted-foreground md:table-cell',
                        age !== null && age >= STALE_DAYS && 'text-amber-600 dark:text-amber-400',
                      )}
                    >
                      {relativeTime(branch.lastCommitDate)}
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
              Delete {selected.length} branch{selected.length === 1 ? '' : 'es'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  These branches will be deleted from{' '}
                  <span className="font-mono">{org}/{repo}</span>. Unmerged commits on them
                  can only be recovered from the reflog, and this cannot be undone here.
                </p>
                <div className="max-h-40 overflow-y-auto rounded-md border p-2">
                  <ul className="space-y-0.5">
                    {selected.map((name) => (
                      <li key={name} className="font-mono text-xs">
                        {name}
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
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete branches
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
