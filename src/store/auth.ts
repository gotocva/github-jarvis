import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GitHubUser } from '@/lib/github'

export interface AuthState {
  username: string | null
  token: string | null
  user: GitHubUser | null
  scopes: string[]
  signedInAt: number | null
  signIn: (payload: {
    username: string
    token: string
    user: GitHubUser
    scopes: string[]
  }) => void
  signOut: () => void
}

/**
 * The PAT lives in localStorage so the session survives reloads. Anything with
 * script access to this origin can read it — treat it like a stored password.
 */
export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      username: null,
      token: null,
      user: null,
      scopes: [],
      signedInAt: null,
      signIn: ({ username, token, user, scopes }) =>
        set({ username, token, user, scopes, signedInAt: Date.now() }),
      signOut: () =>
        set({ username: null, token: null, user: null, scopes: [], signedInAt: null }),
    }),
    { name: 'github-jarvis-auth' },
  ),
)

export const useIsAuthenticated = () => useAuth((s) => Boolean(s.token && s.user))

/**
 * True when `login` is the signed-in user's own account rather than a real
 * organization. Read straight from the session so it doesn't depend on the
 * organization list having loaded yet.
 */
export function isPersonalAccount(login: string) {
  const { username } = useAuth.getState()
  return Boolean(username && login.toLowerCase() === username.toLowerCase())
}

/** Credentials for API calls; throws if called from an unauthenticated view. */
export function useCredentials() {
  const token = useAuth((s) => s.token)
  const username = useAuth((s) => s.username)
  return { token: token ?? '', actor: username ?? undefined }
}
