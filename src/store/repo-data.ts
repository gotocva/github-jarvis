import { create } from 'zustand'
import { cacheKey, deleteCache, resolveResource, writeCache } from '@/lib/response-cache'
import {
  getCommit,
  getRepository,
  listBranches,
  listRepoCollaborators,
  mapWithConcurrency,
  type Branch,
  type Repository,
} from '@/lib/github'
import type { RepoRole } from '@/store/org-data'

export interface BranchRow {
  name: string
  sha: string
  protected: boolean
  isDefault: boolean
  /** Filled in by the opt-in commit-detail pass. */
  lastCommitDate?: string
  lastCommitMessage?: string
  lastCommitAuthor?: string
}

export interface RepoUser {
  login: string
  id: number
  avatarUrl: string
  htmlUrl: string
  role: RepoRole
}

interface Resource<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** True while the data on screen came from IndexedDB rather than GitHub. */
  fromCache?: boolean
  cachedAt?: number
  progress?: { done: number; total: number }
}

interface RepoDataState {
  repo: Record<string, Resource<Repository>>
  branches: Record<string, Resource<BranchRow[]>>
  users: Record<string, Resource<RepoUser[]>>
  /** Keys where the per-branch commit lookup has already run. */
  commitsLoaded: Record<string, boolean>
  loadRepo: (org: string, repo: string, token: string, actor?: string, force?: boolean) => Promise<void>
  loadBranches: (org: string, repo: string, token: string, actor?: string, force?: boolean) => Promise<void>
  loadCommitDetails: (org: string, repo: string, token: string, actor?: string) => Promise<void>
  loadUsers: (org: string, repo: string, token: string, actor?: string, force?: boolean) => Promise<void>
  removeBranchesLocally: (key: string, names: string[], actor?: string) => void
  removeUsersLocally: (key: string, logins: string[], actor?: string) => void
  invalidate: (key: string, actor?: string) => void
}

export const repoKey = (org: string, repo: string) => `${org}/${repo}`

/**
 * The repo record is requested both by the page header and by the branch loader
 * (which needs `default_branch`). Sharing the in-flight promise keeps the second
 * caller from skipping the wait and reading an empty record.
 */
const inflightRepo = new Map<string, Promise<void>>()

const idle = <T,>(): Resource<T> => ({ data: null, loading: false, error: null })
const message = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

