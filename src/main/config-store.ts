/**
 * 统一配置存储
 *
 *   cc-config.conf    — 用户可编辑（主题、文件夹、Claude API、窗口开关）
 *   window-state.json — 内部存储（窗口坐标/大小）
 *
 * 路径：
 *   开发模式：项目根目录/config/
 *   打包后：exe 同目录/config/
 */
import { app } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs'
import { homedir } from 'os'
import type { AppConfig, WindowState, ClaudeProfile } from '../shared/config-types'
import { getDefaultConfig, DEFAULT_WINDOW_STATE } from '../shared/config-types'
import type { FavoriteFolder } from '../shared/types'
import { stringifyConfig, parseConfig } from './config-file'

// ---- 路径 ----

function getProjectRoot(): string {
  if (!app.isPackaged) return join(__dirname, '../..')
  return dirname(app.getPath('exe'))
}

const configDir = join(getProjectRoot(), 'config')
const configFile = join(configDir, 'cc-config.conf')
const configTmp = join(configDir, 'cc-config.tmp')
const windowStateFile = join(configDir, 'window-state.json')

function ensureDir(): void {
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
}

// ---- 迁移 ----

function tryMigrateClaudeConfig(): Partial<ClaudeConfig> {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    if (!existsSync(settingsPath)) return {}
    const raw = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const env = settings.env || {}
    let overrides: any = {}
    try {
      const overridePath = join(homedir(), '.claude', 'cc-assistant.json')
      overrides = JSON.parse(readFileSync(overridePath, 'utf-8'))
    } catch {}
    return {
      baseURL: env.ANTHROPIC_BASE_URL || '',
      apiKey: env.ANTHROPIC_AUTH_TOKEN || '',
      model: overrides.model || env.ANTHROPIC_MODEL || 'deepseek-v4-pro[1m]',
      effort: overrides.effort || 'medium',
      thinking: overrides.thinking ?? true
    }
  } catch { return {} }
}

// ---- AppConfig（用户可编辑） ----

export function loadConfig(): AppConfig {
  ensureDir()
  try {
    if (existsSync(configFile)) {
      const raw = readFileSync(configFile, 'utf-8')
      return parseConfig(raw)
    }
  } catch { /* 损坏则重建 */ }

  // 首次运行：迁移旧配置
  const config = getDefaultConfig()
  const migrated = tryMigrateClaudeConfig()
  if (migrated.baseURL || migrated.apiKey) {
    config.claude = { ...config.claude, ...migrated }
  }
  // 尝试迁移旧 JSON 格式
  try {
    const oldJson = join(configDir, 'cc-config.json')
    if (existsSync(oldJson)) {
      const saved = JSON.parse(readFileSync(oldJson, 'utf-8'))
      if (saved.theme) config.theme = saved.theme
      if (saved.window) config.window = { ...config.window, ...saved.window }
      if (saved.folders) config.folders = saved.folders
      if (saved.claude) config.claude = { ...config.claude, ...saved.claude }
    }
  } catch {}
  try {
    const oldFolders = join(configDir, 'folders.json')
    if (existsSync(oldFolders)) {
      config.folders = JSON.parse(readFileSync(oldFolders, 'utf-8'))
    }
  } catch {}
  saveConfig(config)
  return config
}

export function saveConfig(config: AppConfig): void {
  ensureDir()
  writeFileSync(configTmp, stringifyConfig(config), 'utf-8')
  renameSync(configTmp, configFile)
}

export function updateConfig<K extends keyof AppConfig>(section: K, data: AppConfig[K]): void {
  const config = loadConfig()
  config[section] = data
  saveConfig(config)
}

// ---- WindowState（内部存储） ----

export function loadWindowState(): WindowState {
  ensureDir()
  try {
    if (existsSync(windowStateFile)) {
      const saved = JSON.parse(readFileSync(windowStateFile, 'utf-8'))
      return { ...DEFAULT_WINDOW_STATE, ...saved }
    }
  } catch { /* 损坏则忽略 */ }
  return { ...DEFAULT_WINDOW_STATE }
}

export function saveWindowState(state: WindowState): void {
  ensureDir()
  writeFileSync(windowStateFile, JSON.stringify(state), 'utf-8')
}

// ---- 文件夹 ----

export function getStoredFolders(): FavoriteFolder[] {
  return loadConfig().folders
}

export function addStoredFolder(name: string, path: string): FavoriteFolder {
  const config = loadConfig()
  const id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const folder: FavoriteFolder = { id, name, path }
  config.folders.push(folder)
  saveConfig(config)
  return folder
}

export function removeStoredFolder(folderId: string): boolean {
  const config = loadConfig()
  const index = config.folders.findIndex(f => f.id === folderId)
  if (index === -1) return false
  if (config.folders[index].id.startsWith('default-')) return false
  config.folders.splice(index, 1)
  saveConfig(config)
  return true
}

// ---- 禁入规则 ----

import type { DenyRule } from '../shared/config-types'

export function getDenyRules(): DenyRule[] {
  return loadConfig().denyRules
}

export function addDenyRule(path: string, denyRead: boolean, denyWrite: boolean): DenyRule {
  const config = loadConfig()
  const id = `deny-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const rule: DenyRule = { id, path, denyRead, denyWrite }
  config.denyRules.push(rule)
  saveConfig(config)
  return rule
}

export function removeDenyRule(id: string): boolean {
  const config = loadConfig()
  const index = config.denyRules.findIndex(r => r.id === id)
  if (index === -1) return false
  config.denyRules.splice(index, 1)
  saveConfig(config)
  return true
}

export function updateDenyRule(id: string, patch: Partial<Pick<DenyRule, 'denyRead' | 'denyWrite'>>): DenyRule | null {
  const config = loadConfig()
  const rule = config.denyRules.find(r => r.id === id)
  if (!rule) return null
  if (patch.denyRead !== undefined) rule.denyRead = patch.denyRead
  if (patch.denyWrite !== undefined) rule.denyWrite = patch.denyWrite
  saveConfig(config)
  return rule
}

// ---- Claude / Profiles ----

import type { ClaudeProfile } from '../shared/config-types'

/** 获取当前活跃的 Profile */
export function getActiveProfile(): ClaudeProfile {
  const cfg = loadConfig().claude
  if (cfg.profiles.length === 0) {
    const def = getDefaultConfig().claude.profiles[0]
    return def
  }
  const idx = Math.min(cfg.activeProfile, cfg.profiles.length - 1)
  return cfg.profiles[idx]
}

/** 获取所有 Profile */
export function getProfiles(): ClaudeProfile[] {
  return loadConfig().claude.profiles
}

/** 切换活跃 Profile */
export function switchProfile(index: number): void {
  const config = loadConfig()
  if (index >= 0 && index < config.claude.profiles.length) {
    config.claude.activeProfile = index
    saveConfig(config)
  }
}

/** 更新指定 Profile */
export function updateProfile(index: number, profile: ClaudeProfile): void {
  const config = loadConfig()
  if (index >= 0 && index < config.claude.profiles.length) {
    config.claude.profiles[index] = profile
    saveConfig(config)
  }
}

/** 更新当前活跃 Profile 的单个字段 */
export function updateActiveProfileField(field: keyof ClaudeProfile, value: any): void {
  const config = loadConfig()
  const idx = Math.min(config.claude.activeProfile, config.claude.profiles.length - 1)
  if (config.claude.profiles[idx]) {
    (config.claude.profiles[idx] as any)[field] = value
    saveConfig(config)
  }
}
