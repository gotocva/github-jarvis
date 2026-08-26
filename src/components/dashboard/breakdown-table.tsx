import { ArrowDown, ArrowUp } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { compactNumber, share, type Slice } from '@/lib/analytics'
import { relativeTime } from '@/lib/utils'

/**
 * The table view every chart on the page needs: the same numbers, reachable
 * without hovering and without relying on color.
 */
export function BreakdownTable({
  slices,
  title,
  description,
  entityLabel,
  renderLabel,
}: {
  slices: Slice[]
  title: string
  description: string
  entityLabel: string
  renderLabel?: (slice: Slice) => React.ReactNode
}) {
  const total = slices.reduce((sum, s) => sum + s.commits, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {slices.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Nothing to show in this range.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-40">{entityLabel}</TableHead>
                  <TableHead className="w-24 text-right">Commits</TableHead>
                  <TableHead className="w-20 text-right">Share</TableHead>
                  <TableHead className="hidden w-28 text-right sm:table-cell">Added</TableHead>
                  <TableHead className="hidden w-28 text-right sm:table-cell">Removed</TableHead>
                  <TableHead className="hidden w-32 lg:table-cell">Last activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {slices.map((slice) => (
                  <TableRow key={slice.key}>
                    <TableCell>
                      {renderLabel ? (
                        renderLabel(slice)
                      ) : (
                        <div className="flex items-center gap-2">
                          {slice.avatarUrl && (
                            <Avatar className="size-6">
                              <AvatarImage src={slice.avatarUrl} alt="" />
                              <AvatarFallback className="text-[10px]">
                                {slice.label.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                          )}
                          <span className="font-medium">{slice.label}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {compactNumber(slice.commits)}
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground tabular-nums">
                      {share(slice, total).toFixed(1)}%
                    </TableCell>
                    <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ArrowUp className="size-3" />
                        {compactNumber(slice.additions)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-right text-sm tabular-nums sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <ArrowDown className="size-3" />
                        {compactNumber(slice.deletions)}
                      </span>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {slice.lastWeek
                        ? relativeTime(new Date(slice.lastWeek).toISOString())
                        : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
