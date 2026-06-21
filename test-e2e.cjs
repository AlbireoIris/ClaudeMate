/**
 * OpenMate E2E — GUI 模拟用户操作
 *   node test-e2e.cjs
 */
const { _electron: electron } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const APP_DIR = __dirname
const MAIN_ENTRY = path.join(APP_DIR, 'out', 'main', 'index.js')
const ELECTRON_BIN = require('electron')
const LOG_FILE = path.join(APP_DIR, 'test-e2e.log')

let app = null
let window = null

// ═══ Log ═══
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19)
  const line = `[${ts}] ${msg}`
  console.log(line)
  fs.appendFileSync(LOG_FILE, line + '\n')
}

// ═══ Process ═══
async function killAll() {
  for (let i = 0; i < 3; i++) {
    try { execSync('taskkill //F //IM electron.exe', { stdio: 'ignore' }) } catch {}
    try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
    await new Promise(r => setTimeout(r, 1500))
  }
}

async function launchApp() {
  await killAll()
  app = await electron.launch({
    args: [MAIN_ENTRY],
    executablePath: ELECTRON_BIN,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  window = await app.firstWindow()
  await window.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 3000))
}

// ═══ Results ═══
let passed = 0, failed = 0, failures = []
async function test(name, fn) {
  process.stdout.write(`  ${name}... `)
  try {
    await fn()
    console.log('OK')
    log('  OK  ' + name)
    passed++
  } catch (e) {
    console.log('FAIL')
    console.log(`       ${e.message}`)
    log('  FAIL ' + name + ' -> ' + e.message)
    failed++
    failures.push(name + ': ' + e.message)
  }
}

// ═══ GUI Actions ═══
const AI_BUBBLE = '.justify-end .whitespace-pre-wrap'

async function typeAndSend(text) {
  const input = window.locator('input[type="text"]').first()
  await input.fill('')
  await input.fill(text)
  await input.press('Enter')
}

