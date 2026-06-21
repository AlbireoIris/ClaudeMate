const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

const PORT = 18982
const OPENCODE_BIN = path.join(__dirname, 'opencode-engine.exe')

// 先写范式文件
const PARADIGM = {
  name: '测试范式',
  nodes: [
    { kind: 'input',   question: '我手里有什么？', guidance: '先列出所有已知信息', label: '输入' },
    { kind: 'observe', question: '我应该怎么分析？', guidance: '按步骤分析，每次只关注一个方面', label: '观察' },
    { kind: 'decide',  question: '下一步做什么？', guidance: '基于分析结果做决定', label: '决策' },
    { kind: 'act',     question: '执行什么操作？', guidance: '调用工具执行', label: '执行' },
    { kind: 'reflect', question: '结果是什么？', guidance: '检查执行结果', label: '反思' },
  ],
}
const PARADIGM_FILE = path.join(__dirname, 'config', 'paradigm.json')
fs.writeFileSync(PARADIGM_FILE, JSON.stringify(PARADIGM, null, 2))

function buildPrompt(userQuery) {
  const parts = []
  try {
    const p = JSON.parse(fs.readFileSync(PARADIGM_FILE, 'utf-8'))
    if (p.nodes?.length > 0) {
      parts.push(`【思考范式: ${p.name}】`)
      parts.push('严格遵循以下思考循环处理任务：')
      const labels = { input:'📥 输入', observe:'🔍 观察', decide:'🧠 决策', act:'⚡ 执行', reflect:'👁 反思' }
      for (const n of p.nodes) {
        parts.push(`${labels[n.kind] || n.label}: ${n.question}`)
        parts.push(`  → ${n.guidance}`)
      }
      parts.push('每完成一步必须反思并判断：目标是否已达成？还需要什么？然后按范式决定下一步操作。')
      parts.push('')
    }
  } catch {}
  parts.push(userQuery)
  return parts.join('\n')
}

function httpReq(method, path, body, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const buf = bodyStr ? Buffer.from(bodyStr, 'utf-8') : undefined
    const req = http.request({
      hostname: '127.0.0.1', port: PORT, path, method,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...(buf ? { 'Content-Length': String(buf.length) } : {}) },
      timeout,
    }, (res) => {
      let chunks = ''
      res.on('data', c => chunks += c.toString())
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(chunks) }) }
        catch { resolve({ status: res.statusCode, data: chunks }) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    if (buf) req.write(buf)
    req.end()
  })
}

async function main() {
  try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))

  const env = { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '${DEEPSEEK_API_KEY}' }
  spawn(OPENCODE_BIN, ['serve', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: 'H:/', env, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 8000))

  const sid = (await httpReq('POST', '/session', { directory: 'H:/claude-code-assistant' })).data.id

  const prompt = buildPrompt('请描述你解决一个简单编程问题时会如何思考。')
  console.log('=== Prompt (first 500) ===')
  console.log(prompt.slice(0, 500))
  console.log('')

  const res = await httpReq('POST', `/session/${sid}/message`, {
    parts: [{ type: 'text', text: prompt }], resume: true,
  })

  const text = res.data.parts.filter(p => p.type === 'text').map(p => p.text).join('')
  console.log('=== Reply ===')
  console.log(text.slice(0, 800))
  console.log('')

  // 检查 AI 是否遵循了范式结构
  const checklist = [
    { kw: '输入', desc: '提到了"我有什么"' },
    { kw: '观察', desc: '提到了分析过程' },
    { kw: '决策', desc: '做决定' },
    { kw: '执行', desc: '执行操作' },
    { kw: '反思', desc: '检查结果' },
  ]
  console.log('=== 范式遵循检查 ===')
  let score = 0
  for (const item of checklist) {
    const ok = text.includes(item.kw)
    console.log('  ' + (ok ? '✅' : '❌') + ' ' + item.desc)
    if (ok) score++
  }
  console.log('  得分:', score + '/' + checklist.length)

  try { fs.unlinkSync(PARADIGM_FILE) } catch {}
  try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
  process.exit(score >= 3 ? 0 : 1)
}
main().catch(e => { console.error(e.message); process.exit(1) })
