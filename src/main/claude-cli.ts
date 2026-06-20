/**
 * AI 引擎适配层
 *
 * 双引擎架构：
 *   1. opencode (npm) — spawn + NDJSON (稳定，当前默认)
 *   2. opencode-custom (V2) — HTTP API + SSE (待 @ai-sdk 包可用后启用)
 *
 * 二进制查找优先级：项目根 opencode-custom.exe > node_modules > PATH
 * 运行时使用 run --format json --pure 命令（兼容 V1/V2 的 NDJSON 输出）
 */
import { spawn } from 'child_process'
import { existsSync, readdirSync, statSync } from 'fs'
import { join, dirname } from 'path'
import type { FileItem } from '../shared/types'
import { getActiveProfile } from './config-store'

type ProgressCallback = (progress: number, message: string) => void
type StreamCallback = (chunk: { type: 'thinking' | 'text'; text: string }) => void

// ═══ 二进制查找 ═══

function findBinary(name: string): string {
  const cwd = join(__dirname, '../../node_modules')
  const root = join(__dirname, '../..')

  // 1. 项目根自定义编译版（需验证支持 run 命令）
  const custom = join(root, 'opencode-custom.exe')
  if (existsSync(custom)) {
    console.log('[Engine] found custom binary:', custom)
    return custom
  }

  // 2. node_modules 中的 npm 二进制
  function search(dir: string): string | null {
    if (!existsSync(dir)) return null
    try {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (entry.endsWith('.exe') && full.includes(name) && !full.includes('.old.')) return full
        try { if (statSync(full).isDirectory() && !entry.startsWith('.')) { const f = search(full); if (f) return f } } catch {}
      }
    } catch {}
    return null
  }

  const found = search(cwd)
  if (found) {
    console.log('[Engine] using npm binary:', found)
    return found
  }

  // 3. PATH 回退
  console.log('[Engine] using PATH:', name)
  return name
}

const OPENCODE_BIN = findBinary('opencode')
console.log('[Engine] resolved binary:', OPENCODE_BIN, 'exists:', existsSync(OPENCODE_BIN))

// ═══ NDJSON 事件解析 ═══

function processEvent(event: any, onStream?: StreamCallback, onProgress?: ProgressCallback): void {
  const t = event.type

  if (t === 'step_start') {
    onProgress?.(10, 'AI 分析中...')
    return
  }

  if (t === 'text') {
    const text = event.part?.text
    if (text) {
      onStream?.({ type: 'text', text })
    }
    return
  }

  if (t === 'thinking') {
    const thinking = event.part?.text
    if (thinking) {
      onStream?.({ type: 'thinking', text: thinking })
      onProgress?.(20, '🧠 ' + thinking.slice(-80))
    }
    return
  }

  if (t === 'tool_use') {
    onProgress?.(40, '🔧 ' + (event.part?.name || '工具'))
    return
  }

  if (t === 'step_finish') {
    onProgress?.(100, '完成')
    setTimeout(() => onProgress?.(0, ''), 500)
    return
  }

  if (t === 'error') {
    onStream?.({ type: 'text', text: `\n❌ ${event.part?.text || '未知错误'}\n` })
  }
}

// ═══ 环境变量注入 ═══

/** 从活跃 Profile 构建 AI 所需的环境变量 */
function buildEnv(profile: ReturnType<typeof getActiveProfile>): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) }

  // 注入 API 配置为环境变量（OpenCode 引擎从此读取）
  env.ANTHROPIC_BASE_URL = profile.baseURL
  env.ANTHROPIC_AUTH_TOKEN = profile.apiKey
  env.ANTHROPIC_MODEL = profile.model
  env.NO_COLOR = '1'

  // 根据 model 设置默认模型
  if (profile.model) {
    env.ANTHROPIC_DEFAULT_SONNET_MODEL = profile.model
    env.ANTHROPIC_DEFAULT_HAIKU_MODEL = profile.model
    env.CLAUDE_CODE_EFFORT_LEVEL = profile.effort || 'medium'
  }

  return env
}

// ═══ 主入口 ═══

export async function executeClaudeTask(
  _taskId: string,
  _taskType: any,
  files: FileItem[],
  history: { role: string; text: string }[],
  onProgress: ProgressCallback,
  onStream?: StreamCallback
): Promise<string> {
  const realFiles = files.filter(f => !f.path.startsWith('__query__:'))
  const queryFile = files.find(f => f.path.startsWith('__query__:'))
  const userQuery = queryFile ? queryFile.path.replace('__query__:', '') : ''

  if (!userQuery && realFiles.length === 0) return '请发送消息或选择文件。'

  const config = getActiveProfile()
  if (!config.apiKey || !config.baseURL) return '未配置 API Key。'

  const sysHint = `【硬规则】
1. 用中文回复。禁止只说"完成"——必须给出具体文件名、路径、执行结果。
2. 所有写入/删除/修改操作仅限于 H: 盘。读取可以跨盘。
3. 每完成一步必须汇报结果。`
  let prompt = sysHint + '\n' + (userQuery || '你好')
  if (realFiles.length > 0) {
    prompt = `${prompt}\n\n文件列表:\n${realFiles.map(f => `- ${f.path} (${f.name})`).join('\n')}`
  }

  const isContinuation = history.length > 0
  const args = ['run', prompt, '--format', 'json', '--pure']
  if (isContinuation) args.splice(1, 0, '-c')

  console.log('[Engine]', OPENCODE_BIN, args.join(' '))

  // 工作目录：默认 H:\，有附加文件时跟随
  let workDir = 'H:\\'
  if (realFiles.length > 0) {
    const { existsSync: fe } = require('fs')
    const { statSync: st } = require('fs')
    const { dirname: dn } = require('path')
    const p = realFiles[0].path
    workDir = fe(p) ? (st(p).isDirectory() ? p : dn(p)) : workDir
  }
  args.push('--dir', workDir)

  const env = buildEnv(config)

  return new Promise((resolve) => {
    const child = spawn(OPENCODE_BIN, args, {
      cwd: workDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env,
    })

    let buf = ''

    child.stdout.on('data', (chunk: Buffer) => {
      const raw = chunk.toString()
      console.log('[Engine stdout]', raw.slice(0, 200))
      buf += raw
      const lines = buf.split('\n')
      buf = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          processEvent(JSON.parse(line), onStream, onProgress)
        } catch {
          if (!line.startsWith('{')) onStream?.({ type: 'text', text: line + '\n' })
        }
      }
    })

    child.stderr.on('data', (chunk: Buffer) => {
      console.error('[Engine stderr]', chunk.toString().slice(0, 300))
    })

    child.on('spawn', () => {
      console.log('[Engine] process spawned, PID:', child.pid)
      onProgress(5, '启动中...')
    })

    child.on('close', () => {
      // 处理残留数据
      for (const line of buf.split('\n')) {
        if (!line.trim()) continue
        try { processEvent(JSON.parse(line), onStream, onProgress) } catch {}
      }
      onProgress(100, '完成')
      setTimeout(() => onProgress(0, ''), 500)
      resolve('')
    })

    child.on('error', (err) => {
      onStream?.({ type: 'text', text: `❌ 启动失败: ${err.message}` })
      resolve('')
    })
  })
}
