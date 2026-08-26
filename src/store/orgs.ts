import { create } from 'zustand'
import { listOrganizations, type Organization } from '@/lib/github'
import { cacheKey, resolveResource } from '@/lib/response-cache'

interface OrgState {
  orgs: Organization[]
  loading: boolean
  error: string | null
  loadedFor: string | null
  /** True while the list on screen came from IndexedDB rather than GitHub. */
  fromCache: boolean
  cachedAt: number | null
  load: (token: string, actor?: string, force?: boolean) => Promise<void>
  reset: () => void
}

/** Shared org cache so the sidebar and the pages don't each hit `/user/orgs`. */
export const useOrgStore = create<OrgState>((set, get) => ({
  orgs: [],
  loading: false,
  error: null,
  loadedFor: null,
  fromCache: false,
  cachedAt: null,
  load: async (token, actor, force = false) => {
    const { loading, loadedFor } = get()
    if (loading) return
    if (!force && loadedFor === (actor ?? token)) return
    set({ loading: true, error: null })
    try {
      const { data, fromCache, cachedAt } = await resolveResource<Organization[]>({
        key: cacheKey(actor, 'orgs'),
        label: 'List organizations',
        force,
        actor,
        fetcher: () => listOrganizations(token, actor),
      })
      set({
        orgs: [...data].sort((a, b) => a.login.localeCompare(b.login)),
        loading: false,
        loadedFor: actor ?? token,
        fromCache,
        cachedAt,
      })
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load organizations',
      })
    }
  },
  reset: () =>
    set({
      orgs: [],
      loading: false,
      error: null,
      loadedFor: null,
      fromCache: false,
      cachedAt: null,
    }),
}))
