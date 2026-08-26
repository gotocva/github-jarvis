import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, Loader2, RefreshCw, Users } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InlineError } from '@/components/inline-error'
import { MultiSelect, type MultiSelectOption } from '@/components/multi-select'
import { AnalyticsView } from '@/components/dashboard/analytics-view'
import { DateRangePicker, presetRange, RANGE_PRESETS } from '@/components/date-range-picker'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { slicesByContributor, type DateRange, type Slice } from '@/lib/analytics'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { statsKey, useStats } from '@/store/stats'

const DEFAULT_PRESET = RANGE_PRESETS.find((p) => p.id === '1y')!

export function RepoDashboard({ org, repo }: { org: string; repo: string }) {
  const { token, username } = useAuth()
  const key = statsKey(org, repo)
  const resource = useStats((s) => s.byRepo[key])
  const loadRepo = useStats((s) => s.loadRepo)

  const [range, setRange] = useState<DateRange>(() => presetRange(DEFAULT_PRESET))
  const [presetId, setPresetId] = useState<string | null>(DEFAULT_PRESET.id)
  const [selected, setSelected] = useState<string[]>([])

  useEffect(() => {
    if (token) void loadRepo(org, repo, token, username ?? undefined)
  }, [org, repo, token, username, loadRepo])

  const contributors = resource?.data

  // Everything in range, before the contributor filter — the picker must list
  // people even while they're deselected.
  const allSlices = useMemo(
    () => (contributors ? slicesByContributor(contributors, range) : []),
    [contributors, range],
  )

  const options = useMemo<MultiSelectOption[]>(
    () =>
      allSlices.map((s) => ({
        value: s.key,
        label: s.label,
        description: `${s.commits} commits`,
        imageUrl: s.avatarUrl,
      })),
    [allSlices],
  )

  const slices = useMemo(
    () => (selected.length === 0 ? allSlices : allSlices.filter((s) => selected.includes(s.key))),
    [allSlices, selected],
  )

  const sync = () => {
    if (token) void loadRepo(org, repo, token, username ?? undefined, true)
  }

  if (resource?.loading && !contributors) {
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

  if (resource?.error && !contributors) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No statistics yet"
        description={resource.error}
        action={
          <Button variant="outline" size="sm" onClick={sync}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        }
      />
    )
  }

  if (contributors && allSlices.length === 0 && !range.from) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No contribution history"
        description={`GitHub reports no commits for ${org}/${repo}.`}
      />
    )
  }

  return (
    <>
      {resource?.error && <InlineError message={resource.error} onRetry={sync} />}

      <AnalyticsView
        slices={slices}
        loading={resource?.loading}
        copy={{
          entityLabel: 'Contributor',
          entityPlural: 'Contributors',
          entityIcon: Users,
          rankTitle: 'Commits by contributor',
          rankDescription: 'Who moved this repository the most, highest first.',
          changesTitle: 'Code changed by contributor',
          changesDescription: 'Lines added and removed, largest footprint first.',
          tableTitle: 'Contributor breakdown',
          tableDescription: 'Every contributor in the selected range.',
          timelineDescription: `Weekly commits to ${org}/${repo}.`,
        }}
        renderTableLabel={(slice: Slice) => (
          <Link
            to={`/orgs/${org}/users/${slice.key}`}
            className="flex items-center gap-2 hover:underline"
          >
            <Avatar className="size-6">
              <AvatarImage src={slice.avatarUrl} alt="" />
              <AvatarFallback className="text-[10px]">
                {slice.label.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="font-medium">{slice.label}</span>
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
                placeholder={`All contributors (${options.length})`}
                searchPlaceholder="Search contributors…"
                emptyText="No contributors in this range."
              />
            </div>
            <Button variant="outline" size="sm" onClick={sync} disabled={resource?.loading}>
              {resource?.loading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <RefreshCw className={cn('size-4')} />
              )}
              Sync
            </Button>
          </div>
        }
      />
    </>
  )
}
