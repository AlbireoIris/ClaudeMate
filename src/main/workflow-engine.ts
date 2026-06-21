/**
 * 工作流引擎 — if-else + loop 编排 AI 单步调用
 *
 * 引擎负责流程控制（分支/循环/上下文传递），
 * AI 在每个节点只做简单的单次决策，输出结构化结果。
 *
 * 执行日志记录每步的输入/输出/决策/偏差，
 * 用于分析流程瓶颈和优化节点配置。
 */

// ═══ 类型 ═══

export type NodeType = 'action' | 'decide' | 'tool' | 'output'

export interface WorkflowNode {
  id: string
  type: NodeType
  label: string
  /** 发给 AI 的指令（可用 {{变量名}} 引用上下文） */
  prompt: string
  /** 期望的 AI 回复结构 */
  expect?: string
  /** 决策节点: yes 走哪, no 走哪 */
  yesTo?: string
  noTo?: string
  /** 普通节点: 下一步走哪 */
  next?: string
  /** 超时 (ms) */
  timeout?: number
}

export interface Workflow {
  name: string
  nodes: Record<string, WorkflowNode>
  startNode: string
  /** 全局上下文初始值 */
  initContext?: Record<string, string>
}

export interface StepLog {
  nodeId: string
  timestamp: number
  input: string
  output: string
  decision?: 'yes' | 'no'
  success: boolean
  duration: number
  deviation?: string
}

// ═══ 预置: 下载管道工作流 ═══
export const DOWNLOAD_WORKFLOW: Workflow = {
  name: '下载管道',
  startNode: 'fetch_page',
  initContext: {
    cookiePath: 'H:/downloads/cookies.json',
    downloadDir: 'D:/百度网盘临时下载',
    winrarPath: 'C:/Users/Iris/Downloads/Winrar+小脚本3.2.1/Winrar/WinRAR.exe',
  },
  nodes: {
    fetch_page: {
      id: 'fetch_page', type: 'action', label: '获取网页',
      prompt: '用 {{cookiePath}} 中 hxcy 域名的 cookie, curl 抓取 {{pageUrl}}。报告 HTTP 状态码。',
      next: 'extract_info',
    },
    extract_info: {
      id: 'extract_info', type: 'action', label: '提取信息',
      prompt: '从上一步的 HTML 中提取: 解压密码(正则 密码[：:]\s*([A-Za-z0-9\-_]{4,16}))、百度提取码(正则 提取码[：:]\s*([A-Za-z0-9]{4}))、QR码图片链接。以 JSON 格式输出。',
      expect: 'JSON',
      next: 'check_has_qr',
    },
    check_has_qr: {
      id: 'check_has_qr', type: 'decide', label: '判断是否有QR',
      prompt: '上一步是否获得了有效的百度盘链接？回复 yes 或 no。',
      yesTo: 'playwright_download',
      noTo: 'decode_qr',
    },
    decode_qr: {
      id: 'decode_qr', type: 'action', label: '解码QR',
      prompt: '下载 {{qrImageUrl}} 图片，用 zbarimg 或 jsQR 解码。输出解码后的文本。',
      next: 'extract_link',
    },
    extract_link: {
      id: 'extract_link', type: 'action', label: '提取链接',
      prompt: '从解码后的文本中提取百度盘链接(pan.baidu.com/s/xxx)和提取码(pwd=xxx)。输出 surl 和 pwd。',
      next: 'playwright_download',
    },
    playwright_download: {
      id: 'playwright_download', type: 'tool', label: 'Playwright下载',
      prompt: '用 Playwright: 注入百度cookie→打开pan.baidu.com/s/{{surl}}→填提取码{{pwd}}→点击下载→等60秒→检查{{downloadDir}}目录新文件。',
      next: 'check_file',
    },
    check_file: {
      id: 'check_file', type: 'action', label: '检查文件',
      prompt: '检查{{downloadDir}}中最新的文件。检测是否为伪装文件(MP4头+ZIP尾)。输出: 文件名、大小、是否伪装。',
      expect: 'JSON',
      next: 'decide_disguise',
    },
    decide_disguise: {
      id: 'decide_disguise', type: 'decide', label: '是否伪装',
      prompt: '上一步的文件是伪装文件吗？回复 yes 或 no。',
      yesTo: 'rename_zip',
      noTo: 'decide_extract',
    },
    rename_zip: {
      id: 'rename_zip', type: 'tool', label: '改名ZIP',
      prompt: '将 {{fileName}} 重命名为 {{fileName}}.zip 覆盖原文件。',
      next: 'decide_extract',
    },
    decide_extract: {
      id: 'decide_extract', type: 'decide', label: '是否需要解压',
      prompt: '文件是压缩包(.zip/.rar/.7z)吗？回复 yes 或 no。',
      yesTo: 'extract',
      noTo: 'report',
    },
    extract: {
      id: 'extract', type: 'tool', label: '解压',
      prompt: '用 WinRAR({{winrarPath}}) 解压 {{filePath}}。密码尝试: {{archivePassword}}, yejiang, FLYYZ, smbd。递归解压直到无压缩包。',
      next: 'check_extract',
    },
    check_extract: {
      id: 'check_extract', type: 'decide', label: '还有压缩包?',
      prompt: '解压目录中还有 .zip/.rar/.7z 文件吗？回复 yes 或 no。',
      yesTo: 'extract',
      noTo: 'report',
    },
    report: {
      id: 'report', type: 'output', label: '汇报结果',
      prompt: '汇总: 最终输出目录、文件列表、各步骤耗时和结果。',
    },
  },
}

