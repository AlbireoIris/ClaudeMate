/**
 * Agent 会话持久化存储
 *
 * 使用 SQLite (better-sqlite3) 存储完整对话历史，
 * 支持跨应用重启恢复、会话列表、按时间检索。
 */
import { join } from 'path'
import { app } from 'electron'
import { existsSync, mkdirSync } from 'fs'

// better-sqlite3 在 Electron 中需要 native rebuild
// 暂时使用 JSON 文件存储作为 fallback，后续切 SQLite

interface StoredMessage {
  role: 'user' | 'ai' | 'system'
  text: string
  time: string
  taskId?: string
  thinking?: string
  tools?: string[]
}

interface StoredSession {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: StoredMessage[]
  files: { name: string; path: string }[]
  model: string
  effort: string
  thinking: boolean
  tags: string[]
}

const SESSIONS_DIR = join(app?.getPath('userData') || join(process.cwd(), 'data'), 'sessions')
const SESSIONS_INDEX = join(SESSIONS_DIR, 'index.json')

function ensureDir(): void {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

function readJSON(path: string): any {
  try {
    const { readFileSync } = require('fs')
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return null
  }
}

function writeJSON(path: string, data: any): void {
  const { writeFileSync } = require('fs')
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8')
}

/** 加载会话索引 */
function loadIndex(): StoredSession[] {
  ensureDir()
  return readJSON(SESSIONS_INDEX) || []
}

/** 保存会话索引 */
function saveIndex(sessions: StoredSession[]): void {
  ensureDir()
  writeJSON(SESSIONS_INDEX, sessions)
}

/** 创建新会话 */
export function createSession(meta: {
  title?: string
  model?: string
  effort?: string
  thinking?: boolean
}): StoredSession {
  const id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const session: StoredSession = {
    id,
    title: meta.title || `会话 ${new Date().toLocaleString('zh-CN')}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    files: [],
    model: meta.model || 'deepseek-v4-pro[1m]',
    effort: meta.effort || 'medium',
    thinking: meta.thinking ?? true,
    tags: [],
  }

  const sessions = loadIndex()
  sessions.unshift(session)
  saveIndex(sessions)
  writeJSON(join(SESSIONS_DIR, `${id}.json`), session)
  return session
}

/** 保存消息到会话 */
export function saveMessage(
  sessionId: string,
  messages: StoredMessage[],
): void {
  const sessions = loadIndex()
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) return

  sessions[idx].messages = messages
  sessions[idx].updatedAt = new Date().toISOString()
  sessions[idx].title = generateTitle(messages)

  saveIndex(sessions)
  writeJSON(join(SESSIONS_DIR, `${sessionId}.json`), sessions[idx])
}

/** 追加单条消息 */
export function appendMessage(
  sessionId: string,
  message: StoredMessage,
): void {
  const sessions = loadIndex()
  const idx = sessions.findIndex(s => s.id === sessionId)
  if (idx === -1) return

  sessions[idx].messages.push(message)
  sessions[idx].updatedAt = new Date().toISOString()

  saveIndex(sessions)
  writeJSON(join(SESSIONS_DIR, `${sessionId}.json`), sessions[idx])
}

/** 获取所有会话列表 */
export function listSessions(): StoredSession[] {
  return loadIndex().sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

/** 获取单个会话 */
export function getSession(sessionId: string): StoredSession | null {
  return readJSON(join(SESSIONS_DIR, `${sessionId}.json`))
}

/** 删除会话 */
export function deleteSession(sessionId: string): boolean {
  const sessions = loadIndex()
  const filtered = sessions.filter(s => s.id !== sessionId)
  if (filtered.length === sessions.length) return false

  saveIndex(filtered)
  try {
    const { unlinkSync } = require('fs')
    unlinkSync(join(SESSIONS_DIR, `${sessionId}.json`))
  } catch {}
  return true
}

/** 基于消息生成标题 */
function generateTitle(messages: StoredMessage[]): string {
  const userMsg = messages.find(m => m.role === 'user')
  if (!userMsg) return '空会话'
  const text = userMsg.text.replace(/【硬规则】[\s\S]*?\n/, '').trim()
  return text.length > 40 ? text.slice(0, 40) + '...' : text
}
