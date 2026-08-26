import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  CheckCircle2,
  Info,
  KeyRound,
  Loader2,
  ShieldCheck,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { MultiSelect, type MultiSelectOption } from '@/components/multi-select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
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
import { cachedOrgMembers } from '@/lib/github-resources'
import {
  addCollaborator,
  mapWithConcurrency,
  PERMISSION_LABELS,
  type AccessPermission,
  type GitHubUser,
} from '@/lib/github'
import { isPersonalAccount, useAuth } from '@/store/auth'
import { useOrgData } from '@/store/org-data'
import { useOrgStore } from '@/store/orgs'

interface GrantResult {
  user: string
  repo: string
  ok: boolean
  message?: string
}

const PERMISSION_HINTS: Record<AccessPermission, string> = {
  pull: 'Clone and read the repository.',
  push: 'Read, plus push commits and manage issues and pull requests.',
  admin: 'Full control including settings, collaborators and deletion.',
}

export function GiveAccessForm() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { token, username } = useAuth()
  const orgs = useOrgStore((s) => s.orgs)
  const orgsLoading = useOrgStore((s) => s.loading)
  const { repos, users, loadRepos } = useOrgData()

  const [org, setOrg] = useState(searchParams.get('org') ?? '')
  const [selectedUsers, setSelectedUsers] = useState<string[]>([])
  const [selectedRepos, setSelectedRepos] = useState<string[]>([])
  const [permission, setPermission] = useState<AccessPermission>('pull')
  const [members, setMembers] = useState<GitHubUser[]>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [results, setResults] = useState<GrantResult[] | null>(null)

  const repoResource = org ? repos[org] : undefined

  // Reload the option lists whenever the chosen organization changes.
  useEffect(() => {
    if (!org || !token) return
    setSelectedUsers([])
    setSelectedRepos([])
    setResults(null)
    void loadRepos(org, token, username ?? undefined)

    // A personal account has no members, so there is nothing to suggest from.
    if (isPersonalAccount(org)) {
      setMembers([])
      setMembersLoading(false)
      return
    }

    let cancelled = false
    setMembersLoading(true)
    cachedOrgMembers(org, token, username ?? undefined)
      .then(({ data }) => !cancelled && setMembers(data))
      .catch(() => !cancelled && setMembers([]))
      .finally(() => !cancelled && setMembersLoading(false))
    return () => {
      cancelled = true
    }
  }, [org, token, username, loadRepos])

  const userOptions = useMemo<MultiSelectOption[]>(() => {
    const seen = new Map<string, MultiSelectOption>()
    for (const member of members) {
      seen.set(member.login.toLowerCase(), {
        value: member.login,
        label: member.login,
        description: 'member',
        imageUrl: member.avatar_url,
      })
    }
    // Fold in anyone already discovered by the Users tab for this org.
    for (const user of users[org]?.data ?? []) {
      if (!seen.has(user.login.toLowerCase())) {
        seen.set(user.login.toLowerCase(), {
          value: user.login,
          label: user.login,
          description: 'collaborator',
          imageUrl: user.avatarUrl,
        })
      }
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
  }, [members, users, org])

  const repoOptions = useMemo<MultiSelectOption[]>(
    () =>
      (repoResource?.data ?? []).map((repo) => ({
        value: repo.name,
        label: repo.name,
        description: repo.private ? 'private' : 'public',
      })),
    [repoResource],
  )

  const totalGrants = selectedUsers.length * selectedRepos.length
  const canSubmit =
    Boolean(org && token) && selectedUsers.length > 0 && selectedRepos.length > 0 && !submitting

  const handleOrgChange = (value: string) => {
    setOrg(value)
    // Merge rather than replace, so the active tab survives.
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set('org', value)
        return next
      },
      { replace: true },
    )
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!canSubmit || !token) return

    const pairs = selectedUsers.flatMap((user) =>
      selectedRepos.map((repo) => ({ user, repo })),
    )

    setSubmitting(true)
    setResults(null)
    setProgress({ done: 0, total: pairs.length })

    const collected = await mapWithConcurrency<typeof pairs[number], GrantResult>(
      pairs,
      4,
      async ({ user, repo }) => {
        try {
          await addCollaborator(org, repo, user, permission, token, username ?? undefined)
          return { user, repo, ok: true }
        } catch (error) {
          return {
            user,
            repo,
            ok: false,
            message: error instanceof Error ? error.message : 'Request failed',
          }
        }
      },
      (done, total) => setProgress({ done, total }),
    )

    setSubmitting(false)
    setResults(collected)

    const failed = collected.filter((r) => !r.ok)
    if (failed.length === 0) {
      toast.success(`Granted ${PERMISSION_LABELS[permission]} access`, {
        description: `${collected.length} grant${
          collected.length === 1 ? '' : 's'
        } applied across ${selectedRepos.length} repositor${
          selectedRepos.length === 1 ? 'y' : 'ies'
        }.`,
      })
      useOrgData.getState().invalidate(org, username ?? undefined)
    } else {
      toast.error(`${failed.length} of ${collected.length} grants failed`, {
        description: 'Review the results below or check the Activity Log.',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Grant repository access</CardTitle>
            <CardDescription>
              Every selected user is added to every selected repository with the chosen
              permission.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="organization">Organization or account</Label>
                <Select value={org} onValueChange={handleOrgChange} disabled={submitting}>
                  <SelectTrigger id="organization" className="w-full">
                    <SelectValue
                      placeholder={
                        orgsLoading ? 'Loading accounts…' : 'Select an organization or account'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((option) => (
                      <SelectItem key={option.id} value={option.login}>
                        {option.login}
                        {option.personal && (
                          <span className="text-xs text-muted-foreground">personal</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Users</Label>
                <MultiSelect
                  options={userOptions}
                  value={selectedUsers}
                  onChange={setSelectedUsers}
                  disabled={!org || submitting}
                  loading={membersLoading}
                  placeholder="Select members or type a GitHub username"
                  searchPlaceholder="Search or type a username…"
                  emptyText="No members found — type a username to add it."
                  allowCustom
                  customLabel={(input) => `Add "${input}"`}
                />
                <p className="text-xs text-muted-foreground">
                  {org && isPersonalAccount(org)
                    ? "Personal accounts have no members, so type each GitHub username and press Enter — they'll receive an invitation."
                    : "Type any GitHub username and press Enter to include somebody who isn't a member yet — they'll receive an invitation."}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Repositories</Label>
                <MultiSelect
                  options={repoOptions}
                  value={selectedRepos}
                  onChange={setSelectedRepos}
                  disabled={!org || submitting}
                  loading={repoResource?.loading}
                  placeholder="Select repositories"
                  searchPlaceholder="Search repositories…"
                  emptyText="No repositories found."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="permission">Permission</Label>
                <Select
                  value={permission}
                  onValueChange={(value) => setPermission(value as AccessPermission)}
                  disabled={submitting}
                >
                  <SelectTrigger id="permission" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERMISSION_LABELS) as AccessPermission[]).map((value) => (
                      <SelectItem key={value} value={value}>
                        <div className="flex flex-col items-start">
                          <span>{PERMISSION_LABELS[value]}</span>
                          <span className="text-xs text-muted-foreground">
                            {PERMISSION_HINTS[value]}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {submitting && progress.total > 0 && (
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${(progress.done / progress.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {progress.done} of {progress.total} grants applied…
                  </p>
                </div>
              )}

              <Button type="submit" disabled={!canSubmit} className="w-full sm:w-auto">
                {submitting ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
                {submitting
                  ? 'Applying…'
                  : totalGrants > 0
                    ? `Grant ${PERMISSION_LABELS[permission]} · ${totalGrants} change${
                        totalGrants === 1 ? '' : 's'
                      }`
                    : 'Grant access'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="size-4" />
                Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <SummaryRow label="Account" value={org || '—'} />
              <SummaryRow label="Users" value={String(selectedUsers.length)} />
              <SummaryRow label="Repositories" value={String(selectedRepos.length)} />
              <SummaryRow label="Permission" value={PERMISSION_LABELS[permission]} />
              <SummaryRow label="API calls" value={String(totalGrants)} />
            </CardContent>
          </Card>

          <Alert>
            <Info className="size-4" />
            <AlertTitle>How grants apply</AlertTitle>
            <AlertDescription>
              Existing collaborators have their permission updated in place. Users outside
              the organization get an invitation they must accept.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Results</CardTitle>
            <CardDescription>
              {results.filter((r) => r.ok).length} succeeded,{' '}
              {results.filter((r) => !r.ok).length} failed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Status</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((result) => (
                    <TableRow key={`${result.user}/${result.repo}`}>
                      <TableCell>
                        {result.ok ? (
                          <Badge variant="secondary" className="gap-1">
                            <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />
                            OK
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <XCircle className="size-3" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{result.user}</TableCell>
                      <TableCell className="font-mono text-xs">{result.repo}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {result.ok
                          ? `${PERMISSION_LABELS[permission]} access granted`
                          : result.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  )
}