// ═══ 引擎 ═══

type AICallFn = (prompt: string, timeout?: number) => Promise<string>

interface RunOptions {
  workflow: Workflow
  context: Record<string, string>
  aiCall: AICallFn
  onStep?: (log: StepLog) => void
  maxSteps?: number
}

export async function runWorkflow(opts: RunOptions): Promise<{ logs: StepLog[]; context: Record<string, string>; completed: boolean }> {
  const { workflow, context, aiCall, onStep, maxSteps = 50 } = opts
  const logs: StepLog[] = []
  let nodeId = workflow.startNode
  let steps = 0

  while (nodeId && steps < maxSteps) {
    steps++
    const node = workflow.nodes[nodeId]
    if (!node) throw new Error(`Node not found: ${nodeId}`)

    // 构建 prompt：替换 {{变量}}
    const prompt = node.prompt.replace(/\{\{(\w+)\}\}/g, (_, key) => context[key] || '')

    const startTime = Date.now()
    let output = ''
    let success = false
    let decision: 'yes' | 'no' | undefined
    let deviation: string | undefined

    try {
      output = await aiCall(prompt, node.timeout || 60000)
      success = true

      if (node.type === 'decide') {
        decision = output.toLowerCase().includes('yes') ? 'yes' : 'no'
      }

      // 尝试从输出中提取 JSON 填充上下文
      try {
        const jsonMatch = output.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[0])
          if (typeof data === 'object') {
            for (const [k, v] of Object.entries(data)) {
              if (typeof v === 'string') context[k] = v
            }
          }
        }
      } catch {}

      // 将输出存入上下文
      context[`${nodeId}_result`] = output
    } catch (e: any) {
      success = false
      output = e.message
      deviation = `执行失败: ${e.message}`
    }

    const log: StepLog = {
      nodeId, timestamp: startTime,
      input: prompt.slice(0, 200),
      output: output.slice(0, 500),
      decision, success,
      duration: Date.now() - startTime,
      deviation,
    }
    logs.push(log)
    onStep?.(log)

    // 确定下一步
    if (!success) {
      // 失败时停在当前节点，等待外部处理
      break
    }
    if (node.type === 'decide') {
      nodeId = decision === 'yes' ? (node.yesTo || '') : (node.noTo || '')
    } else if (node.type === 'output') {
      nodeId = '' // 终止
    } else {
      nodeId = node.next || ''
    }
  }

  return { logs, context, completed: !nodeId }
}
