/**
 * OpenMate Test Farm
 *   node test-farm.cjs all
 */
const http = require('http')
const fs = require('fs')
const path = require('path')
const { execSync, spawn } = require('child_process')

let PORT = parseInt(process.env.OC_PORT) || 18981
const WORKDIR = 'H:/claude-code-assistant'
const TEST_DIR = WORKDIR + '/test-farm-workspace'
const TEST_FILE = TEST_DIR + '/read-test.txt'
const TEST_CONTENT = 'farm-test-content-v1'
const OPENCODE_BIN = path.join(__dirname, 'opencode-engine.exe')
const LOG_FILE = path.join(__dirname, 'test-farm.log')
let serverProcess = null

// ═══ Log ═══
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19)
  const line = `[${ts}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

// ═══ HTTP ═══
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

async function createSession() {
  const res = await httpReq('POST', '/session', { directory: WORKDIR })
  if (!res.data?.id) throw new Error('Failed to create session')
  return res.data.id
}

async function sendMessage(sessionId, text) {
  const res = await httpReq('POST', `/session/${sessionId}/message`, {
    parts: [{ type: 'text', text }], resume: true,
  })
  if (res.status !== 200 || !res.data?.parts) return { error: `HTTP ${res.status}`, text: '' }
  const textParts = res.data.parts.filter(p => p.type === 'text')
  return { text: textParts.map(p => p.text).join(''), tools: res.data.parts.filter(p => p.type === 'tool').length, error: null }
}

// ═══ Config ═══
function writeDenyRules(rules) {
  const configFile = path.join(__dirname, 'config', 'cc-config.conf')
  let raw = fs.readFileSync(configFile, 'utf-8')
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
  fs.writeFileSync(configFile, lines.join('\n'), 'utf-8')
}

async function restartServer() {
  try { execSync('taskkill //F //IM opencode-engine.exe 2>nul', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))
  // 同步 opencode.json — 清空 deny 规则，只保留 allow-all
  const ocConfig = {
    '$schema': 'https://opencode.ai/config.json',
    model: 'deepseek/deepseek-v4-pro',
    permission: {
      external_directory: { '*': 'allow' },
      read: { '*': 'allow' },
      edit: { '*': 'allow' },
    },
    compaction: { auto: true, tail_turns: 2 },
  }
  const ocDir = path.join(require('os').homedir(), '.config', 'opencode')
  if (!fs.existsSync(ocDir)) fs.mkdirSync(ocDir, { recursive: true })
  fs.writeFileSync(path.join(ocDir, 'opencode.json'), JSON.stringify(ocConfig, null, 2), 'utf-8')
  const env = { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '${DEEPSEEK_API_KEY}' }
  serverProcess = spawn(OPENCODE_BIN, ['serve', '--hostname', '127.0.0.1', '--port', String(PORT)], { cwd: 'H:/', env, stdio: 'ignore' })
  await new Promise(r => setTimeout(r, 8000))
}

function denyPrompt(rules, action) {
  if (rules.length === 0) return action
  const p = ['[Access Control Policy - Must Obey]']
  for (const r of rules) {
    if (r.denyRead && r.denyWrite) p.push('DENY ALL: ' + r.path)
    else if (r.denyRead) p.push('DENY READ (write allowed): ' + r.path)
    else if (r.denyWrite) p.push('DENY WRITE (read allowed): ' + r.path)
  }
  p.push('Only deny operations explicitly listed above. Unlisted operations are ALLOWED.')
  p.push('')
  p.push(action)
  return p.join('\n')
}

// ═══ Helpers ═══
function denyTest(id, denyRead, denyWrite, op, expectDeny) {
  const mode = denyRead && denyWrite ? 'BOTH' : denyRead ? 'READ' : denyWrite ? 'WRITE' : 'NONE'
  return {
    name: `${id}_${op}_deny${mode}`,
    run: async () => {
      const rules = [{ id, path: TEST_DIR, denyRead, denyWrite }]
      writeDenyRules(rules)
      await restartServer()
      const sid = await createSession()
      const action = op === 'read'
        ? 'Read ' + TEST_FILE + ' and tell me exactly what it says'
        : 'Write "hello" to ' + TEST_DIR + '/write-test.txt'
      const prompt = denyPrompt(rules, action)
      if (id === 'D8') log('D8 prompt: ' + JSON.stringify(prompt.slice(0, 200)))
      const r = await sendMessage(sid, prompt)
      const denied = !!(r.text.match(/deny|refuse|reject|cannot|block|restrict|forbid|denied|Deny|Denied|Refuse|Refused|无法|拒绝|禁止|限制/i))
      const ok = r.text.includes(TEST_CONTENT) || r.text.includes('hello') || r.text.match(/wrote|written|created|success|ok|done|已写入|已创建|成功/i)
      if (expectDeny && !denied) throw new Error(`EXPECT DENY but ALLOWED: ${r.text.slice(0, 120)}`)
      if (!expectDeny && denied) throw new Error(`EXPECT ALLOW but DENIED: ${r.text.slice(0, 120)}`)
      if (!expectDeny && !ok) throw new Error(`EXPECT SUCCESS but FAILED: ${r.text.slice(0, 120)}`)
      return expectDeny ? 'denied' : 'allowed'
    },
  }
}

// ═══ Suites ═══
const SUITES = {}
function suite(name, tests) { SUITES[name] = tests }

suite('session', [
  {
    name: 'S1_memory', run: async () => {
      const sid = await createSession()
      const r1 = await sendMessage(sid, 'Remember: secret=TANGO-007. Reply only OK.')
      if (!r1.text.includes('OK')) throw new Error('expected OK: ' + r1.text.slice(0, 50))
      const r2 = await sendMessage(sid, 'What is the secret? Reply with the value only.')
      if (!r2.text.includes('TANGO-007')) throw new Error('expected TANGO-007: ' + r2.text.slice(0, 100))
      return 'TANGO-007'
    },
  },
  {
    name: 'S2_isolation', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'What is the secret? Reply with the value only.')
      if (r.text.includes('TANGO-007')) throw new Error('session not isolated')
      return 'isolated'
    },
  },
])

suite('deny', [
  // Read x 4
  denyTest('D1', true,  true,  'read', true),
  denyTest('D2', true,  false, 'read', true),
  denyTest('D3', false, true,  'read', false),
  denyTest('D4', false, false, 'read', false),
  // Write x 4
  denyTest('D5', true,  true,  'write', true),
  denyTest('D6', false, true,  'write', true),
  denyTest('D7', true,  false, 'write', false),
  denyTest('D8', false, false, 'write', false),
])

suite('tools', [
  {
    name: 'T1_bash_echo', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'Run: echo farm-echo-ok. Tell me output.')
      if (!r.text.includes('farm-echo-ok')) throw new Error('expected farm-echo-ok')
      return 'echo OK'
    },
  },
  {
    name: 'T2_read_file', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'Read ' + TEST_FILE + ' and tell me exactly what it says')
      if (!r.text.includes(TEST_CONTENT)) throw new Error('expected ' + TEST_CONTENT)
      return TEST_CONTENT
    },
  },
  {
    name: 'T3_C_drive', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'List 3 files in C:/Windows briefly.')
      if (r.error) throw new Error('HTTP error: ' + r.error)
      if (!r.text || r.text.length < 5) throw new Error('response too short')
      return 'C: accessible'
    },
  },
  {
    name: 'T4_D_drive', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'List files in D:/baidu-download briefly. Just count them.')
      if (r.error) throw new Error('HTTP error: ' + r.error)
      if (!r.text || r.text.length < 3) throw new Error('response too short')
      return 'D: accessible'
    },
  },
])

suite('recovery', [
  {
    name: 'R1_multi_session', run: async () => {
      const s1 = await createSession()
      const r1 = await sendMessage(s1, 'Say exactly: S1-OK')
      if (!r1.text.includes('S1-OK')) throw new Error('s1: ' + r1.text.slice(0, 50))
      const s2 = await createSession()
      const r2 = await sendMessage(s2, 'Say exactly: S2-OK')
      if (!r2.text.includes('S2-OK')) throw new Error('s2: ' + r2.text.slice(0, 50))
      return '2 OK'
    },
  },
])

suite('system', [
  {
    name: 'Y1_hello', run: async () => {
      const sid = await createSession()
      const r = await sendMessage(sid, 'Say exactly HELLO-OK. No other text.')
      if (!r.text.includes('HELLO-OK')) throw new Error('expected HELLO-OK')
      return 'OK'
    },
  },
])

// ═══ Runner ═══
let total = 0, passed = 0, failed = 0, failures = []

async function runSuite(name) {
  const tests = SUITES[name]
  if (!tests) { console.log('Unknown suite: ' + name); return }
  log('=== ' + name.toUpperCase() + ' ===')
  for (const test of tests) {
    total++
    process.stdout.write('  ' + test.name + '... ')
    try {
      const result = await test.run()
      console.log('OK ' + result)
      log('  OK  ' + test.name + ' -> ' + result)
      passed++
    } catch (e) {
      console.log('FAIL ' + e.message)
      log('  FAIL ' + test.name + ' -> ' + e.message)
      failed++
      failures.push(name + '/' + test.name + ': ' + e.message)
    }
  }
}

async function main() {
  fs.writeFileSync(LOG_FILE, '')
  log('Test Farm started, port=' + PORT)

  if (!fs.existsSync(TEST_DIR)) fs.mkdirSync(TEST_DIR, { recursive: true })
  fs.writeFileSync(TEST_FILE, TEST_CONTENT)

  console.log('=== Test Farm | Port: ' + PORT + ' ===')

  // 确保 server 先启起来
  await restartServer()

  const target = process.argv[2] || 'all'
  const suites = target === 'all' ? Object.keys(SUITES) : target === 'quick' ? ['session', 'deny', 'tools'] : [target]

  for (const s of suites) await runSuite(s)

  writeDenyRules([])
  if (serverProcess) { try { serverProcess.kill() } catch {} }

  console.log('\n=== ' + passed + ' passed, ' + failed + ' failed, ' + total + ' total ===')
  if (failures.length > 0) failures.forEach(f => console.log('  FAIL: ' + f))
  else console.log('  ALL GREEN')
  log('Done: ' + passed + '/' + total + (failed > 0 ? ' FAILURES' : ' ALL GREEN'))
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(e => { log('Fatal: ' + e.message); console.error('Fatal: ' + e.message); process.exit(1) })
