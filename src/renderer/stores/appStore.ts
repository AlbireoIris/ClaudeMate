import { create } from 'zustand'
import type { FavoriteFolder, FileItem } from '../../shared/types'

interface AppState {
  folders: FavoriteFolder[]
  foldersLoaded: boolean
  pendingFiles: FileItem[]

  loadFolders: () => Promise<void>
  addFolder: () => Promise<void>
  removeFolder: (id: string) => Promise<void>

  // 待发送文件（共享给 Sidebar 和 MainArea）
  attachFiles: (files: FileItem[]) => void
  removeFile: (path: string) => void
  clearFiles: () => void
}

export const useAppStore = create<AppState>((set) => ({
  folders: [],
  foldersLoaded: false,
  pendingFiles: [],

  loadFolders: async () => {
    try {
      const folders = await window.electronAPI.getFolders()
      set({ folders, foldersLoaded: true })
    } catch { set({ foldersLoaded: true }) }
  },

  addFolder: async () => {
    try {
      const folder = await window.electronAPI.addFolder()
      if (folder) set(s => ({ folders: [...s.folders, folder] }))
    } catch {}
  },

  removeFolder: async (id) => {
    try {
      await window.electronAPI.removeFolder(id)
      set(s => ({ folders: s.folders.filter(f => f.id !== id) }))
    } catch {}
  },

  attachFiles: (files) => set(s => {
    const ex = new Set(s.pendingFiles.map(f => f.path))
    return { pendingFiles: [...s.pendingFiles, ...files.filter(f => !ex.has(f.path))] }
  }),

  removeFile: (path) => set(s => ({
    pendingFiles: s.pendingFiles.filter(f => f.path !== path)
  })),

  clearFiles: () => set({ pendingFiles: [] })
}))
