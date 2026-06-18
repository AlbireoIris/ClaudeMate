import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import Anthropic from '@anthropic-ai/sdk'
import type { TaskType, FileItem } from '../shared/types'
import { compressFile, decompressFile, organizeFile, analyzeFile, readTextFile } from './file-system'

type ProgressCallback = (progress: number, message: string) => void

interface ClaudeConfig {
  baseURL: string
  apiKey: string
  model: string
  effort: string
  thinking: boolean
}

function loadClaudeConfig(): ClaudeConfig | null {
  try {
    const settingsPath = join(homedir(), '.claude', 'settings.json')
    const raw = readFileSync(settingsPath, 'utf-8')
    const settings = JSON.parse(raw)
    const env = settings.env || {}
    // 兼容两种密钥写法：ANTHROPIC_AUTH_TOKEN（README 推荐）或 ANTHROPIC_API_KEY（Claude Code 默认）
    const apiKey = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY
    if (apiKey && env.ANTHROPIC_BASE_URL) {
      // 读取 app 覆写配置
      let overrides: any = {}
      try {
        const overridePath = join(homedir(), '.claude', 'cc-assistant.json')
        overrides = JSON.parse(readFileSync(overridePath, 'utf-8'))
      } catch {}
      return {
        baseURL: env.ANTHROPIC_BASE_URL,
        apiKey,
        model: overrides.model || env.ANTHROPIC_MODEL || env.ANTHROPIC_DEFAULT_OPUS_MODEL || 'claude-sonnet-4-6',
        effort: overrides.effort || 'medium',
        thinking: overrides.thinking || false
      }
    }
    return null
  } catch { return null }
}

export async function executeClaudeTask(
  _taskId: string,
  taskType: TaskType,
  files: FileItem[],
  onProgress: ProgressCallback
): Promise<string> {
  const realFiles = files.filter(f => !f.path.startsWith('__query__:'))
  const queryFile = files.find(f => f.path.startsWith('__query__:'))
  const userQuery = queryFile ? queryFile.path.replace('__query__:', '') : ''

  // 判断操作类型
  const action = detectAction(userQuery, taskType)

  // 如果有文件 → 先尝试本地操作（压缩/解压/整理）
  if (realFiles.length > 0 && (action === 'compress' || action === 'decompress' || action === 'organize')) {
    return executeLocally(action, realFiles, userQuery, onProgress)
  }

  // 如果有文件但需要分析，或有文本查询 → AI API
  const config = loadClaudeConfig()
  if (config) {
    try {
      return await executeWithAPI(config, action, realFiles, userQuery, onProgress)
    } catch (e: any) {
      // API 调用失败：如实把错误透传给用户，不要掩盖成「未配置」
      const detail = formatApiError(e)
      onProgress(0, 'API 调用失败')
      // 有文件时仍可退回本地分析，但要带上 AI 失败的明确提示
      if (realFiles.length > 0) {
        const local = await executeLocally('analyze', realFiles, userQuery, onProgress)
        return `⚠️ AI 调用失败，已退回本地文件分析。\n\n${detail}\n\n---\n\n${local}`
      }
      return `❌ AI 调用失败\n\n${detail}`
    }
  }

  // 回退：纯文件分析（无 AI 配置）
  if (realFiles.length > 0) {
    return executeLocally('analyze', realFiles, userQuery, onProgress)
  }

  // 纯文本但未配置 AI：明确告知缺什么
  return [
    '❌ 未配置 AI API',
    '',
    '请在 ~/.claude/settings.json 的 "env" 段配置：',
    '  • ANTHROPIC_BASE_URL — API 端点地址',
    '  • ANTHROPIC_AUTH_TOKEN 或 ANTHROPIC_API_KEY — 密钥',
    '',
    '两项缺一不可。配置后重新发送消息即可。'
  ].join('\n')
}

/** 把 Anthropic SDK / 网络错误翻译成用户能看懂的明确报错 */
function formatApiError(e: any): string {
  // Anthropic SDK 错误带 status；fetch 网络错误带 code
  const status = e?.status ?? e?.statusCode
  const code = e?.code || e?.cause?.code
  const rawMsg = e?.error?.error?.message || e?.error?.message || e?.message || String(e)

  if (status === 429) {
    return `请求过于频繁（HTTP 429 限流）。\n该模型有 RPM 限制，可能正被其他程序占用配额。\n建议：稍等片刻重试，或在底部切换到限流更宽松的模型。\n\n原始信息：${rawMsg}`
  }
  if (status === 401 || status === 403) {
    return `鉴权失败（HTTP ${status}）。\nAPI 密钥无效或无权限，请检查 ~/.claude/settings.json 的 ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN。\n\n原始信息：${rawMsg}`
  }
  if (status === 404) {
    return `模型或端点不存在（HTTP 404）。\n请检查模型名与 ANTHROPIC_BASE_URL 是否正确。\n\n原始信息：${rawMsg}`
  }
  if (status >= 500) {
    return `服务端错误（HTTP ${status}）。\n模型服务暂时不可用，请稍后重试。\n\n原始信息：${rawMsg}`
  }
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'EAI_AGAIN') {
    return `网络连接失败（${code}）。\n无法连接到 API 端点，请检查网络或 ANTHROPIC_BASE_URL 是否可达。\n\n原始信息：${rawMsg}`
  }
  // 兜底：把能拿到的状态码 / 信息都带上
  const parts = ['AI 接口调用出错。']
  if (status) parts.push(`HTTP 状态：${status}`)
  if (code) parts.push(`错误码：${code}`)
  parts.push(`信息：${rawMsg}`)
  return parts.join('\n')
}

