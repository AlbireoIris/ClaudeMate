/**
 * 直接测试 deny rule 全流程 — 不依赖 GUI
 * 用法: node test-deny.cjs
 */
const http = require('http')

const HOST = '127.0.0.1'
let port = null

function httpReq(method, port, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const buf = bodyStr ? Buffer.from(bodyStr, 'utf-8') : undefined
    const req = http.request({
      hostname: HOST, port, path, method,
      headers: { 'Content-Type': 'application/json; charset=utf-8', ...(buf ? { 'Content-Length': String(buf.length) } : {}) },
      timeout: 10000,
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
  // 找 port
  for (let p = 1000; p < 20000; p++) {
    try { const r = await httpReq('GET', p, '/health'); if (r.status === 200) { port = p; break } } catch {}
  }
  if (!port) { console.log('No opencode server'); return }
  console.log('Port:', port)

  // 验证 opencode.json
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const configFile = path.join(os.homedir(), '.config', 'opencode', 'opencode.json')
  console.log('\n=== opencode.json ===')
  const cfg = JSON.parse(fs.readFileSync(configFile, 'utf-8'))
  console.log('model:', cfg.model)
  console.log('permission:', JSON.stringify(cfg.permission, null, 2))

  // 验证 cc-config.conf
  const ccFile = path.join(__dirname, 'config', 'cc-config.conf')
  console.log('\n=== cc-config.conf deny rules ===')
  const ccRaw = fs.readFileSync(ccFile, 'utf-8')
  const denyLines = ccRaw.split('\n').filter(l => l.includes('deny.'))
  console.log(denyLines.join('\n') || '(无禁入规则)')
}

main().catch(e => console.error(e.message))
