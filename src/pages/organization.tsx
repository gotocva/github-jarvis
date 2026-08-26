import { useEffect } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ExternalLink, RefreshCw, UserPlus } from 'lucide-react'
import { OrgRepositories } from '@/components/org-repositories'
import { OrgUsers } from '@/components/org-users'
import { PageHeader } from '@/components/page-header'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/store/auth'
import { useOrgData } from '@/store/org-data'
import { useOrgStore } from '@/store/orgs'
import { cn } from '@/lib/utils'

const TABS = ['repositories', 'users'] as const
type Tab = (typeof TABS)[number]

export function OrganizationPage() {
  const { org = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, username } = useAuth()
  const orgs = useOrgStore((s) => s.orgs)
  const { repos, users, loadRepos, loadUsers, invalidate } = useOrgData()

  const requested = searchParams.get('tab')
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'repositories'

  const details = orgs.find((o) => o.login.toLowerCase() === org.toLowerCase())
  const repoResource = repos[org]
  const userResource = users[org]
  const busy = Boolean(repoResource?.loading || userResource?.loading)

  useEffect(() => {
    if (!token || !org) return
    if (tab === 'repositories') void loadRepos(org, token, username ?? undefined)
    else void loadUsers(org, token, username ?? undefined)
  }, [org, tab, token, username, loadRepos, loadUsers])

  const refresh = () => {
    if (!token) return
    invalidate(org, username ?? undefined)
    if (tab === 'repositories') void loadRepos(org, token, username ?? undefined, true)
    else void loadUsers(org, token, username ?? undefined, true)
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-9 rounded-md">
              <AvatarImage src={details?.avatar_url} alt="" />
              <AvatarFallback className="rounded-md text-sm">
                {org.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {org}
          </span>
        }
        description={details?.description ?? 'Repositories and access for this organization.'}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={refresh} disabled={busy}>
              <RefreshCw className={cn('size-4', busy && 'animate-spin')} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://github.com/${org}`}
                target="_blank"
                rel="noreferrer noopener"
              >
                <ExternalLink className="size-4" />
                GitHub
              </a>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/give-access?org=${encodeURIComponent(org)}`}>
                <UserPlus className="size-4" />
                Give access
              </Link>
            </Button>
          </>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="repositories">
            Repositories
            {repoResource?.data && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {repoResource.data.length}
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

        <TabsContent value="repositories" className="mt-4">
          <OrgRepositories org={org} />
        </TabsContent>
        <TabsContent value="users" className="mt-4">
          <OrgUsers org={org} onNavigateToRepos={() => navigate(`/orgs/${org}?tab=repositories`)} />
        </TabsContent>
      </Tabs>
    </>
  )
}
