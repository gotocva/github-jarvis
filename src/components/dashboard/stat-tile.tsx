import type { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  loading,
  tone,
}: {
  icon: LucideIcon
  label: string
  value: string
  detail?: string
  loading?: boolean
  tone?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon className="size-3.5" />
          {label}
        </p>
        {loading ? (
          <Skeleton className="h-8 w-20" />
        ) : (
          /* Proportional figures: tabular-nums makes large standalone values look loose. */
          <p className={cn('text-3xl font-semibold', tone)}>{value}</p>
        )}
        {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  )
}
