/**
 * AI 引擎层 — 基于 opencode serve HTTP API
 *
 * 通过 HTTP API 调用 opencode serve 模式：
 *   POST /session               → 创建会话
 *   POST /session/{id}/message   → 发送消息 (同步返回完整响应)
 *
 * 响应格式: { info: {...}, parts: [{type, text, ...}] }
 *
 * 二进制: 优先项目根编译产物，回退 npm 包
 */
import { spawn, type ChildProcess } from 'child_process'
import { request as httpRequest } from 'http'
import { existsSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { homedir } from 'os'
import type { FileItem } from '../shared/types'
import { getActiveProfile, getDenyRules } from './config-store'

type ProgressCallback = (progress: number, message: string) => void
type StreamCallback = (chunk: { type: 'thinking' | 'text'; text: string }) => void

// ═══ 二进制 ═══

function findBinary(): string {
  const root = join(__dirname, '../..')
  // 1. 项目根引擎 (opencode-engine.exe)
  const engine = join(root, 'opencode-engine.exe')
  if (existsSync(engine)) return engine
  // 2. npm 包
  const npmBin = join(root, 'node_modules/opencode-windows-x64/bin/opencode.exe')
  if (existsSync(npmBin)) return npmBin
  // 3. PATH
  return 'opencode'
}

const OPENCODE_BIN = findBinary()
console.log('[ClaudeCLI] binary:', OPENCODE_BIN)

// ═══ Server 管理 ═══

let serverProcess: ChildProcess | null = null
let serverPort = 0
let serverReady = false
let serverStarting: Promise<number> | null = null

function httpReq(method: string, port: number, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const buf = bodyStr ? Buffer.from(bodyStr, 'utf-8') : undefined
    const req = httpRequest({
      hostname: '127.0.0.1', port, path, method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(buf ? { 'Content-Length': String(buf.length) } : {}),
      },
      timeout: 300000,
    }, (res) => {
      let chunks = ''
      res.on('data', (c: Buffer) => (chunks += c.toString()))
      res.on('end', () => {
        try { resolve({ status: res.statusCode || 0, data: chunks ? JSON.parse(chunks) : null }) }
        catch { resolve({ status: res.statusCode || 0, data: chunks }) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (buf) req.write(buf)
    req.end()
  })
}

/** 写入 opencode 配置 */
function writeEngineConfig(profile: ReturnType<typeof getActiveProfile>): void {
  const configDir = join(homedir(), '.config', 'opencode')
  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })

  const modelMap: Record<string, string> = {
    'deepseek-v4-pro[1m]': 'deepseek/deepseek-v4-pro',
    'deepseek-v4-flash': 'deepseek/deepseek-v4-flash',
    'claude-sonnet-4-6': 'deepseek/deepseek-v4-pro',
  }
  const model = modelMap[profile.model] || 'deepseek/deepseek-v4-pro'

  // 权限层只负责不卡死，禁入规则走 CLAUDE.md 系统提示
  const config = {
    '$schema': 'https://opencode.ai/config.json',
    model,
    permission: {
      external_directory: { '*': 'allow' },
      read: { '*': 'allow' },
      edit: { '*': 'allow' },
    },
    compaction: {
      auto: true,
      tail_turns: 2,
    },
  }
  writeFileSync(join(configDir, 'opencode.json'), JSON.stringify(config, null, 2), 'utf-8')
}

function startServer(port = 0): Promise<number> {
  if (serverReady && serverPort) return Promise.resolve(serverPort)

  return new Promise((resolve, reject) => {
    const args = ['serve', '--hostname', '127.0.0.1']
    if (port > 0) args.push('--port', String(port))

    // 注入环境变量
    const config = getActiveProfile()
    writeEngineConfig(config)

    const env: Record<string, string> = { ...(process.env as Record<string, string>) }
    if (config.apiKey) env.DEEPSEEK_API_KEY = config.apiKey

    console.log('[ClaudeCLI] starting server:', OPENCODE_BIN, args.join(' '))

    // 从 H:\ 启动，让 opencode 的 instance context 覆盖 H 盘根目录
    // 这样文件浏览器中的所有文件夹都不会触发 external_directory 权限检查
    const child = spawn(OPENCODE_BIN, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
      cwd: 'H:\\',
    })

    let resolved = false

    child.stdout?.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      if (!resolved) {
        const m = text.match(/listening on .*:(\d+)/)
        if (m) {
          serverPort = parseInt(m[1], 10)
          resolved = true
          // 等待就绪
          waitReady(serverPort).then(() => {
            serverReady = true
            serverStarting = null
            resolve(serverPort)
          }).catch(() => {
            serverReady = true
            serverStarting = null
            resolve(serverPort)
          })
        }
      }
    })

    child.stderr?.on('data', (chunk: Buffer) => {
      const s = chunk.toString()
      if (s.trim()) console.error('[ClaudeCLI stderr]', s.slice(0, 300))
    })

    child.on('error', (err) => {
      if (!resolved) { resolved = true; serverStarting = null; reject(err) }
    })

    child.on('close', () => {
      serverReady = false
      serverPort = 0
      serverProcess = null
      if (!resolved) { resolved = true; serverStarting = null; reject(new Error('Server exited')) }
    })

    serverProcess = child
  })
}

