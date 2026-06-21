/**
 * 完全模拟用户操作路径的测试
 * 输入: cc-config.conf + executeClaudeTask 的等价 HTTP 调用
 * 输出: 检查最终渲染文本是否有重复
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { spawn, execSync } = require('child_process')

const PORT = 18995
const OPENCODE_BIN = path.join(__dirname, 'opencode-engine.exe')
const CONFIG_FILE = path.join(__dirname, 'config', 'cc-config.conf')

// ═══ HTTP（和 claude-cli-serve.ts 完全一致） ═══
function httpReq(method, path, body, timeout = 60000) {
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

// ═══ 模拟 DenyPanel: 写 cc-config.conf ═══
function writeDenyRules(rules) {
  let raw = fs.readFileSync(CONFIG_FILE, 'utf-8')
  let lines = raw.split('\n').filter(l => !l.match(/^deny\./))
  if (rules.length > 0) {
    if (!lines.some(l => l.includes('dir_access_control'))) lines.push('', '# --- dir_access_control ---', '')
    rules.forEach((r, i) => {
      lines.push(`deny.${i}.id = ${r.id}`)
      lines.push(`deny.${i}.path = ${r.path}`)
      lines.push(`deny.${i}.deny_read = ${r.denyRead}`)
      lines.push(`deny.${i}.deny_write = ${r.denyWrite}`)
      lines.push('')
    })
  }
  fs.writeFileSync(CONFIG_FILE, lines.join('\n'), 'utf-8')
}

// ═══ 模拟 executeClaudeTask: 同款 prompt 构建 ═══
function buildPrompt(userQuery, files) {
  const parts = [userQuery]
  const realFiles = files.filter(f => !f.path.startsWith('__query__:'))
  if (realFiles.length > 0) {
    parts.unshift(realFiles.map(f => f.name).join(', '))
  }
  return parts.join('\n')
}

async function executeClaudeTask(userQuery, files) {
  const promptText = buildPrompt(userQuery, files)
  const sid = (await httpReq('POST', '/session', { directory: 'H:\\claude-code-assistant' })).data.id
  const res = await httpReq('POST', `/session/${sid}/message`, {
    parts: [{ type: 'text', text: promptText }],
    resume: true,
  })
  const parts = res.data?.parts || []
  const textParts = parts.filter(p => p.type === 'text')
  // 检查重复
  const seen = new Set()
  const dups = []
  for (const p of textParts) {
    if (seen.has(p.text)) dups.push(p.text)
    else seen.add(p.text)
  }
  const fullText = textParts.map(p => p.text).join('')
  return { text: fullText, textPartsCount: textParts.length, dups }
}

// ═══ 测试用例 ═══
async function run() {
  // 清理旧 server
  try { execSync('taskkill //F //IM opencode-engine.exe 2>nul', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))

  // 启动 server
  const env = { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '${DEEPSEEK_API_KEY}' }
  spawn(OPENCODE_BIN, ['serve', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: 'H:/', env, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 8000))

  console.log('=== 用户路径模拟测试 ===\n')

  const tests = [
    {
      name: '无规则: 你好',
      rules: [],
      query: '你好，用一句话回复',
      check: (r) => {
        if (r.dups.length > 0) throw new Error(`重复文本: "${r.dups[0].slice(0, 60)}"`)
        if (r.textPartsCount > 1) throw new Error(`text part 数量异常: ${r.textPartsCount}`)
      },
    },
    {
      name: '禁 C 盘: 列 C 盘文件',
      rules: [{ id: 't1', path: 'C:\\', denyRead: true, denyWrite: true }],
      query: '列出C盘根目录的3个文件',
      check: (r) => {
        if (r.dups.length > 0) throw new Error(`重复文本: "${r.dups[0].slice(0, 60)}"`)
        if (r.textPartsCount > 2) throw new Error(`text part 数量异常: ${r.textPartsCount}`)
        // 应该拒绝
        if (r.text.match(/拒绝|禁止|限制|无法/) === null) throw new Error('应该拒绝但允许了')
      },
    },
    {
      name: '无规则: 读文件',
      rules: [],
      query: 'Read H:/test_verify.txt and tell me what it says',
      check: (r) => {
        if (r.dups.length > 0) throw new Error(`重复文本: "${r.dups[0].slice(0, 60)}"`)
        if (!r.text.includes('unique_content_abc123')) throw new Error('没读到文件内容')
      },
    },
  ]

  let passed = 0, failed = 0
  for (const t of tests) {
    process.stdout.write(`  ${t.name}... `)
    try {
      writeDenyRules(t.rules)
      // 规则变更后重启 server
      try { execSync('taskkill //F //IM opencode-engine.exe 2>nul', { stdio: 'ignore' }) } catch {}
      await new Promise(r => setTimeout(r, 2000))
      spawn(OPENCODE_BIN, ['serve', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: 'H:/', env, stdio: 'ignore' })
      await new Promise(r => setTimeout(r, 8000))

      const r = await executeClaudeTask(t.query, [])
      t.check(r)
      console.log(`OK (parts:${r.textPartsCount} dups:${r.dups.length}) "${r.text.slice(0, 80)}"`)
      passed++
    } catch (e) {
      console.log(`FAIL ${e.message}`)
      failed++
    }
  }

  console.log(`\n  ${passed} passed, ${failed} failed`)
  writeDenyRules([])
  process.exit(failed > 0 ? 1 : 0)
}

run().catch(e => { console.error(e.message); process.exit(1) })
