import { create } from 'zustand'
import type { DenyRule } from '../../shared/config-types'

// 暴露给 E2E 测试 — 刷新 DenyPanel UI
if (typeof window !== 'undefined') {
  (window as any).__DENY_STORE_REFRESH__ = () => {
    useDenyStore.getState().loadRules()
  }
}

interface DenyState {
  rules: DenyRule[]
  loaded: boolean

  loadRules: () => Promise<void>
  addRule: (path: string, denyRead: boolean, denyWrite: boolean) => Promise<DenyRule | null>
  removeRule: (id: string) => Promise<void>
  updateRule: (id: string, patch: Partial<Pick<DenyRule, 'denyRead' | 'denyWrite'>>) => Promise<void>
}

export const useDenyStore = create<DenyState>((set, get) => ({
  rules: [],
  loaded: false,

  loadRules: async () => {
    try {
      const rules = await window.electronAPI.getDenyRules()
      set({ rules: rules || [], loaded: true })
    } catch {
      set({ loaded: true })
    }
  },

  addRule: async (path, denyRead, denyWrite) => {
    try {
      console.log('[denyStore] addDenyRule IPC call:', path, denyRead, denyWrite)
      const rule = await window.electronAPI.addDenyRule(path, denyRead, denyWrite)
      console.log('[denyStore] addDenyRule result:', rule)
      if (rule) {
        set({ rules: [...get().rules, rule] })
        console.log('[denyStore] rules updated:', get().rules.length)
      }
      return rule
    } catch (e) {
      console.error('[denyStore] addRule error:', e)
      return null
    }
  },

  removeRule: async (id) => {
    try {
      await window.electronAPI.removeDenyRule(id)
      set({ rules: get().rules.filter(r => r.id !== id) })
    } catch {}
  },

  updateRule: async (id, patch) => {
    try {
      const updated = await window.electronAPI.updateDenyRule(id, patch)
      if (updated) set({ rules: get().rules.map(r => r.id === id ? updated : r) })
    } catch {}
  },
}))
