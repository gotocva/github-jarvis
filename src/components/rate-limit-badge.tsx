import { useEffect, useState } from 'react'
import { Gauge } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { onActivity } from '@/lib/activity-log'
import { cn } from '@/lib/utils'

/** Mirrors the newest `x-ratelimit-remaining` GitHub returned. */
export function RateLimitBadge() {
  const [remaining, setRemaining] = useState<number | null>(null)

  useEffect(
    () =>
      onActivity((entry) => {
        if (typeof entry.rateRemaining === 'number') setRemaining(entry.rateRemaining)
      }),
    [],
  )

  if (remaining === null) return null

  return (
    <Badge
      variant="outline"
      className={cn('gap-1 font-mono text-xs', remaining < 100 && 'text-destructive')}
    >
      <Gauge className="size-3" />
      {remaining} calls left
    </Badge>
  )
}
