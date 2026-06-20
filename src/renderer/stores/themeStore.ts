import { create } from 'zustand'
import type { Theme } from '../../shared/types'

interface ThemeState {
  theme: Theme
  toggle: () => void
  setTheme: (theme: Theme) => void
  /** 从统一配置同步主题 */
  syncFromConfig: () => Promise<void>
}

export const useThemeStore = create<ThemeState>((set) => ({
  theme: (localStorage.getItem('cc-theme') as Theme) || 'dark',

  toggle: () =>
    set((state) => {
      const next = state.theme === 'dark' ? 'light' : 'dark'
      localStorage.setItem('cc-theme', next)
      // 同步写入统一配置
      window.electronAPI.setConfig('theme', next).catch(() => {})
      return { theme: next }
    }),

  setTheme: (theme: Theme) => {
    localStorage.setItem('cc-theme', theme)
    set({ theme })
  },

  syncFromConfig: async () => {
    try {
      const config = await window.electronAPI.getConfig()
      if (config?.theme && config.theme !== useThemeStore.getState().theme) {
        localStorage.setItem('cc-theme', config.theme)
        set({ theme: config.theme })
      }
    } catch {}
  }
}))