async function waitReady(port: number, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const r = await httpReq('GET', port, '/health')
      if (r.status === 200) return
    } catch {}
    await new Promise(r => setTimeout(r, 500))
  }
}

async function ensureServer(): Promise<number> {
  if (serverReady && serverPort) return serverPort
  if (serverStarting) return serverStarting
  serverStarting = startServer(0)
  return serverStarting
}

// ═══ Prompt 处理 ═══

interface ServeResponse {
  info?: { finish: string; tokens: { total: number }; providerID: string; modelID: string }
  parts?: Array<{ type: string; text?: string; delta?: string; tool?: string; state?: string }>
}

function processResponse(
  response: ServeResponse,
  onStream?: StreamCallback,
  onProgress?: ProgressCallback,
): string {
  let fullText = ''
  let toolCount = 0
  let lastTool = ''
  if (!response.parts) return ''

  for (const part of response.parts) {
    switch (part.type) {
      case 'reasoning':
        if (part.text) {
          onStream?.({ type: 'thinking', text: part.text })
          onProgress?.(30, '🧠 ' + part.text.slice(-80))
        }
        break
      case 'text':
        if (part.text) {
          fullText += part.text
          onProgress?.(60, '💬 回复中...')
        }
        break
      case 'tool':
        toolCount++
        if (part.tool) lastTool = part.tool
        if (part.state === 'running') {
          onProgress?.(40, `🔧 ${part.tool || 'tool'}...`)
        } else if (part.state === 'completed') {
          onProgress?.(50, `🔧 ${part.tool} 完成`)
        } else if (part.state === 'error') {
          fullText += `\n[${part.tool}] ❌ ${part.text || 'failed'}`
        }
        break
      case 'step-start':
        onProgress?.(10, 'AI 分析中...')
        break
      case 'step-finish':
        onProgress?.(100, `完成 | tokens: ${response.info?.tokens?.total || '?'}`)
        setTimeout(() => onProgress?.(0, ''), 500)
        break
    }
  }

  // 如果 AI 只调了工具没返回文本，给出摘要
  if (!fullText && toolCount > 0) {
    fullText = `(调用了 ${toolCount} 个工具: ${lastTool})`
  }

  return fullText
}

// ═══ 主入口 ═══

// ═══ 持久 Session ═══

let activeSessionId: string | null = null
let activeSessionWorkDir: string | null = null

/** 重置 session（新对话） */
export function resetSession(): void {
  activeSessionId = null
  activeSessionWorkDir = null
  console.log('[NAVI] session reset')
}

/** 重启 opencode server（deny 规则变更后调用） */
export function resetOpenCodeServer(): void {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
  serverReady = false
  serverPort = 0
  serverStarting = null
  activeSessionId = null
  activeSessionWorkDir = null
  console.log('[NAVI] server reset for config reload')
}

async function getOrCreateSession(port: number, workDir: string, onStream?: StreamCallback): Promise<string | null> {
  // 同目录复用 session
  if (activeSessionId && activeSessionWorkDir === workDir) {
    console.log('[ClaudeCLI] reusing session:', activeSessionId)
    return activeSessionId
  }

  const sessionRes = await httpReq('POST', port, '/session', {
    directory: workDir,
  })

  const id = sessionRes.data?.id
  if (!id) {
    const err = `创建会话失败: ${JSON.stringify(sessionRes.data).slice(0, 200)}`
    onStream?.({ type: 'text', text: `❌ ${err}` })
    return null
  }

  activeSessionId = id
  activeSessionWorkDir = workDir
  console.log('[ClaudeCLI] new session:', id, 'dir:', workDir)
  return id
}

