/**
 * GUI 冒烟测试 — 检查渲染不崩溃
 *   node test-smoke.cjs
 */
const { _electron: electron } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')

async function main() {
  try { execSync('taskkill //F //IM electron.exe', { stdio: 'ignore' }) } catch {}
  try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))

  console.log('Launching...')
  const app = await electron.launch({
    args: [path.join(__dirname, 'out', 'main', 'index.js')],
    executablePath: require('electron'),
    env: { ...process.env, NODE_ENV: 'development' },
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 2000))

  // 检查 console 错误
  const errors = []
  win.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
  win.on('pageerror', err => errors.push(err.message))

  // 等 3 秒让 React 渲染完成
  await new Promise(r => setTimeout(r, 3000))

  // 核心检查
  console.log('\n=== Smoke Checks ===')
  let ok = 0, fail = 0

  const checks = [
    ['标题栏 OpenMate', 'text=OpenMate'],
    ['输入框', 'input[type="text"]'],
    ['发送按钮', 'button'],
    ['无白屏 (body 有内容)', 'text=/OpenMate|发送|就绪/'],
  ]

  for (const [name, sel] of checks) {
    try {
      const count = await win.locator(sel).count()
      if (count > 0) { console.log(`  ✅ ${name}`); ok++ }
      else { console.log(`  ❌ ${name} — not found`); fail++ }
    } catch (e) {
      console.log(`  ❌ ${name} — ${e.message}`); fail++
    }
  }

  if (errors.length > 0) {
    console.log(`\n  ⚠️  ${errors.length} console errors:`)
    errors.slice(0, 5).forEach(e => console.log(`     ${e.slice(0, 200)}`))
  }

  await app.close()
  console.log(`\n  ${ok}/${ok + fail} passed`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1) })
