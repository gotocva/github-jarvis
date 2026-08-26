import type { ReactNode } from 'react'
import { GitCommitHorizontal, Minus, Plus, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BreakdownTable } from '@/components/dashboard/breakdown-table'
import { CodeChanges } from '@/components/dashboard/code-changes'
import { CommitsOverTime } from '@/components/dashboard/commits-over-time'
import { RankedBars } from '@/components/dashboard/ranked-bars'
import { StatTile } from '@/components/dashboard/stat-tile'
import {
  compactNumber,
  formatWeekLong,
  mergeTimeline,
  totals,
  type Slice,
} from '@/lib/analytics'
import { cn } from '@/lib/utils'

export interface AnalyticsCopy {
  /** "Repository" / "Contributor" — singular, used as a column heading. */
  entityLabel: string
  entityPlural: string
  entityIcon: LucideIcon
  rankTitle: string
  rankDescription: string
  changesTitle: string
  changesDescription: string
  tableTitle: string
  tableDescription: string
  timelineDescription: string
}

/**
 * The dashboard body. Both views reduce their data to `Slice[]` first, so the
 * charts, the stat row and the table view are the same code either way.
 */
export function AnalyticsView({
  slices,
  copy,
  loading,
  filters,
  renderTableLabel,
}: {
  slices: Slice[]
  copy: AnalyticsCopy
  loading?: boolean
  /** One row, above everything it scopes. */
  filters: ReactNode
  renderTableLabel?: (slice: Slice) => ReactNode
}) {
  const summary = totals(slices)
  const timeline = mergeTimeline(slices)

  return (
    <div className="space-y-4">
      {filters}

      {/* Refetch holds the previous render at reduced opacity — no skeleton flash. */}
      <div className={cn('space-y-4 transition-opacity', loading && 'opacity-60')}>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={GitCommitHorizontal}
            label="Commits"
            value={compactNumber(summary.commits)}
            detail={
              summary.busiestWeek
                ? `Busiest week ${formatWeekLong(summary.busiestWeek.week)}`
                : undefined
            }
          />
          <StatTile
            icon={copy.entityIcon}
            label={copy.entityPlural}
            value={compactNumber(summary.slices)}
            detail={
              summary.topSlice
                ? `Top: ${summary.topSlice.label} (${compactNumber(summary.topSlice.commits)})`
                : undefined
            }
          />
          <StatTile
            icon={Plus}
            label="Lines added"
            value={compactNumber(summary.additions)}
          />
          <StatTile
            icon={Minus}
            label="Lines removed"
            value={compactNumber(summary.deletions)}
            detail={`${summary.activeWeeks} active week${summary.activeWeeks === 1 ? '' : 's'}`}
          />
        </div>

        <CommitsOverTime points={timeline} description={copy.timelineDescription} />

        <div className="grid gap-4 xl:grid-cols-2">
          <RankedBars
            slices={slices}
            title={copy.rankTitle}
            description={copy.rankDescription}
          />
          <CodeChanges
            slices={slices}
            title={copy.changesTitle}
            description={copy.changesDescription}
          />
        </div>

        <BreakdownTable
          slices={slices}
          title={copy.tableTitle}
          description={copy.tableDescription}
          entityLabel={copy.entityLabel}
          renderLabel={renderTableLabel}
        />
      </div>
    </div>
  )
}

export const USERS_ICON = Users
