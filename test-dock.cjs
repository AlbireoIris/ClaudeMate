const { _electron: electron } = require('playwright')
const { execSync } = require('child_process')
const path = require('path')

async function main() {
  try { execSync('taskkill //F //IM electron.exe', { stdio: 'ignore' }) } catch {}
  try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))

  const app = await electron.launch({
    args: [path.join(__dirname, 'out', 'main', 'index.js')],
    executablePath: require('electron'), env: { ...process.env, NODE_ENV: 'development' },
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 4000))

  let ok = 0, fail = 0
  async function T(name, fn) {
    try { await fn(); console.log('  OK  ' + name); ok++ }
    catch (e) { console.log('  FAIL ' + name + ' — ' + e.message); fail++ }
  }

  const btns = () => win.locator('button.absolute.left-3')
  const panelOpen = async () => (await win.locator('.backdrop-blur-2xl').count()) > 1

  console.log('=== Dock GUI ===\n')

  await T('icons exist', async () => { const c = await btns().count(); if (c < 7) throw new Error('count=' + c) })

  // 验证 toggle 功能：两次点击状态必须不同
  await T('Menu toggle: state changes', async () => {
    const m = btns().nth(5)
    await m.click({ force: true }); await new Promise(r => setTimeout(r, 600))
    const s1 = await panelOpen()
    await m.click({ force: true }); await new Promise(r => setTimeout(r, 600))
    const s2 = await panelOpen()
    if (s1 === s2) throw new Error('toggle not working: both ' + (s1 ? 'open' : 'closed'))
  })

  await T('Shield toggle: state changes', async () => {
    const s = btns().nth(0)
    await s.click({ force: true }); await new Promise(r => setTimeout(r, 600))
    const s1 = await panelOpen()
    await s.click({ force: true }); await new Promise(r => setTimeout(r, 600))
    const s2 = await panelOpen()
    if (s1 === s2) throw new Error('toggle not working')
  })

  await T('mutual exclusive', async () => {
    await btns().nth(0).click({ force: true }); await new Promise(r => setTimeout(r, 800))
    await btns().nth(5).click({ force: true }); await new Promise(r => setTimeout(r, 800))
    if ((await win.locator('text=访问控制').count()) > 0) throw new Error('Shield not auto-closed')
    if ((await win.locator('text=文件浏览器').count()) === 0) throw new Error('Menu not open')
    await btns().nth(5).click({ force: true })
  })

  await T('drag no open', async () => {
    const btn = btns().nth(2); const box = await btn.boundingBox()
    await win.mouse.move(box.x + 24, box.y + 24)
    await win.mouse.down()
    await win.mouse.move(box.x + 24, box.y + 100, { steps: 10 })
    await win.mouse.up(); await new Promise(r => setTimeout(r, 600))
    if (await panelOpen()) throw new Error('panel opened after drag')
  })

  await app.close()
  console.log('\n  ' + ok + '/' + (ok + fail) + ' passed')
  process.exit(fail > 0 ? 1 : 0)
}
main().catch(e => { console.error(e.message); process.exit(1) })
