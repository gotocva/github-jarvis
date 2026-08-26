import { useEffect, useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ChevronRight, ExternalLink, Lock, Unlock } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { UserDashboard } from '@/components/dashboard/lazy'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { isPersonalAccount, useAuth } from '@/store/auth'
import { useOrgData, type RepoRole } from '@/store/org-data'

const TABS = ['dashboard', 'access'] as const
type Tab = (typeof TABS)[number]

const ROLE_STYLES: Record<RepoRole, string> = {
  admin: 'border-red-500/40 text-red-600 dark:text-red-400',
  maintain: 'border-amber-500/40 text-amber-600 dark:text-amber-400',
  write: 'border-blue-500/40 text-blue-600 dark:text-blue-400',
  triage: 'border-violet-500/40 text-violet-600 dark:text-violet-400',
  read: 'border-border text-muted-foreground',
}

export function UserPage() {
  const { org = '', login = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, username } = useAuth()
  const users = useOrgData((s) => s.users[org]?.data)
  const repos = useOrgData((s) => s.repos[org]?.data)
  const loadUsers = useOrgData((s) => s.loadUsers)

  const requested = searchParams.get('tab')
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'dashboard'
  const personal = isPersonalAccount(org)

  useEffect(() => {
    if (token) void loadUsers(org, token, username ?? undefined)
  }, [org, token, username, loadUsers])

  const profile = useMemo(
    () => users?.find((u) => u.login.toLowerCase() === login.toLowerCase()),
    [users, login],
  )

  const privacyOf = (repo: string) => repos?.find((r) => r.name === repo)?.private

  return (
    <>
      <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        <Link to={`/orgs/${org}`} className="hover:text-foreground hover:underline">
          {org}
        </Link>
        <ChevronRight className="size-3.5" />
        <Link to={`/orgs/${org}?tab=users`} className="hover:text-foreground hover:underline">
          Users
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{login}</span>
      </nav>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar className="size-9">
              <AvatarImage src={profile?.avatarUrl} alt="" />
              <AvatarFallback className="text-sm">
                {login.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            {login}
            {profile?.isOrgMember && !personal && <Badge variant="secondary">Member</Badge>}
          </span>
        }
        description={
          personal
            ? `Contribution activity across your repositories.`
            : `Contribution activity across ${org}.`
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <a
              href={profile?.htmlUrl ?? `https://github.com/${login}`}
              target="_blank"
              rel="noreferrer noopener"
            >
              <ExternalLink className="size-4" />
              GitHub
            </a>
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="access">
            Repository access
            {profile && (
              <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                {profile.access.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <UserDashboard org={org} login={login} />
        </TabsContent>

        <TabsContent value="access" className="mt-4">
          {!profile || profile.access.length === 0 ? (
            <p className="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground">
              No direct repository grants for {login}.
            </p>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Repository</TableHead>
                    <TableHead className="w-32">Permission</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {profile.access.map((access) => (
                    <TableRow key={access.repo}>
                      <TableCell>
                        <Link
                          to={`/orgs/${org}/repos/${access.repo}`}
                          className="flex items-center gap-2 font-medium hover:underline"
                        >
                          {privacyOf(access.repo) ? (
                            <Lock className="size-3.5 text-muted-foreground" />
                          ) : (
                            <Unlock className="size-3.5 text-muted-foreground" />
                          )}
                          {access.repo}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={cn('capitalize', ROLE_STYLES[access.role])}
                        >
                          {access.role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" asChild>
                          <Link to={`/orgs/${org}/repos/${access.repo}?tab=dashboard`}>
                            <ChevronRight className="size-4" />
                            <span className="sr-only">Open {access.repo} dashboard</span>
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </>
  )
}
