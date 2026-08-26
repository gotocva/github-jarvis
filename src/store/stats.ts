import { create } from 'zustand'
import {
  getContributorStats,
  mapWithConcurrency,
  StatsPendingError,
  type ContributorStat,
} from '@/lib/github'
import { cacheKey, resolveResource } from '@/lib/response-cache'

interface Resource<T> {
  data: T | null
  loading: boolean
  error: string | null
  fromCache?: boolean
  cachedAt?: number
}

interface StatsState {
  /** Keyed by `owner/repo`. */
  byRepo: Record<string, Resource<ContributorStat[]>>
  /** Progress of the multi-repo fan-out the user dashboard runs. */
  progress: { done: number; total: number } | null
  /** Repositories GitHub was still computing when we last asked. */
  pending: string[]
  loadRepo: (
    owner: string,
    repo: string,
    token: string,
    actor?: string,
    force?: boolean,
  ) => Promise<void>
  loadRepos: (
    owner: string,
    repos: string[],
    token: string,
    actor?: string,
    force?: boolean,
  ) => Promise<void>
  invalidate: (owner: string, repos: string[], actor?: string) => void
}

export const statsKey = (owner: string, repo: string) => `${owner}/${repo}`

const idle: Resource<ContributorStat[]> = { data: null, loading: false, error: null }

/** Shares one in-flight request per repo between the two dashboards. */
const inflight = new Map<string, Promise<void>>()

export const useStats = create<StatsState>((set, get) => ({
  byRepo: {},
  progress: null,
  pending: [],

  loadRepo: (owner, repo, token, actor, force = false) => {
    const key = statsKey(owner, repo)
    const current = get().byRepo[key] ?? idle
    if (!force && current.data) return Promise.resolve()

    const existing = inflight.get(key)
    if (existing) return existing

    const run = (async () => {
      set((s) => ({ byRepo: { ...s.byRepo, [key]: { ...current, loading: true, error: null } } }))
      try {
        const { data, fromCache, cachedAt } = await resolveResource<ContributorStat[]>({
          key: cacheKey(actor, `repo:${key}:stats`),
          label: `Get contributor stats for ${key}`,
          force,
          actor,
          fetcher: () => getContributorStats(owner, repo, token, actor),
        })
        set((s) => ({
          byRepo: { ...s.byRepo, [key]: { data, loading: false, error: null, fromCache, cachedAt } },
          pending: s.pending.filter((r) => r !== key),
        }))
      } catch (error) {
        const pending = error instanceof StatsPendingError
        set((s) => ({
          byRepo: {
            ...s.byRepo,
            [key]: {
              data: current.data,
              loading: false,
              error: error instanceof Error ? error.message : 'Failed to load statistics',
            },
          },
          pending: pending && !s.pending.includes(key) ? [...s.pending, key] : s.pending,
        }))
      }
    })().finally(() => inflight.delete(key))

    inflight.set(key, run)
    return run
  },

  /** One call per repository, so it runs bounded and reports progress. */
  loadRepos: async (owner, repos, token, actor, force = false) => {
    const outstanding = force
      ? repos
      : repos.filter((repo) => !get().byRepo[statsKey(owner, repo)]?.data)

    if (outstanding.length === 0) {
      set({ progress: null })
      return
    }

    set({ progress: { done: 0, total: outstanding.length } })
    await mapWithConcurrency(
      outstanding,
      4,
      (repo) => get().loadRepo(owner, repo, token, actor, force),
      (done, total) => set({ progress: { done, total } }),
    )
    set({ progress: null })
  },

  invalidate: (owner, repos, actor) => {
    void actor
    set((s) => {
      const byRepo = { ...s.byRepo }
      for (const repo of repos) delete byRepo[statsKey(owner, repo)]
      return { byRepo, pending: [] }
    })
  },
}))
