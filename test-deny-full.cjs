/**
 * 测试 deny rule 全流程: add → save → load → opencode.json
 */
const fs = require('fs')
const path = require('path')
const os = require('os')

// 模拟 config-store 的核心逻辑
function testBackend() {
  const configDir = path.join(__dirname, 'config')
  const configFile = path.join(configDir, 'cc-config.conf')

  console.log('=== 当前 cc-config.conf deny 段 ===')
  const raw = fs.readFileSync(configFile, 'utf-8')
  const denyLines = raw.split('\n').filter(l => l.trim().startsWith('deny.'))
  console.log(denyLines.length > 0 ? denyLines.join('\n') : '(空 — 尚无禁入规则)')

  console.log('\n=== 当前 opencode.json ===')
  const ocFile = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  if (fs.existsSync(ocFile)) {
    const cfg = JSON.parse(fs.readFileSync(ocFile, 'utf-8'))
    console.log('model:', cfg.model)
    console.log('permission:', JSON.stringify(cfg.permission, null, 2))
  } else {
    console.log('(文件不存在 — opencode server 尚未启动)')
  }

  // 模拟添加规则后的 opencode.json 生成
  console.log('\n=== 模拟含 deny 规则的 opencode.json ===')
  const mockDenyRules = [
    { path: 'H:/test-deny-read', denyRead: true, denyWrite: false },
    { path: 'D:/test-deny-write', denyRead: false, denyWrite: true },
    { path: 'H:/test-deny-both', denyRead: true, denyWrite: true },
  ]

  const readPerms = { 'H:/*': 'allow', 'D:/*': 'allow' }
  const editPerms = { 'H:/*': 'allow', 'D:/*': 'allow' }
  for (const r of mockDenyRules) {
    const pattern = r.path.replace(/\\/g, '/') + '/*'
    if (r.denyRead) readPerms[pattern] = 'deny'
    if (r.denyWrite) editPerms[pattern] = 'deny'
  }

  const sysParts = [
    '【禁入规则】',
    ...mockDenyRules.map(r => {
      const mode = r.denyRead && r.denyWrite ? '禁止读写'
        : r.denyRead ? '仅禁止读取'
        : '仅禁止写入'
      return `❌ ${r.path} → ${mode}`
    })
  ]

  console.log('System prompt:')
  console.log(sysParts.join('\n'))
  console.log('\nread permissions:', JSON.stringify(readPerms))
  console.log('edit permissions:', JSON.stringify(editPerms))
}

testBackend()
