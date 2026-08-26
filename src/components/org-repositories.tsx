import { useDeferredValue, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ChevronRight,
  ExternalLink,
  FolderGit2,
  GitFork,
  Lock,
  Search,
  Star,
  Unlock,
} from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { InlineError } from '@/components/inline-error'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Repository } from '@/lib/github'
import { CacheNotice } from '@/components/cache-notice'
import { useAuth } from '@/store/auth'
import { useOrgData } from '@/store/org-data'

type Visibility = 'all' | 'public' | 'private'

/** Stable identity so the filter memo doesn't rerun on every render. */
const NO_REPOS: Repository[] = []

export function OrgRepositories({ org }: { org: string }) {
  const navigate = useNavigate()
  const { token, username } = useAuth()
  const resource = useOrgData((s) => s.repos[org])
  const loadRepos = useOrgData((s) => s.loadRepos)
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const deferredQuery = useDeferredValue(query)

  const repos = resource?.data ?? NO_REPOS
  const hasRows = repos.length > 0

  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase()
    return repos.filter((repo) => {
      if (visibility === 'public' && repo.private) return false
      if (visibility === 'private' && !repo.private) return false
      if (!q) return true
      return (
        repo.name.toLowerCase().includes(q) ||
        (repo.description ?? '').toLowerCase().includes(q) ||
        (repo.language ?? '').toLowerCase().includes(q)
      )
    })
  }, [repos, deferredQuery, visibility])

  if (resource?.loading && repos.length === 0) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (resource?.error && !hasRows) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="Couldn't load repositories"
        description={resource.error}
      />
    )
  }

  if (repos.length === 0) {
    return (
      <EmptyState
        icon={FolderGit2}
        title="No repositories"
        description={`${org} has no repositories visible to this token.`}
      />
    )
  }

  const sync = () => {
    if (token) void loadRepos(org, token, username ?? undefined, true)
  }

  return (
    <div className="space-y-4">
      {resource?.error && (
        <InlineError message={resource.error} onRetry={sync} />
      )}

      {resource?.fromCache && !resource?.error && (
        <CacheNotice
          cachedAt={resource.cachedAt}
          onSync={sync}
          syncing={resource.loading}
          label={`The repository list for ${org}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter repositories by name, description or language…"
            className="pl-8"
          />
        </div>
        <div className="flex rounded-md border p-0.5">
          {(['all', 'public', 'private'] as const).map((option) => (
            <Button
              key={option}
              size="sm"
              variant={visibility === option ? 'secondary' : 'ghost'}
              className="h-7 capitalize"
              onClick={() => setVisibility(option)}
            >
              {option}
            </Button>
          ))}
        </div>
        <span className="text-sm text-muted-foreground tabular-nums">
          {filtered.length} of {repos.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matches"
          description={`Nothing in ${org} matches "${query}".`}
        />
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="min-w-48">Repository</TableHead>
                <TableHead className="hidden w-32 lg:table-cell">Language</TableHead>
                <TableHead className="hidden w-28 text-right lg:table-cell">Stars</TableHead>
                <TableHead className="hidden w-28 text-right xl:table-cell">Forks</TableHead>
                <TableHead className="hidden w-40 md:table-cell">Updated</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((repo) => (
                <TableRow
                  key={repo.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/orgs/${org}/repos/${repo.name}`)}
                >
                  <TableCell className="whitespace-normal">
                    <div className="flex items-start gap-2">
                      {repo.private ? (
                        <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      ) : (
                        <Unlock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            to={`/orgs/${org}/repos/${repo.name}`}
                            onClick={(event) => event.stopPropagation()}
                            className="font-medium hover:underline"
                          >
                            {repo.name}
                          </Link>
                          {repo.archived && (
                            <Badge variant="outline" className="text-[10px]">
                              Archived
                            </Badge>
                          )}
                        </div>
                        {repo.description && (
                          <p className="line-clamp-1 text-xs text-muted-foreground">
                            {repo.description}
                          </p>
                        )}
                        <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 pt-0.5 text-xs text-muted-foreground lg:hidden">
                          {repo.language && <span>{repo.language}</span>}
                          <span className="inline-flex items-center gap-1">
                            <Star className="size-3" />
                            {repo.stargazers_count}
                          </span>
                          <span className="inline-flex items-center gap-1 xl:hidden">
                            <GitFork className="size-3" />
                            {repo.forks_count}
                          </span>
                          <span className="md:hidden">
                            {new Date(repo.updated_at).toLocaleDateString()}
                          </span>
                        </p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                    {repo.language ?? '—'}
                  </TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums lg:table-cell">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Star className="size-3" />
                      {repo.stargazers_count}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-right text-sm tabular-nums xl:table-cell">
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <GitFork className="size-3" />
                      {repo.forks_count}
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {new Date(repo.updated_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end">
                      <Button variant="ghost" size="icon" asChild>
                        <a
                          href={repo.html_url}
                          target="_blank"
                          rel="noreferrer noopener"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <ExternalLink className="size-4" />
                          <span className="sr-only">Open {repo.name} on GitHub</span>
                        </a>
                      </Button>
                      <ChevronRight className="size-4 text-muted-foreground" />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
