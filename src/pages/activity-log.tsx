import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
  CheckCircle2,
  Download,
  RefreshCw,
  ScrollText,
  Search,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  clearActivity,
  listActivity,
  onActivity,
  type ActivityEntry,
} from '@/lib/activity-log'
import { cn } from '@/lib/utils'

type StatusFilter = 'all' | 'success' | 'error'
type MethodFilter = 'all' | 'GET' | 'PUT' | 'POST' | 'PATCH' | 'DELETE' | 'CACHE'

const METHOD_STYLES: Record<string, string> = {
  GET: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  PUT: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  POST: 'border-emerald-500/40 text-emerald-600 dark:text-emerald-400',
  PATCH: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  DELETE: 'border-red-500/40 text-red-600 dark:text-red-400',
  CACHE: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
}

export function ActivityLogPage() {
  const [entries, setEntries] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [method, setMethod] = useState<MethodFilter>('all')
  const deferredQuery = useDeferredValue(query)

  const refresh = () => {
    setLoading(true)
    void listActivity(1000)
      .then(setEntries)
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    // Newly recorded calls stream in without a re-read of the whole store.
    return onActivity((entry) => setEntries((prev) => [entry, ...prev].slice(0, 1000)))
  }, [])

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return entries.filter((entry) => {
      if (status !== 'all' && entry.status !== status) return false
      if (method !== 'all' && entry.method !== method) return false
      if (!q) return true
      return (
        entry.label.toLowerCase().includes(q) ||
        entry.endpoint.toLowerCase().includes(q) ||
        String(entry.statusCode).includes(q) ||
        (entry.error ?? '').toLowerCase().includes(q)
      )
    })
  }, [entries, deferredQuery, status, method])

  const failures = entries.filter((e) => e.status === 'error').length
  // Cache reads are instant, so they'd flatter the network average.
  const networkCalls = entries.filter((e) => !e.fromCache)
  const avgDuration = networkCalls.length
    ? Math.round(networkCalls.reduce((sum, e) => sum + e.durationMs, 0) / networkCalls.length)
    : 0
  const cacheHits = entries.length - networkCalls.length

  const handleClear = async () => {
    await clearActivity()
    setEntries([])
    toast.success('Activity log cleared')
  }

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(entries, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `github-jarvis-activity-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <PageHeader
        title="Activity Log"
        description="Every GitHub API call this app makes, stored in this browser's IndexedDB."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={entries.length === 0}
            >
              <Download className="size-4" />
              Export
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={entries.length === 0}>
                  <Trash2 className="size-4" />
                  Clear
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the activity log?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes all {entries.length} recorded calls from this
                    browser. It does not affect anything on GitHub.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClear}
                    className="bg-destructive text-white hover:bg-destructive/90"
                  >
                    Clear log
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{networkCalls.length}</p>
            <p className="text-xs text-muted-foreground">GitHub API calls</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{cacheHits}</p>
            <p className="text-xs text-muted-foreground">Served from cache</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p
              className={cn(
                'text-2xl font-semibold tabular-nums',
                failures > 0 && 'text-destructive',
              )}
            >
              {failures}
            </p>
            <p className="text-xs text-muted-foreground">Failed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-2xl font-semibold tabular-nums">{avgDuration}ms</p>
            <p className="text-xs text-muted-foreground">Average API duration</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by action, endpoint, status code or error…"
            className="pl-8"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <Select value={method} onValueChange={(v) => setMethod(v as MethodFilter)}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['all', 'GET', 'PUT', 'POST', 'PATCH', 'DELETE', 'CACHE'] as const).map((value) => (
              <SelectItem key={value} value={value}>
                {value === 'all' ? 'All methods' : value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} shown
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={entries.length === 0 ? 'No activity yet' : 'No matching entries'}
          description={
            entries.length === 0
              ? 'Browse an organization or grant access and every call will be recorded here.'
              : 'Try a different search or filter.'
          }
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Time</TableHead>
                <TableHead className="w-20">Method</TableHead>
                <TableHead className="w-20">Status</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Endpoint</TableHead>
                <TableHead className="w-24 text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((entry) => (
                <TableRow
                  key={entry.id ?? `${entry.ts}-${entry.endpoint}`}
                  className={cn(entry.status === 'error' && 'bg-destructive/5')}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {new Date(entry.ts).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn('font-mono text-[10px]', METHOD_STYLES[entry.method])}
                    >
                      {entry.method}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-mono text-xs',
                        entry.status === 'success'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-destructive',
                      )}
                    >
                      {entry.status === 'success' ? (
                        <CheckCircle2 className="size-3.5" />
                      ) : (
                        <XCircle className="size-3.5" />
                      )}
                      {entry.statusCode || 'ERR'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{entry.label}</p>
                    {entry.error && (
                      <p className="text-xs text-destructive">{entry.error}</p>
                    )}
                  </TableCell>
                  <TableCell className="max-w-md truncate font-mono text-xs text-muted-foreground">
                    {entry.endpoint}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.durationMs}ms
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