// ═══ 主入口 ═══

export async function executeClaudeTask(
  _taskId: string,
  _taskType: any,
  files: FileItem[],
  _history: { role: string; text: string }[],  // opencode 自己管理上下文
  onProgress: ProgressCallback,
  onStream?: StreamCallback,
): Promise<string> {
  const queryFile = files.find(f => f.path.startsWith('__query__:'))
  const userQuery = queryFile ? queryFile.path.replace('__query__:', '') : ''

  if (!userQuery && files.filter(f => !f.path.startsWith('__query__:')).length === 0) {
    return '请发送消息或选择文件。'
  }

  const config = getActiveProfile()
  if (!config.apiKey || !config.baseURL) return '未配置 API Key。'

  // 构建用户消息：系统规则在 CLAUDE.md/AGENTS.md，禁入规则动态注入
  const parts: string[] = []
  // 加载思考范式
  try {
    const paradigmPath = join(__dirname, '../../config/paradigm.json')
    const { existsSync: fe2, readFileSync: rf2 } = require('fs')
    if (fe2(paradigmPath)) {
      const paradigm = JSON.parse(rf2(paradigmPath, 'utf-8'))
      if (paradigm.nodes?.length > 0) {
        parts.push(`【思考范式: ${paradigm.name || '任务流程'}】`)
        parts.push('遵循以下思考循环处理任务：')
        for (const node of paradigm.nodes) {
          const label = { input:'📥 输入', observe:'🔍 观察', decide:'🧠 决策', act:'⚡ 执行', reflect:'👁 反思', iterate:'🔄 迭代', done:'✅ 完成' }[node.kind] || node.kind
          parts.push(`${label}: ${node.question}`)
          parts.push(`  → ${node.guidance}`)
        }
        parts.push('每完成一步后判断：目标是否已达成？还需要什么？按范式决定下一步。')
        parts.push('')
      }
    }
  } catch {}
  // 禁入规则
  try {
    const denyRules = getDenyRules()
    if (denyRules.length > 0) {
      parts.push('【访问控制策略】')
      for (const r of denyRules) {
        if (r.denyRead && r.denyWrite) parts.push('❌ ' + r.path + ' → 禁止读取和写入')
        else if (r.denyRead) parts.push('❌ ' + r.path + ' → 仅禁止读取（允许写入）')
        else if (r.denyWrite) parts.push('❌ ' + r.path + ' → 仅禁止写入（允许读取）')
      }
      parts.push('你只能拒绝策略中明确禁止的操作。未被禁止的操作视为允许。')
      parts.push('')
    }
  } catch {}
  parts.push(userQuery || '你好')
  const realFiles = files.filter(f => !f.path.startsWith('__query__:'))
  if (realFiles.length > 0) {
    parts.unshift('📎 ' + realFiles.map(f => f.name).join(', '))
  }
  const promptText = parts.join('\n')

  // 工作目录
  let workDir = 'H:\\'
  if (realFiles.length > 0) {
    const { existsSync: fe, statSync: st } = require('fs')
    const p = realFiles[0].path
    workDir = fe(p) ? (st(p).isDirectory() ? p : dirname(p)) : workDir
  }

  try {
    const port = await ensureServer()
    console.log('[NAVI] server port:', port)

    onProgress(2, '创建/复用会话...')
    const sessionId = await getOrCreateSession(port, workDir, onStream)
    if (!sessionId) return ''

    onProgress(3, '发送消息...')
    const promptRes = await httpReq(
      'POST', port, `/session/${sessionId}/message`,
      { parts: [{ type: 'text', text: promptText }], resume: true },
    )

    if (promptRes.status !== 200 || promptRes.data?.name === 'UnknownError') {
      const err = promptRes.data?.data?.message || `HTTP ${promptRes.status}`
      onStream?.({ type: 'text', text: `❌ ${err}` })
      return ''
    }

    onProgress(4, '等待 AI 响应...')
    console.log('[NAVI] text parts:', (promptRes.data?.parts || []).filter((p: any) => p.type === 'text').length)
    const fullText = processResponse(promptRes.data, onStream, onProgress)
    console.log('[NAVI] model:', promptRes.data?.info?.providerID + '/' + promptRes.data?.info?.modelID)

    return fullText || '(无输出)'

  } catch (e: any) {
    console.error('[NAVI] error:', e.message)
    resetSession()
    onStream?.({ type: 'text', text: `❌ 请求失败: ${e.message}` })
    return ''
  }
}
