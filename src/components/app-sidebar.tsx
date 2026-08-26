import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  LogOut,
  RefreshCw,
  ScrollText,
  UserPlus,
} from 'lucide-react'
import { GithubMark } from '@/components/github-mark'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarRail,
} from '@/components/ui/sidebar'
import { clearHttpCache } from '@/lib/http-cache'
import { clearCache } from '@/lib/response-cache'
import { useAuth } from '@/store/auth'
import { useOrgStore } from '@/store/orgs'
import { cn } from '@/lib/utils'

const mainNav = [
  { title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard },
  { title: 'Give Access', url: '/give-access', icon: UserPlus },
  { title: 'Activity Log', url: '/activity', icon: ScrollText },
]

export function AppSidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, username, token, signOut } = useAuth()
  const { orgs, loading, error, load } = useOrgStore()

  useEffect(() => {
    if (token) void load(token, username ?? undefined)
  }, [token, username, load])

  const handleSignOut = () => {
    signOut()
    useOrgStore.getState().reset()
    // Cached GitHub responses shouldn't outlive the session that fetched them.
    void clearCache()
    void clearHttpCache()
    navigate('/login', { replace: true })
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <GithubMark className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">GitHub Jarvis</span>
                  <span className="truncate text-xs text-muted-foreground">
                    Access control
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.url}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(item.url)}
                    tooltip={item.title}
                  >
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Accounts</SidebarGroupLabel>
          <SidebarGroupAction
            title="Refresh organizations"
            onClick={() => token && load(token, username ?? undefined, true)}
          >
            <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
            <span className="sr-only">Refresh organizations</span>
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {loading && orgs.length === 0 &&
                Array.from({ length: 4 }).map((_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}

              {!loading && orgs.length === 0 && !error && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                    No accounts found for this token.
                  </div>
                </SidebarMenuItem>
              )}

              {error && (
                <SidebarMenuItem>
                  <div className="px-2 py-1.5 text-xs text-destructive group-data-[collapsible=icon]:hidden">
                    {error}
                  </div>
                </SidebarMenuItem>
              )}

              {orgs.map((org) => (
                <SidebarMenuItem key={org.id}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith(`/orgs/${org.login}`)}
                    tooltip={org.login}
                  >
                    <Link to={`/orgs/${org.login}`}>
                      <Avatar className="size-4 rounded-sm">
                        <AvatarImage src={org.avatar_url} alt="" />
                        <AvatarFallback className="rounded-sm text-[9px]">
                          <Building2 className="size-3" />
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{org.login}</span>
                      {org.personal && (
                        <span className="ml-auto shrink-0 rounded-sm border px-1 text-[9px] leading-4 text-muted-foreground group-data-[collapsible=icon]:hidden">
                          you
                        </span>
                      )}
                      <ChevronRight
                        className={cn('size-3.5 opacity-40', !org.personal && 'ml-auto')}
                      />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" tooltip={user?.login}>
                  <Avatar className="size-8 rounded-lg">
                    <AvatarImage src={user?.avatar_url} alt={user?.login} />
                    <AvatarFallback className="rounded-lg">
                      {user?.login?.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">{user?.login}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {user?.name ?? 'Signed in'}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="right" align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <div className="grid text-sm">
                    <span className="font-medium">{user?.login}</span>
                    <span className="text-xs text-muted-foreground">
                      {user?.html_url}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
