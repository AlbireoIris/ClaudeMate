import { create } from 'zustand'
import type { Theme } from '../../shared/types'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('cc-theme') as Theme) || 'dark',

  toggle: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cc-theme', next)
      return { theme: next }
    }),

  setTheme: (theme: Theme) => {
    localStorage.setItem('cc-theme', theme)
    set({ theme })
  }
}))
