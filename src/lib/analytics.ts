import type { ContributorStat, StatWeek } from '@/lib/github'

export interface WeekPoint {
  /** Unix milliseconds for the start of the week. */
  week: number
  commits: number
  additions: number
  deletions: number
}

/**
 * One row of a dashboard: a repository on the user view, a contributor on the
 * repository view. Both views reduce to this shape so the charts are shared.
 */
export interface Slice {
  key: string
  label: string
  avatarUrl?: string
  commits: number
  additions: number
  deletions: number
  weeks: WeekPoint[]
  firstWeek: number | null
  lastWeek: number | null
  /** Weeks in range where this slice had at least one commit. */
  activeWeeks: number
}

export interface DateRange {
  from?: Date
  to?: Date
}

export interface RepoStats {
  repo: string
  contributors: ContributorStat[]
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function toPoints(weeks: StatWeek[]): WeekPoint[] {
  return weeks.map((w) => ({
    week: w.w * 1000,
    commits: w.c,
    additions: w.a,
    deletions: w.d,
  }))
}

function summarise(
  key: string,
  label: string,
  points: WeekPoint[],
  avatarUrl?: string,
): Slice {
  const weeks = [...points].sort((a, b) => a.week - b.week)
  const withCommits = weeks.filter((w) => w.commits > 0)
  return {
    key,
    label,
    avatarUrl,
    commits: weeks.reduce((sum, w) => sum + w.commits, 0),
    additions: weeks.reduce((sum, w) => sum + w.additions, 0),
    deletions: weeks.reduce((sum, w) => sum + w.deletions, 0),
    weeks,
    firstWeek: withCommits.at(0)?.week ?? null,
    lastWeek: withCommits.at(-1)?.week ?? null,
    activeWeeks: withCommits.length,
  }
}

/** Keeps only the weeks inside the range; a missing bound is open-ended. */
function clip(points: WeekPoint[], range: DateRange): WeekPoint[] {
  const from = range.from ? range.from.getTime() : -Infinity
  // GitHub buckets by week, so a week counts when any part of it is in range.
  const to = range.to ? range.to.getTime() + WEEK_MS : Infinity
  return points.filter((p) => p.week >= from - WEEK_MS && p.week <= to)
}

/** Repository view: one slice per contributor. */
export function slicesByContributor(
  contributors: ContributorStat[],
  range: DateRange,
): Slice[] {
  return contributors
    .filter((c) => c.author)
    .map((c) =>
      summarise(
        c.author!.login,
        c.author!.login,
        clip(toPoints(c.weeks), range),
        c.author!.avatar_url,
      ),
    )
    .filter((s) => s.commits > 0 || s.additions > 0 || s.deletions > 0)
    .sort((a, b) => b.commits - a.commits || a.label.localeCompare(b.label))
}

/** User view: one slice per repository the person committed to. */
export function slicesByRepository(
  stats: RepoStats[],
  login: string,
  range: DateRange,
): Slice[] {
  const target = login.toLowerCase()
  return stats
    .map(({ repo, contributors }) => {
      const mine = contributors.find((c) => c.author?.login.toLowerCase() === target)
      if (!mine) return null
      return summarise(repo, repo, clip(toPoints(mine.weeks), range))
    })
    .filter((s): s is Slice => Boolean(s))
    .filter((s) => s.commits > 0 || s.additions > 0 || s.deletions > 0)
    .sort((a, b) => b.commits - a.commits || a.label.localeCompare(b.label))
}

export interface Totals {
  commits: number
  additions: number
  deletions: number
  slices: number
  activeWeeks: number
  busiestWeek: WeekPoint | null
  topSlice: Slice | null
}

export function totals(slices: Slice[]): Totals {
  const timeline = mergeTimeline(slices)
  const busiest = timeline.reduce<WeekPoint | null>(
    (best, w) => (best === null || w.commits > best.commits ? w : best),
    null,
  )
  return {
    commits: slices.reduce((sum, s) => sum + s.commits, 0),
    additions: slices.reduce((sum, s) => sum + s.additions, 0),
    deletions: slices.reduce((sum, s) => sum + s.deletions, 0),
    slices: slices.length,
    activeWeeks: timeline.filter((w) => w.commits > 0).length,
    busiestWeek: busiest && busiest.commits > 0 ? busiest : null,
    topSlice: slices.at(0) ?? null,
  }
}

/** Sums every slice week-by-week into one continuous series, gaps filled with zero. */
export function mergeTimeline(slices: Slice[]): WeekPoint[] {
  const byWeek = new Map<number, WeekPoint>()
  for (const slice of slices) {
    for (const point of slice.weeks) {
      const existing = byWeek.get(point.week)
      if (existing) {
        existing.commits += point.commits
        existing.additions += point.additions
        existing.deletions += point.deletions
      } else {
        byWeek.set(point.week, { ...point })
      }
    }
  }

  const points = [...byWeek.values()].sort((a, b) => a.week - b.week)
  if (points.length === 0) return points

  // A missing week means zero commits, not a gap the line should skip over.
  const filled: WeekPoint[] = []
  for (let week = points[0].week; week <= points[points.length - 1].week; week += WEEK_MS) {
    filled.push(
      byWeek.get(week) ?? { week, commits: 0, additions: 0, deletions: 0 },
    )
  }
  return filled
}

/** Percentage of the filtered total this slice accounts for. */
export function share(slice: Slice, total: number) {
  return total === 0 ? 0 : (slice.commits / total) * 100
}

export function compactNumber(value: number) {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value)
}

export function formatWeek(week: number) {
  return new Date(week).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function formatWeekLong(week: number) {
  const start = new Date(week)
  const end = new Date(week + 6 * 24 * 60 * 60 * 1000)
  return `${start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
}
