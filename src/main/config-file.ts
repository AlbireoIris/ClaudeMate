/**
 * 配置文件解析器 — .conf 格式
 */
import type { AppConfig, ClaudeProfile } from '../shared/config-types'
import { getDefaultConfig, getDefaultProfile } from '../shared/config-types'
import type { FavoriteFolder } from '../shared/types'

// ---- 序列化 ----

export function stringifyConfig(config: AppConfig): string {
  const lines: string[] = []

  lines.push('# ============================================')
  lines.push('#  ClaudeMate 配置文件')
  lines.push('#  修改后重启应用即可生效')
  lines.push('# ============================================')
  lines.push('')

  // 主题
  lines.push('# 明暗模式：dark（深色）或 light（浅色）')
  lines.push(`theme = ${config.theme}`)
  lines.push('')

  // 窗口
  lines.push('# 是否记忆上次窗口位置和大小：true 或 false')
  lines.push(`remember_window_state = ${config.window.rememberWindowState}`)
  lines.push('')

  // API 方案
  lines.push('# --- API 方案 ---')
  lines.push('# 当前使用的方案索引（从 0 开始）')
  lines.push(`claude.active_profile = ${config.claude.activeProfile}`)
  lines.push('')

  config.claude.profiles.forEach((p, i) => {
    lines.push(`# [方案 ${i}]`)
    lines.push(`claude.profile.${i}.name = ${p.name}`)
    lines.push(`claude.profile.${i}.base_url = ${p.baseURL}`)
    lines.push(`claude.profile.${i}.api_key = ${p.apiKey}`)
    lines.push(`claude.profile.${i}.model = ${p.model}`)
    lines.push(`claude.profile.${i}.effort = ${p.effort}`)
    lines.push(`claude.profile.${i}.thinking = ${p.thinking}`)
    lines.push('')
  })

  // 文件夹
  lines.push('# --- 常用文件夹 ---')
  lines.push(`# 格式：folder.<序号>.name = 名称`)
  lines.push(`#       folder.<序号>.path = 路径`)
  lines.push('')
  if (config.folders.length > 0) {
    config.folders.forEach((f, i) => {
      lines.push(`folder.${i}.name = ${f.name}`)
      lines.push(`folder.${i}.path = ${f.path}`)
      lines.push('')
    })
  }

  return lines.join('\n') + '\n'
}

// ---- 反序列化 ----

export function parseConfig(raw: string): AppConfig {
  const config = getDefaultConfig()
  const profileMap = new Map<number, Partial<Record<keyof ClaudeProfile, string>>>()
  const folders: { name: string; path: string }[] = []

  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue

    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.substring(0, eq).trim()
    const value = trimmed.substring(eq + 1).trim()

    // 判断字段类型
    if (key === 'theme') {
      if (value === 'light' || value === 'dark') config.theme = value
      continue
    }
    if (key === 'remember_window_state') {
      config.window.rememberWindowState = value === 'true'
      continue
    }

    // Claude 配置 — 新旧格式兼容
    if (key === 'claude.active_profile') {
      config.claude.activeProfile = parseInt(value, 10) || 0
      continue
    }

    // 旧格式兼容：扁平的 claude.base_url / claude.api_key 等 → 迁移到 profile.0
    if (key === 'claude.base_url') { setProfileField(profileMap, 0, 'baseURL', value); continue }
    if (key === 'claude.api_key')  { setProfileField(profileMap, 0, 'apiKey', value); continue }
    if (key === 'claude.model')    { setProfileField(profileMap, 0, 'model', value); continue }
    if (key === 'claude.effort')   { setProfileField(profileMap, 0, 'effort', value); continue }
    if (key === 'claude.thinking') { setProfileField(profileMap, 0, 'thinking', value); continue }

    // 新格式：claude.profile.<i>.<field>
    const pm = key.match(/^claude\.profile\.(\d+)\.(name|base_url|api_key|model|effort|thinking)$/)
    if (pm) {
      const idx = parseInt(pm[1], 10)
      const field = pm[2]
      const fieldMap: Record<string, keyof ClaudeProfile> = {
        name: 'name', base_url: 'baseURL', api_key: 'apiKey',
        model: 'model', effort: 'effort', thinking: 'thinking'
      }
      const mapped = fieldMap[field]
      if (mapped) setProfileField(profileMap, idx, mapped, value)
      continue
    }

    // 文件夹
    const fm = key.match(/^folder\.(\d+)\.(name|path)$/)
    if (fm) {
      const idx = parseInt(fm[1], 10)
      if (!folders[idx]) folders[idx] = { name: '', path: '' }
      const prop = fm[2] as 'name' | 'path'
      folders[idx][prop] = value
    }
  }

  // 组装 profiles
  if (profileMap.size > 0) {
    const indices = [...profileMap.keys()].sort((a, b) => a - b)
    config.claude.profiles = indices.map((i, realIdx) => {
      const def = getDefaultProfile()
      const data = profileMap.get(i)!
      return {
        name: data.name || `Profile ${realIdx + 1}`,
        baseURL: data.baseURL || def.baseURL,
        apiKey: data.apiKey || '',
        model: data.model || def.model,
        effort: data.effort || def.effort,
        thinking: data.thinking !== undefined ? data.thinking === 'true' : def.thinking
      }
    })
    if (config.claude.activeProfile >= config.claude.profiles.length) {
      config.claude.activeProfile = 0
    }
  }

  // 组装文件夹
  const validFolders = folders.filter(f => f.name && f.path)
  if (validFolders.length > 0) {
    config.folders = validFolders.map((f, i) => ({
      id: `folder-cfg-${i}`,
      name: f.name,
      path: f.path
    }))
  }

  return config
}

function setProfileField(
  map: Map<number, Partial<Record<keyof ClaudeProfile, string>>>,
  idx: number,
  field: keyof ClaudeProfile,
  value: string
): void {
  if (!map.has(idx)) map.set(idx, {})
  map.get(idx)![field] = value
}
