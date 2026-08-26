import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Used when a refresh fails but we already have rows on screen — the stale data
 * stays visible rather than being replaced by a full-page error.
 */
export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3"
    >
      <AlertCircle className="size-4 shrink-0 text-destructive" />
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium text-destructive">Couldn't refresh from GitHub</p>
        <p className="text-sm text-muted-foreground">
          {/^.*[.!?]$/.test(message) ? message : `${message}.`} Showing the last data this
          browser has.
        </p>
      </div>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="shrink-0">
          <RefreshCw className="size-4" />
          Try again
        </Button>
      )}
    </div>
  )
}
