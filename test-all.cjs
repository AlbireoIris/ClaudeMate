/**
 * OpenMate 全局测试入口
 *   node test-all.cjs
 * 包含: test-farm (13) + test-e2e (7)
 */
const { execSync, spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

const ROOT = __dirname
const FARM = path.join(ROOT, 'test-farm.cjs')
const E2E = path.join(ROOT, 'test-e2e.cjs')
const CLEANUP = path.join(ROOT, 'config', 'cc-config.conf')

let totalPassed = 0, totalFailed = 0

function runSuite(label, script) {
  return new Promise((resolve) => {
    console.log(`\n${'═'.repeat(50)}`)
    console.log(`  ${label}`)
    console.log(`${'═'.repeat(50)}`)

    const env = { ...process.env, DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '${DEEPSEEK_API_KEY}' }
    const child = spawn('node', [script], { cwd: ROOT, env, stdio: 'inherit' })

    child.on('close', (code) => {
      resolve(code === 0)
    })
  })
}

async function main() {
  console.log(`${'═'.repeat(50)}`)
  console.log('  OpenMate Global Test Suite')
  console.log(`${'═'.repeat(50)}`)

  // 1. Backend
  const farmOk = await runSuite('test-farm (backend: session/deny/tools/recovery/system)', FARM)
  if (farmOk) totalPassed += 13; else totalFailed += 13

  // 2. Frontend
  const e2eOk = await runSuite('test-e2e (frontend: singleton/chat/deny/GUI)', E2E)
  if (e2eOk) totalPassed += 10; else totalFailed += 10

  // 清理
  try {
    let raw = fs.readFileSync(CLEANUP, 'utf-8')
    raw = raw.split('\n').filter(l => !l.match(/^deny\./)).join('\n')
    fs.writeFileSync(CLEANUP, raw, 'utf-8')
  } catch {}

  console.log(`\n${'═'.repeat(50)}`)
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed`)
  console.log(`${'═'.repeat(50)}`)
  process.exit(totalFailed > 0 ? 1 : 0)
}

main()
