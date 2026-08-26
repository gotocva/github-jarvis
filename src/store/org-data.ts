import { create } from 'zustand'
import { cacheKey, deleteCache, resolveResource, writeCache } from '@/lib/response-cache'
import { cachedOrgMembers } from '@/lib/github-resources'
import {
  listOrgRepos,
  listOwnedRepos,
  listRepoCollaborators,
  mapWithConcurrency,
  type Collaborator,
  type Repository,
} from '@/lib/github'
import { isPersonalAccount } from '@/store/auth'

export type RepoRole = 'admin' | 'maintain' | 'write' | 'triage' | 'read'

export interface UserRepoAccess {
  repo: string
  role: RepoRole
}

export interface OrgUser {
  login: string
  id: number
  avatarUrl: string
  htmlUrl: string
  /** True when the account is a member of the org itself, not just a repo collaborator. */
  isOrgMember: boolean
  access: UserRepoAccess[]
}

interface Resource<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** True while the data on screen came from IndexedDB rather than GitHub. */
  fromCache?: boolean
  cachedAt?: number
  /** Progress for the fan-out that builds the user list. */
  progress?: { done: number; total: number }
}

interface OrgDataState {
  repos: Record<string, Resource<Repository[]>>
  users: Record<string, Resource<OrgUser[]>>
  loadRepos: (org: string, token: string, actor?: string, force?: boolean) => Promise<void>
  loadUsers: (org: string, token: string, actor?: string, force?: boolean) => Promise<void>
  removeUserLocally: (org: string, login: string, actor?: string) => void
  invalidate: (org: string, actor?: string) => void
}

const empty = <T,>(): Resource<T> => ({ data: null, loading: false, error: null })

function roleOf(collaborator: Collaborator): RepoRole {
  if (collaborator.role_name) {
    const name = collaborator.role_name.toLowerCase()
    if (name === 'admin' || name === 'maintain' || name === 'triage') return name
    if (name === 'write' || name === 'push') return 'write'
    if (name === 'read' || name === 'pull') return 'read'
  }
  const p = collaborator.permissions
  if (p?.admin) return 'admin'
  if (p?.maintain) return 'maintain'
  if (p?.push) return 'write'
  if (p?.triage) return 'triage'
  return 'read'
}

export const useOrgData = create<OrgDataState>((set, get) => ({
  repos: {},
  users: {},

  loadRepos: async (org, token, actor, force = false) => {
    const current = get().repos[org] ?? empty<Repository[]>()
    if (current.loading) return
    if (!force && current.data) return

    set((s) => ({ repos: { ...s.repos, [org]: { ...current, loading: true, error: null } } }))
    try {
      const { data, fromCache, cachedAt } = await resolveResource<Repository[]>({
        key: cacheKey(actor, `org:${org}:repos`),
        label: `List repositories in ${org}`,
        force,
        actor,
        fetcher: () =>
          isPersonalAccount(org)
            ? listOwnedRepos(token, actor)
            : listOrgRepos(org, token, actor),
      })
      set((s) => ({
        repos: {
          ...s.repos,
          [org]: { data, loading: false, error: null, fromCache, cachedAt },
        },
      }))
    } catch (error) {
      set((s) => ({
        repos: {
          ...s.repos,
          [org]: {
            data: current.data,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load repositories',
          },
        },
      }))
    }
  },

  loadUsers: async (org, token, actor, force = false) => {
    const current = get().users[org] ?? empty<OrgUser[]>()
    if (current.loading) return
    if (!force && current.data) return

    set((s) => ({
      users: {
        ...s.users,
        [org]: { ...current, loading: true, error: null, progress: { done: 0, total: 0 } },
      },
    }))

    try {
      const { data, fromCache, cachedAt } = await resolveResource<OrgUser[]>({
        key: cacheKey(actor, `org:${org}:users`),
        label: `List users of ${org}`,
        force,
        actor,
        fetcher: () => buildOrgUsers(org, token, actor, force, set, get),
      })

      set((s) => ({
        users: {
          ...s.users,
          [org]: { data, loading: false, error: null, fromCache, cachedAt, progress: undefined },
        },
      }))
    } catch (error) {
      set((s) => ({
        users: {
          ...s.users,
          [org]: {
            data: current.data,
            loading: false,
            error: error instanceof Error ? error.message : 'Failed to load users',
            progress: undefined,
          },
        },
      }))
    }
  },

  removeUserLocally: (org, login, actor) => {
    const resource = get().users[org]
    if (!resource?.data) return
    const remaining = resource.data.filter(
      (u) => u.login.toLowerCase() !== login.toLowerCase(),
    )
    set((s) => ({ users: { ...s.users, [org]: { ...s.users[org], data: remaining } } }))
    void writeCache(cacheKey(actor, `org:${org}:users`), remaining)
  },

  invalidate: (org, actor) => {
    void deleteCache(cacheKey(actor, `org:${org}:repos`))
    void deleteCache(cacheKey(actor, `org:${org}:users`))
    set((s) => {
      const repos = { ...s.repos }
      const users = { ...s.users }
      delete repos[org]
      delete users[org]
      return { repos, users }
    })
  },
}))

/**
 * Builds the "who can touch anything in this org" list by unioning the
 * collaborators of every repo, then marking which of them are org members.
 */
async function buildOrgUsers(
  org: string,
  token: string,
  actor: string | undefined,
  force: boolean,
  set: (fn: (s: OrgDataState) => Partial<OrgDataState>) => void,
  get: () => OrgDataState,
): Promise<OrgUser[]> {
  await get().loadRepos(org, token, actor, force)
  const repos = get().repos[org]?.data ?? []

  // A personal account has no members — everyone on it is a repo collaborator.
  const members = isPersonalAccount(org)
    ? []
    : await cachedOrgMembers(org, token, actor, force)
        .then((r) => r.data)
        .catch(() => [])
  const memberLogins = new Set(members.map((m) => m.login.toLowerCase()))

  const byLogin = new Map<string, OrgUser>()

  await mapWithConcurrency(
    repos,
    6,
    async (repo) => {
      try {
        const collaborators = await listRepoCollaborators(org, repo.name, token, actor)
        for (const collaborator of collaborators) {
          const key = collaborator.login.toLowerCase()
          const existing = byLogin.get(key)
          const entry: UserRepoAccess = { repo: repo.name, role: roleOf(collaborator) }
          if (existing) {
            existing.access.push(entry)
          } else {
            byLogin.set(key, {
              login: collaborator.login,
              id: collaborator.id,
              avatarUrl: collaborator.avatar_url,
              htmlUrl: collaborator.html_url,
              isOrgMember: memberLogins.has(key),
              access: [entry],
            })
          }
        }
      } catch {
        // A repo we can't read collaborators for shouldn't sink the whole list;
        // the failure is already visible in the activity log.
      }
    },
    (done, total) =>
      set((s) => ({
        users: { ...s.users, [org]: { ...s.users[org], progress: { done, total } } },
      })),
  )

  // Org members with no repo-level grant still belong in the list.
  for (const member of members) {
    const key = member.login.toLowerCase()
    if (!byLogin.has(key)) {
      byLogin.set(key, {
        login: member.login,
        id: member.id,
        avatarUrl: member.avatar_url,
        htmlUrl: member.html_url,
        isOrgMember: true,
        access: [],
      })
    }
  }

  return [...byLogin.values()].sort(
    (a, b) => b.access.length - a.access.length || a.login.localeCompare(b.login),
  )
}
