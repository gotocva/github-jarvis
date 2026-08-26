import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Theme = 'light' | 'dark' | 'system'

interface ThemeState {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const media = () => window.matchMedia('(prefers-color-scheme: dark)')

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && media().matches)
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => {
        applyTheme(theme)
        set({ theme })
      },
    }),
    {
      name: 'github-jarvis-theme',
      onRehydrateStorage: () => (state) => applyTheme(state?.theme ?? 'system'),
    },
  ),
)

/** Follow the OS while the choice is "system". */
media().addEventListener('change', () => {
  if (useTheme.getState().theme === 'system') applyTheme('system')
})
