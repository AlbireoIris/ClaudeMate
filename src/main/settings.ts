import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import type { FavoriteFolder } from '../shared/types'

const configDir = join(app.getPath('userData'), 'config')
const foldersFile = join(configDir, 'folders.json')

/** 默认常用文件夹 */
const DEFAULT_FOLDERS: FavoriteFolder[] = [
  {
    id: 'default-projects',
    name: '项目资料',
    path: app.getPath('documents'),
    icon: 'folder-open'
  },
  {
    id: 'default-downloads',
    name: '下载文件',
    path: app.getPath('downloads'),
    icon: 'download'
  },
  {
    id: 'default-results',
    name: '分析结果',
    path: app.getPath('desktop'),
    icon: 'file-text'
  }
]

function ensureConfigDir(): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true })
  }
}

function readFolders(): FavoriteFolder[] {
  ensureConfigDir()
  try {
    if (existsSync(foldersFile)) {
      const data = readFileSync(foldersFile, 'utf-8')
      return JSON.parse(data)
    }
  } catch {
    // 配置文件损坏，使用默认值
  }
  return [...DEFAULT_FOLDERS]
}

function writeFolders(folders: FavoriteFolder[]): void {
  ensureConfigDir()
  writeFileSync(foldersFile, JSON.stringify(folders, null, 2), 'utf-8')
}

export function getStoredFolders(): FavoriteFolder[] {
  return readFolders()
}

export function addStoredFolder(name: string, path: string): FavoriteFolder {
  const folders = readFolders()
  const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const folder: FavoriteFolder = { id, name, path }
  folders.push(folder)
  writeFolders(folders)
  return folder
}

export function removeStoredFolder(folderId: string): boolean {
  const folders = readFolders()
  const index = folders.findIndex(f => f.id === folderId)
  if (index === -1) return false

  // 不允许删除默认文件夹
  if (folders[index].id.startsWith('default-')) return false

  folders.splice(index, 1)
  writeFolders(folders)
  return true
}