function roleOf(collaborator: {
  role_name?: string
  permissions?: { admin: boolean; maintain?: boolean; push: boolean; triage?: boolean; pull: boolean }
}): RepoRole {
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

export const useRepoData = create<RepoDataState>((set, get) => ({
  repo: {},
  branches: {},
  users: {},
  commitsLoaded: {},

  loadRepo: (org, repo, token, actor, force = false) => {
    const key = repoKey(org, repo)
    const current = get().repo[key] ?? idle<Repository>()
    if (!force && current.data) return Promise.resolve()

    const existing = inflightRepo.get(key)
    if (existing) return existing

    const run = (async () => {
      set((s) => ({ repo: { ...s.repo, [key]: { ...current, loading: true, error: null } } }))
      try {
        const { data, fromCache, cachedAt } = await resolveResource<Repository>({
          key: cacheKey(actor, `repo:${key}`),
          label: `Get repository ${key}`,
          force,
          actor,
          fetcher: () => getRepository(org, repo, token, actor),
        })
        set((s) => ({
          repo: { ...s.repo, [key]: { data, loading: false, error: null, fromCache, cachedAt } },
        }))
      } catch (error) {
        set((s) => ({
          repo: {
            ...s.repo,
            [key]: {
              data: current.data,
              loading: false,
              error: message(error, 'Failed to load repository'),
            },
          },
        }))
      }
    })().finally(() => inflightRepo.delete(key))

    inflightRepo.set(key, run)
    return run
  },

  loadBranches: async (org, repo, token, actor, force = false) => {
    const key = repoKey(org, repo)
    const current = get().branches[key] ?? idle<BranchRow[]>()
    if (current.loading || (!force && current.data)) return

    set((s) => ({
      branches: { ...s.branches, [key]: { ...current, loading: true, error: null } },
    }))
    try {
      const { data, fromCache, cachedAt } = await resolveResource<BranchRow[]>({
        key: cacheKey(actor, `repo:${key}:branches`),
        label: `List branches of ${key}`,
        force,
        actor,
        fetcher: async () => {
          // The repo record supplies the default branch, which must never be deletable.
          await get().loadRepo(org, repo, token, actor, force)
          const defaultBranch = get().repo[key]?.data?.default_branch

          const branches: Branch[] = await listBranches(org, repo, token, actor)
          return branches
            .map((branch) => ({
              name: branch.name,
              sha: branch.commit.sha,
              protected: branch.protected,
              isDefault: branch.name === defaultBranch,
            }))
            .sort(
              (a, b) =>
                Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name),
            )
        },
      })

      set((s) => ({
        branches: {
          ...s.branches,
          [key]: { data, loading: false, error: null, fromCache, cachedAt },
        },
        // A cached list may already carry commit details from the pass that stored it.
        commitsLoaded: {
          ...s.commitsLoaded,
          [key]: data.length > 0 && data.every((b) => Boolean(b.lastCommitDate)),
        },
      }))
    } catch (error) {
      set((s) => ({
        branches: {
          ...s.branches,
          [key]: {
            data: current.data,
            loading: false,
            error: message(error, 'Failed to load branches'),
          },
        },
      }))
    }
  },

  /**
   * One extra API call per branch, so it's opt-in: without it there's no way to
   * tell which branches are stale.
   */
  loadCommitDetails: async (org, repo, token, actor) => {
    const key = repoKey(org, repo)
    const rows = get().branches[key]?.data
    if (!rows || rows.length === 0) return

    set((s) => ({
      branches: {
        ...s.branches,
        [key]: { ...s.branches[key], progress: { done: 0, total: rows.length } },
      },
    }))

    const details = new Map<string, Partial<BranchRow>>()
    await mapWithConcurrency(
      rows,
      6,
      async (row) => {
        try {
          const commit = await getCommit(org, repo, row.sha, token, actor)
          details.set(row.name, {
            lastCommitDate: commit.commit.committer?.date ?? commit.commit.author?.date,
            lastCommitMessage: commit.commit.message.split('\n')[0],
            lastCommitAuthor: commit.author?.login ?? commit.commit.author?.name,
          })
        } catch {
          // Leave the row without commit info; the failure shows in the activity log.
        }
      },
      (done, total) =>
        set((s) => ({
          branches: {
            ...s.branches,
            [key]: { ...s.branches[key], progress: { done, total } },
          },
        })),
    )

    const enriched = (get().branches[key]?.data ?? []).map((row) => ({
      ...row,
      ...details.get(row.name),
    }))

    set((s) => ({
      branches: {
        ...s.branches,
        [key]: { ...s.branches[key], progress: undefined, data: enriched },
      },
      commitsLoaded: { ...s.commitsLoaded, [key]: true },
    }))

    // Keep the cached copy in step so the dates survive a reload.
    await writeCache(cacheKey(actor, `repo:${key}:branches`), enriched)
  },

  loadUsers: async (org, repo, token, actor, force = false) => {
    const key = repoKey(org, repo)
    const current = get().users[key] ?? idle<RepoUser[]>()
    if (current.loading || (!force && current.data)) return

    set((s) => ({ users: { ...s.users, [key]: { ...current, loading: true, error: null } } }))
    try {
      const { data, fromCache, cachedAt } = await resolveResource<RepoUser[]>({
        key: cacheKey(actor, `repo:${key}:collaborators`),
        label: `List collaborators of ${key}`,
        force,
        actor,
        fetcher: async () => {
          const collaborators = await listRepoCollaborators(org, repo, token, actor)
          return collaborators
            .map((collaborator) => ({
              login: collaborator.login,
              id: collaborator.id,
              avatarUrl: collaborator.avatar_url,
              htmlUrl: collaborator.html_url,
              role: roleOf(collaborator),
            }))
            .sort((a, b) => a.login.localeCompare(b.login))
        },
      })
      set((s) => ({
        users: { ...s.users, [key]: { data, loading: false, error: null, fromCache, cachedAt } },
      }))
    } catch (error) {
      set((s) => ({
        users: {
          ...s.users,
          [key]: {
            data: current.data,
            loading: false,
            error: message(error, 'Failed to load collaborators'),
          },
        },
      }))
    }
  },

  removeBranchesLocally: (key, names, actor) => {
    const resource = get().branches[key]
    if (!resource?.data) return
    const gone = new Set(names)
    const remaining = resource.data.filter((b) => !gone.has(b.name))
    set((s) => ({
      branches: { ...s.branches, [key]: { ...s.branches[key], data: remaining } },
    }))
    void writeCache(cacheKey(actor, `repo:${key}:branches`), remaining)
  },

  removeUsersLocally: (key, logins, actor) => {
    const resource = get().users[key]
    if (!resource?.data) return
    const gone = new Set(logins.map((l) => l.toLowerCase()))
    const remaining = resource.data.filter((u) => !gone.has(u.login.toLowerCase()))
    set((s) => ({ users: { ...s.users, [key]: { ...s.users[key], data: remaining } } }))
    void writeCache(cacheKey(actor, `repo:${key}:collaborators`), remaining)
  },

  invalidate: (key, actor) => {
    void deleteCache(cacheKey(actor, `repo:${key}`))
    void deleteCache(cacheKey(actor, `repo:${key}:branches`))
    void deleteCache(cacheKey(actor, `repo:${key}:collaborators`))
    set((s) => {
      const repo = { ...s.repo }
      const branches = { ...s.branches }
      const users = { ...s.users }
      const commitsLoaded = { ...s.commitsLoaded }
      delete repo[key]
      delete branches[key]
      delete users[key]
      delete commitsLoaded[key]
      return { repo, branches, users, commitsLoaded }
    })
  },
}))