/** AI API — 使用 Anthropic SDK 流式调用 */
async function executeWithAPI(
  config: ClaudeConfig,
  action: string,
  files: FileItem[],
  query: string,
  onProgress: ProgressCallback
): Promise<string> {
  const anthropic = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL })

  // 构建消息
  let userContent = query || '你好'

  if (files.length > 0) {
    const fileList = files.map(f => `- ${f.name} (${f.extension || '无扩展名'}, ${f.size} bytes)`).join('\n')
    userContent = `${query || `请分析以下文件`}\n\n文件列表:\n${fileList}`

    // 尝试读取小文本文件
    for (const f of files) {
      if (f.size < 50000) {
        try {
          const content = await readTextFile(f.path)
          userContent += `\n\n### ${f.name} 内容:\n\`\`\`\n${content.slice(0, 5000)}\n\`\`\``
        } catch { /* binary file */ }
      }
    }
  }

  onProgress(15, 'AI 思考中...')

  // 使用 .stream() 返回的 Stream 对象
  const params: any = {
    model: config.model,
    max_tokens: config.thinking ? 8192 : 4096,
    system: '你是 Claude Code Assistant，用户桌面上的智能文件助手。用中文简洁回复，不要自我介绍，不要提及你是其他模型。',
    messages: [{ role: 'user', content: userContent }]
  }
  params.thinking = config.thinking
    ? { type: 'enabled', budget_tokens: 2048 }
    : { type: 'disabled' }
  console.log('[API] calling with:', { model: config.model, effort: config.effort, thinking: config.thinking })
  const stream = anthropic.messages.stream(params)

  let result = ''
  let thinkingText = ''

  await new Promise<void>((resolve, reject) => {
    stream.on('text', (text: string) => {
      result += text
      onProgress(Math.min(20 + Math.floor(result.length / 30), 90), 'AI 回复中...')
    })
    stream.on('thinking', (text: string) => {
      thinkingText += text
      onProgress(Math.min(5 + Math.floor(thinkingText.length / 20), 15), '🧠 ' + (thinkingText.length > 80 ? thinkingText.slice(-80) : thinkingText))
    })
    stream.on('end', () => resolve())
    stream.on('error', (err: Error) => reject(err))
  })

  onProgress(100, '完成')
  return result || '(AI 未返回内容)'
}

/** 本地文件操作 */
async function executeLocally(
  action: string,
  files: FileItem[],
  query: string,
  onProgress: ProgressCallback
): Promise<string> {
  if (files.length === 0) {
    return '未选择文件，请拖放文件或点击选择。'
  }

  const results: string[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const pct = Math.round(((i + 1) / files.length) * 100)

    try {
      switch (action) {
        case 'compress': {
          onProgress(pct, `压缩: ${file.name}`)
          const out = await compressFile(file.path)
          results.push(`✅ 压缩完成\n  源文件: ${file.name}\n  输出: ${out}`)
          break
        }
        case 'decompress': {
          onProgress(pct, `解压: ${file.name}`)
          const out = await decompressFile(file.path)
          results.push(`✅ 解压完成\n  源文件: ${file.name}\n  输出: ${out}`)
          break
        }
        case 'organize': {
          onProgress(pct, `整理: ${file.name}`)
          const out = await organizeFile(file.path)
          results.push(`✅ 整理完成\n  源文件: ${file.name}\n  移动到: ${out}`)
          break
        }
        default: {
          onProgress(pct, `分析: ${file.name}`)
          const info = await analyzeFile(file.path)
          results.push(info)
        }
      }
    } catch (e: any) {
      results.push(`❌ ${file.name}: ${e.message}`)
    }
  }

  onProgress(100, '处理完成')
  return results.join('\n\n')
}

function detectAction(query: string, taskType: TaskType): string {
  const q = (query + taskType).toLowerCase()
  if (/解压|decompress|unzip|gunzip/.test(q)) return 'decompress'
  if (/压缩|compress|zip|gzip/.test(q) || taskType === 'batch-decompress') return 'compress'
  if (/整理|分类|organize|sort/.test(q) || taskType === 'file-organize') return 'organize'
  return 'analyze'
}