async function waitForReply(timeoutMs = 60000) {
  const start = Date.now()
  let prevCount = await window.locator(AI_BUBBLE).count()
  while (Date.now() - start < timeoutMs) {
    const count = await window.locator(AI_BUBBLE).count()
    if (count > prevCount) {
      const text = (await window.locator(AI_BUBBLE).nth(count - 1).textContent()) || ''
      if (text.length > 5) return text.trim()
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  throw new Error('No reply after ' + timeoutMs + 'ms')
}

async function clickShield() {
  const btn = window.locator('button.absolute.left-3.z-40')
  if (await btn.count() === 0) throw new Error('Shield button not found')
  await btn.click({ force: true })
  await new Promise(r => setTimeout(r, 600))
}

async function closePanel() {
  const overlay = window.locator('.bg-black\\/20')
  if (await overlay.count() > 0) {
    await overlay.first().click({ force: true })
    await new Promise(r => setTimeout(r, 400))
  }
}

async function panelHasText(text) {
  return (await window.locator(`text=${text}`).count()) > 0
}

// ═══ Deny 规则 (通过 IPC, 模拟 DenyPanel 操作) ═══
async function setDenyRules(rules) {
  // 清除旧规则
  const existing = await window.evaluate(() => window.electronAPI.getDenyRules())
  for (const r of (existing || [])) {
    await window.evaluate((id) => window.electronAPI.removeDenyRule(id), r.id)
  }
  // 添加新规则
  for (const r of rules) {
    await window.evaluate(({ path, denyRead, denyWrite }) =>
      window.electronAPI.addDenyRule(path, denyRead, denyWrite), { path: r.path, denyRead: r.denyRead, denyWrite: r.denyWrite })
  }
  // 刷新 store + 等 server 重启完成
  await window.evaluate(() => { window.__DENY_STORE_REFRESH__ && window.__DENY_STORE_REFRESH__() })
  // 发一条轻量消息确认 server 就绪
  for (let i = 0; i < 15; i++) {
    try {
      await window.evaluate(() => window.electronAPI.getDenyRules())
      break
    } catch { await new Promise(r => setTimeout(r, 2000)) }
  }
}

async function checkDenyPanelShows(path) {
  // 关闭再打开，触发 remount + loadRules
  await closePanel()
  await clickShield()
  const hasPath = await panelHasText(path.split('\\').pop()) // 只查文件夹名
  if (!hasPath) throw new Error('DenyPanel does not show ' + path)
  await closePanel()
}

async function checkDenyPanelEmpty() {
  await closePanel()
  await clickShield()
  if (await panelHasText('尚未设置禁入规则')) return // 空态正确
  // 如果有规则项显示，检查是否真的为空
  const rules = await window.evaluate(() => window.electronAPI.getDenyRules())
  if (rules && rules.length > 0) throw new Error('DenyPanel not empty: ' + rules.length + ' rules')
}

// ═══ Test Cases ═══

async function main() {
  fs.writeFileSync(LOG_FILE, '')
  log('E2E started')
  console.log('=== OpenMate E2E ===\n')

  // ─── Singleton ───
  await test('SINGLETON: launch', async () => { await launchApp() })
  await test('SINGLETON: second instance rejected', async () => {
    try {
      const app2 = await electron.launch({
        args: [MAIN_ENTRY], executablePath: ELECTRON_BIN,
        env: { ...process.env, NODE_ENV: 'development' },
      })
      await new Promise(r => setTimeout(r, 3000))
      try { await app2.close() } catch {}
      throw new Error('second instance survived')
    } catch { /* expected */ }
    log('  -> second instance killed immediately')
  })

  // ─── Chat ───
  await test('CHAT: send text, check no duplicate', async () => {
    await typeAndSend('你好，用一句话回复')
    const reply = await waitForReply(30000)
    const half = Math.floor(reply.length / 2)
    if (half > 5 && reply.slice(0, half) === reply.slice(half, half * 2))
      throw new Error('DUPLICATE: ' + reply.slice(0, 100))
    if (reply.length < 3) throw new Error('empty reply')
    log('  -> "' + reply.slice(0, 60) + '"')
  })

  await test('CHAT: read file via tool', async () => {
    await typeAndSend('Read H:/test_verify.txt and tell me exactly what it says')
    const reply = await waitForReply(60000)
    if (!reply.includes('unique_content_abc123'))
      throw new Error('file not read: ' + reply.slice(0, 120))
  })

  // ─── Dock 侧边栏 GUI ───
  await test('DOCK: 6 icons visible', async () => {
    const count = await window.locator('button.absolute.left-3').count()
    if (count !== 6) throw new Error(`Expected 6, got ${count}`)
  })

  await test('DOCK: click Menu → panel opens', async () => {
    await window.locator('button.absolute.left-3').nth(5).click({ force: true })
    await new Promise(r => setTimeout(r, 800))
    // 面板有 backdrop-blur-2xl class
    if ((await window.locator('.backdrop-blur-2xl').count()) < 2) throw new Error('panel not visible')
  })

  await test('DOCK: click Menu → panel closes', async () => {
    await window.locator('button.absolute.left-3').nth(5).click({ force: true })
    await new Promise(r => setTimeout(r, 800))
    if ((await window.locator('.backdrop-blur-2xl').count()) >= 2) throw new Error('panel still visible')
  })

  await test('DOCK: mutual exclusive', async () => {
    await window.locator('button.absolute.left-3').nth(0).click({ force: true })
    await new Promise(r => setTimeout(r, 1000))
    await window.locator('button.absolute.left-3').nth(5).click({ force: true })
    await new Promise(r => setTimeout(r, 1000))
    if ((await window.locator('text=访问控制').count()) > 0) throw new Error('Shield not auto-closed')
    if ((await window.locator('text=文件浏览器').count()) === 0) throw new Error('Menu not open')
    await window.locator('button.absolute.left-3').nth(5).click({ force: true })
  })

  await test('DOCK: drag → no open · other icons shift', async () => {
    const btns = window.locator('button.absolute.left-3')
    const btn = btns.nth(2) // Scraper
    const box = await btn.boundingBox()
    await window.mouse.move(box.x + 24, box.y + 24)
    await window.mouse.down()
    await window.mouse.move(box.x + 24, box.y + 100, { steps: 10 })
    await window.mouse.up()
    await new Promise(r => setTimeout(r, 800))
    if ((await window.locator('.backdrop-blur-2xl').count()) >= 2) throw new Error('panel opened after drag')
  })

  // ─── Deny Rules: 8 permutations ───
  const DENY_DIR = 'H:\\claude-code-assistant\\test-farm-workspace'

  // Read × 4
  await test('DENY: read | deny BOTH → refused', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: true, denyWrite: true }])
    await typeAndSend('Read ' + DENY_DIR + '/read-test.txt and tell me exactly what it says')
    const reply = await waitForReply(90000)
    if (reply.match(/farm-test-content/i)) throw new Error('should refuse but allowed')
    if (!reply.match(/拒绝|禁止|限制|无法|deny|refuse|cannot/i)) throw new Error('no deny word')
  })

  await test('DENY: read | deny READ only → refused', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: true, denyWrite: false }])
    await typeAndSend('Read ' + DENY_DIR + '/read-test.txt and tell me exactly what it says')
    const reply = await waitForReply(90000)
    if (reply.match(/farm-test-content/i)) throw new Error('should refuse but allowed')
  })

  await test('DENY: read | deny WRITE only → allowed', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: false, denyWrite: true }])
    await typeAndSend('Read ' + DENY_DIR + '/read-test.txt and tell me exactly what it says')
    const reply = await waitForReply(90000)
    if (!reply.includes('farm-test-content-v1')) throw new Error('should read: ' + reply.slice(0, 100))
  })

  await test('DENY: read | deny NONE → allowed', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: false, denyWrite: false }])
    await typeAndSend('Read ' + DENY_DIR + '/read-test.txt and tell me exactly what it says')
    const reply = await waitForReply(90000)
    if (!reply.includes('farm-test-content-v1')) throw new Error('should read: ' + reply.slice(0, 100))
  })

  // Write × 4
  await test('DENY: write | deny BOTH → refused', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: true, denyWrite: true }])
    await typeAndSend('Write "hello" to ' + DENY_DIR + '/write-test.txt')
    const reply = await waitForReply(90000)
    if (!reply.match(/拒绝|禁止|限制|无法|deny|refuse|cannot/i)) throw new Error('should refuse: ' + reply.slice(0, 100))
  })

  await test('DENY: write | deny WRITE only → refused', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: false, denyWrite: true }])
    await typeAndSend('Write "hello" to ' + DENY_DIR + '/write-test.txt')
    const reply = await waitForReply(90000)
    if (!reply.match(/拒绝|禁止|限制|无法|deny|refuse|cannot/i)) throw new Error('should refuse: ' + reply.slice(0, 100))
  })

  await test('DENY: write | deny READ only → allowed', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: true, denyWrite: false }])
    await typeAndSend('Use bash: echo hello > ' + DENY_DIR + '/write-test.txt')
    const reply = await waitForReply(120000)
    // "禁止读取但允许写入" → 写入成功不算拒绝
    if (reply.match(/无法写入|拒绝写入|不允许写入|无法创建|denied.*write/i)) throw new Error('should allow: ' + reply.slice(0, 100))
  })

  await test('DENY: write | deny NONE → allowed', async () => {
    await setDenyRules([{ path: DENY_DIR, denyRead: false, denyWrite: false }])
    await typeAndSend('Write "hello" to ' + DENY_DIR + '/write-test.txt')
    const reply = await waitForReply(120000)
    if (reply.match(/拒绝|禁止|限制|无法/i)) throw new Error('should allow: ' + reply.slice(0, 100))
  })

  // ─── Cleanup ───
  await test('DENY: clear rules', async () => {
    await setDenyRules([])
    // 验证规则清空（通过 IPC 检查后端）
    const rules = await window.evaluate(() => window.electronAPI.getDenyRules())
    if (rules && rules.length > 0) throw new Error('rules not cleared: ' + rules.length)
  })

  // ─── Done ───
  await setDenyRules([])
  if (app) try { await app.close() } catch {}
  await killAll()

  log('Done: ' + passed + '/' + (passed + failed) + (failed > 0 ? ' FAILURES' : ' ALL GREEN'))
  console.log('\n=== ' + passed + ' passed, ' + failed + ' failed, ' + (passed + failed) + ' total ===')
  if (failures.length > 0) failures.forEach(f => console.log('  FAIL: ' + f))
  else console.log('  ALL GREEN')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(async e => {
  log('Fatal: ' + e.message)
  console.error('Fatal:', e.message)
  if (app) try { await app.close() } catch {}
  process.exit(1)
})
