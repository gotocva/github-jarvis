import { useEffect } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, ExternalLink, Lock, RefreshCw, Unlock } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { RepoBranches } from '@/components/repo-branches'
import { RepoDashboard } from '@/components/dashboard/lazy'
import { RepoUsers } from '@/components/repo-users'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { useAuth } from '@/store/auth'
import { repoKey, useRepoData } from '@/store/repo-data'

const TABS = ['dashboard', 'branches', 'users'] as const
type Tab = (typeof TABS)[number]

export function RepositoryPage() {
  const { org = '', repo = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, username } = useAuth()
  const key = repoKey(org, repo)

  const details = useRepoData((s) => s.repo[key]?.data)
  const branchResource = useRepoData((s) => s.branches[key])
  const userResource = useRepoData((s) => s.users[key])
  const { loadRepo, loadBranches, loadUsers, invalidate } = useRepoData()

  const requested = searchParams.get('tab')
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'dashboard'
  const busy = Boolean(branchResource?.loading || userResource?.loading)

  useEffect(() => {
    if (!token || !org || !repo) return
    void loadRepo(org, repo, token, username ?? undefined)
    // The dashboard loads its own statistics; don't fetch lists it won't show.
    if (tab === 'branches') void loadBranches(org, repo, token, username ?? undefined)
    if (tab === 'users') void loadUsers(org, repo, token, username ?? undefined)
  }, [org, repo, tab, token, username, loadRepo, loadBranches, loadUsers])

  const refresh = () => {
    if (!token) return
    invalidate(key, username ?? undefined)
    void loadRepo(org, repo, token, username ?? undefined, true)
    if (tab === 'branches') void loadBranches(org, repo, token, username ?? undefined, true)
    if (tab === 'users') void loadUsers(org, repo, token, username ?? undefined, true)
  }

  return (
    <>
      <nav className="flex items-center gap-1 text-sm text-muted-foreground">
        <Link to={`/orgs/${org}`} className="hover:text-foreground hover:underline">
          {org}
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{repo}</span>
      </nav>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {details?.private ? (
              <Lock className="size-5 text-muted-foreground" />
            ) : (
              <Unlock className="size-5 text-muted-foreground" />
            )}
            {repo}
            {details?.archived && <Badge variant="outline">Archived</Badge>}
          </span>
        }
        description={details?.description ?? 'Branches and collaborators for this repository.'}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={details?.html_url ?? `https://github.com/${org}/${repo}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink className="size-4" />
                GitHub
              </a>
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="branches">
            Branches
            {branchResource?.data && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {branchResource.data.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="users">
            Users
            {userResource?.data && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {userResource.data.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <RepoDashboard org={org} repo={repo} />
        </TabsContent>
        <TabsContent value="branches" className="mt-4">
          <RepoBranches org={org} repo={repo} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <RepoUsers org={org} repo={repo} />
        </TabsContent>
      </Tabs>
    </>
  )
}
