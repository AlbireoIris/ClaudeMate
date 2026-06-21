/** 统一应用配置类型 */

import type { Theme, FavoriteFolder } from './types'

/** 用户可见的窗口配置 */
export interface WindowConfig {
  /** 是否记忆上次窗口位置/大小 */
  rememberWindowState: boolean
}

/** 窗口状态（内部存储） */
export interface WindowState {
  x?: number
  y?: number
  width: number
  height: number
  isMaximized: boolean
}

/** 单个 API 配置方案 */
export interface ClaudeProfile {
  name: string
  baseURL: string
  apiKey: string
  model: string
  effort: string
  thinking: boolean
}

/** 目录禁入规则 */
export interface DenyRule {
  id: string
  path: string
  denyRead: boolean
  denyWrite: boolean
}

/** 完整应用配置（用户可编辑） */
export interface AppConfig {
  theme: Theme
  window: WindowConfig
  folders: FavoriteFolder[]
  denyRules: DenyRule[]
  claude: {
    activeProfile: number
    profiles: ClaudeProfile[]
  }
}

/** 默认窗口配置 */
export const DEFAULT_WINDOW: WindowConfig = {
  rememberWindowState: true
}

/** 默认窗口状态 */
export const DEFAULT_WINDOW_STATE: WindowState = {
  width: 1200,
  height: 800,
  isMaximized: false
}

/** 默认方案 */
export function getDefaultProfile(): ClaudeProfile {
  return {
    name: 'Default',
    baseURL: 'https://api.deepseek.com/anthropic',
    apiKey: '',
    model: 'deepseek-v4-pro[1m]',
    effort: 'medium',
    thinking: true
  }
}

/** 获取默认应用配置 */
export function getDefaultConfig(): AppConfig {
  return {
    theme: 'dark',
    window: { ...DEFAULT_WINDOW },
    folders: [],
    denyRules: [],
    claude: {
      activeProfile: 0,
      profiles: [getDefaultProfile()]
    }
  }
}
