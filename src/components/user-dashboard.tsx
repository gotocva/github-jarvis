import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, FolderGit2, Loader2, RefreshCw } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { MultiSelect, type MultiSelectOption } from '@/components/multi-select'
import { AnalyticsView } from '@/components/dashboard/analytics-view'
import { DateRangePicker, presetRange, RANGE_PRESETS } from '@/components/date-range-picker'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  slicesByRepository,
  type DateRange,
  type RepoStats,
  type Slice,
} from '@/lib/analytics'
import { useAuth } from '@/store/auth'
import { useOrgData } from '@/store/org-data'
import { statsKey, useStats } from '@/store/stats'

const DEFAULT_PRESET = RANGE_PRESETS.find((p) => p.id === '1y')!

export function UserDashboard({ org, login }: { org: string; login: string }) {
  const { token, username } = useAuth()
  const orgUsersResource = useOrgData((s) => s.users[org])
  const orgUsers = orgUsersResource?.data
  const orgRepos = useOrgData((s) => s.repos[org]?.data)
  const loadUsers = useOrgData((s) => s.loadUsers)
  const { byRepo, progress, pending, loadRepos } = useStats()

  const [range, setRange] = useState<DateRange>(() => presetRange(DEFAULT_PRESET))
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id)
  const [selected, setSelected] = useState<string[]>([])

  // The org user list tells us which repositories this person can even reach,
  // which keeps the fan-out to those rather than every repo in the org.
  useEffect(() => {
    if (token) void loadUsers(org, token, username ?? undefined)
  }, [org, token, username, loadUsers])

  const candidateRepos = useMemo(() => {
    const match = orgUsers?.find((u) => u.login.toLowerCase() === login.toLowerCase())
    if (match && match.access.length > 0) return match.access.map((a) => a.repo)
    return (orgRepos ?? []).map((r) => r.name)
  }, [orgUsers, orgRepos, login])

  useEffect(() => {
    if (token && candidateRepos.length > 0) {
      void loadRepos(org, candidateRepos, token, username ?? undefined)
    }
  }, [org, candidateRepos, token, username, loadRepos])

  const stats = useMemo<RepoStats[]>(
    () =>
      candidateRepos
        .map((repo) => ({ repo, contributors: byRepo[statsKey(org, repo)]?.data }))
        .filter((s): s is RepoStats => Array.isArray(s.contributors)),
    [candidateRepos, byRepo, org],
  )

  const allSlices = useMemo(
    () => slicesByRepository(stats, login, range),
    [stats, login, range],
  )

  const options = useMemo<MultiSelectOption[]>(
    () =>
      allSlices.map((s) => ({
        value: s.key,
        label: s.label,
        description: `${s.commits} commits`,
      })),
    [allSlices],
  )

  const slices = useMemo(
    () => (selected.length === 0 ? allSlices : allSlices.filter((s) => selected.includes(s.key))),
    [allSlices, selected],
  )

  const scoping = Boolean(orgUsersResource?.loading)
  const loading =
    scoping || Boolean(progress) || (stats.length === 0 && candidateRepos.length > 0)

  /** Re-scopes as well as re-reads: the repo list itself may have been what failed. */
  const sync = () => {
    if (!token) return
    void loadUsers(org, token, username ?? undefined, true)
    if (candidateRepos.length > 0) {
      void loadRepos(org, candidateRepos, token, username ?? undefined, true)
    }
  }

  if (loading && stats.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {progress
            ? `Reading contribution statistics — ${progress.done} of ${progress.total} repositories…`
            : 'Working out which repositories to read…'}
        </p>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    )
  }

  // Without a repository list there is nothing to read statistics from, and the
  // Sync button would otherwise appear to do nothing.
  if (!loading && candidateRepos.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No repositories to analyse"
        description={
          orgUsersResource?.error ??
          `No repositories in ${org} are visible to this token, so there is nothing to chart.`
        }
        action={
          <Button variant="outline" size="sm" onClick={sync}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        }
      />
    )
  }

  if (!loading && allSlices.length === 0 && !range.from) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No commits found"
        description={`GitHub reports no commits by ${login} in the repositories this token can read.`}
        action={
          <Button variant="outline" size="sm" onClick={sync}>
            <RefreshCw className="size-4" />
            Reload
          </Button>
        }
      />
    )
  }

  return (
    <>
      {pending.length > 0 && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
          GitHub is still building statistics for {pending.length} repositor
          {pending.length === 1 ? 'y' : 'ies'} ({pending.join(', ')}). Sync again shortly to
          include them.
        </p>
      )}

      <AnalyticsView
        slices={slices}
        loading={loading}
        copy={{
          entityLabel: 'Repository',
          entityPlural: 'Repositories',
          entityIcon: FolderGit2,
          rankTitle: 'Commits by repository',
          rankDescription: `Where ${login} contributes most, highest first.`,
          changesTitle: 'Code changed by repository',
          changesDescription: 'Lines added and removed, largest footprint first.',
          tableTitle: 'Repository breakdown',
          tableDescription: `Every repository ${login} committed to in the selected range.`,
          timelineDescription: `Weekly commits by ${login} across the selected repositories.`,
        }}
        renderTableLabel={(slice: Slice) => (
          <Link
            to={`/orgs/${org}/repos/${slice.key}?tab=dashboard`}
            className="font-medium hover:underline"
          >
            {slice.label}
          </Link>
        )}
        filters={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker
              range={range}
              presetId={presetId}
              onChange={(next, preset) => {
                setRange(next)
                setPresetId(preset)
              }}
            />
            <div className="min-w-56 flex-1 sm:max-w-72">
              <MultiSelect
                options={options}
                value={selected}
                onChange={setSelected}
                placeholder={`All repositories (${options.length})`}
                searchPlaceholder="Search repositories…"
                emptyText="No repositories in this range."
              />
            </div>
            <Button variant="outline" size="sm" onClick={sync} disabled={loading}>
              {loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className="size-4" />
              )}
              {progress ? `${progress.done}/${progress.total}` : 'Sync'}
            </Button>
          </div>
        }
      />
    </>
  )
}
