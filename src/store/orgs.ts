import { create } from 'zustand'
import { listOrganizations, type Organization } from '@/lib/github'
import { cacheKey, resolveResource } from '@/lib/response-cache'
import { useAuth } from '@/store/auth'

export interface Account extends Organization {
  /** True for the signed-in user's own account rather than a real organization. */
  personal: boolean
}

interface OrgState {
  orgs: Account[]
  loading: boolean
  error: string | null
  loadedFor: string | null
  /** True while the list on screen came from IndexedDB rather than GitHub. */
  fromCache: boolean
  cachedAt: number | null
  load: (token: string, actor?: string, force?: boolean) => Promise<void>
  reset: () => void
}

/**
 * The signed-in account is presented alongside the organizations so personal
 * repositories are reachable the same way. It's derived from the session rather
 * than cached, since the cache holds the raw `/user/orgs` response.
 */
function personalAccount(): Account | null {
  const { user } = useAuth.getState()
  if (!user) return null
  return {
    login: user.login,
    id: user.id,
    avatar_url: user.avatar_url,
    description: user.name ?? 'Your personal repositories',
    personal: true,
  }
}

/** Shared cache so the sidebar and the pages don't each hit `/user/orgs`. */
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

      const personal = personalAccount()
      const organizations: Account[] = [...data]
        .sort((a, b) => a.login.localeCompare(b.login))
        .map((org) => ({ ...org, personal: false }))

      set({
        orgs: personal ? [personal, ...organizations] : organizations,
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
