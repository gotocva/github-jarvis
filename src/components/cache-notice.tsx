import { Database, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { relativeTime } from '@/lib/utils'

/**
 * Shown whenever the data on screen was read from IndexedDB instead of GitHub,
 * with the escape hatch to go and fetch the real thing.
 */
export function CacheNotice({
  cachedAt,
  onSync,
  syncing,
  label = 'This data',
}: {
  cachedAt?: number
  onSync: () => void
  syncing?: boolean
  label?: string
}) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3"
    >
      <Database className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-48 flex-1">
        <p className="text-sm font-medium">Loaded from local cache</p>
        <p className="text-sm text-muted-foreground">
          {label} came from this browser's IndexedDB
          {cachedAt ? `, saved ${relativeTime(new Date(cachedAt).toISOString())}` : ''}. It
          may be out of date.
        </p>
      </div>
      <Button size="sm" onClick={onSync} disabled={syncing} className="shrink-0">
        {syncing ? <Loader2 className="animate-spin" /> : <RefreshCw className="size-4" />}
        {syncing ? 'Syncing…' : 'Sync with GitHub'}
      </Button>
    </div>
  )
}
