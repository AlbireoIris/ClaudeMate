/**
 * 测试脚本 — 模拟 GUI 发送消息的完整 HTTP 路径
 * 用法: node test-send.cjs "你的消息"
 *       node test-send.cjs --multi "第一条"   (多轮测试)
 */
const http = require('http')

const HOST = '127.0.0.1'

function httpReq(method, port, path, body) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : undefined
    const buf = bodyStr ? Buffer.from(bodyStr, 'utf-8') : undefined
    const req = http.request({
      hostname: HOST, port, path, method,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...(buf ? { 'Content-Length': String(buf.length) } : {}),
      },
      timeout: 300000,
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
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (buf) req.write(buf)
    req.end()
  })
}

async function findPort() {
  // 优先用环境变量，否则自动扫描
  if (process.env.OC_PORT) return parseInt(process.env.OC_PORT)
  for (let port = 1000; port < 20000; port++) {
    try {
      const r = await httpReq('GET', port, '/health')
      if (r.status === 200) {
        console.log(`✅ server on port ${port}`)
        return port
      }
    } catch {}
  }
  throw new Error('No opencode server found')
}

async function send(port, sessionId, msg) {
  console.log(`\n📤: ${msg.slice(0, 80)}`)
  const start = Date.now()

  const res = await httpReq('POST', port, `/session/${sessionId}/message`, {
    parts: [{ type: 'text', text: msg }],
    resume: true,
  })

  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`⏱ ${elapsed}s | status=${res.status}`)

  if (res.status !== 200 || res.data?.name) {
    console.error('❌', JSON.stringify(res.data).slice(0, 300))
    return null
  }

  const info = res.data.info
  console.log(`📊 ${info?.providerID}/${info?.modelID} | tokens=${JSON.stringify(info?.tokens)} | finish=${info?.finish}`)

  let fullText = ''
  for (const part of res.data.parts || []) {
    switch (part.type) {
      case 'reasoning':
        console.log(`  🧠 ${(part.text || '').slice(-100)}`)
        break
      case 'text':
        fullText += (part.text || '')
        console.log(`  💬 ${(part.text || '').slice(0, 300)}`)
        break
      case 'tool':
        console.log(`  🔧 [${part.tool}] state=${part.state} text=${(part.text || '').slice(0, 150)}`)
        break
      default:
        if (part.type !== 'step-start' && part.type !== 'step-finish') {
          console.log(`  ❓ [${part.type}] ${JSON.stringify(part).slice(0, 200)}`)
        }
    }
  }

  console.log(`📥: ${fullText || '(空/仅工具)'}`)
  return res.data
}

async function main() {
  const args = process.argv.slice(2)
  const multi = args.includes('--multi')
  const msg = args.filter(a => a !== '--multi').join(' ') || '你好'

  const port = await findPort()

  console.log('📂 创建 session...')
  const r = await httpReq('POST', port, '/session', { directory: 'H:\\' })
  const sid = r.data?.id
  if (!sid) { console.error('❌ 创建失败'); return }
  console.log(`📋 ${sid}`)

  await send(port, sid, msg)
}

main().catch(e => {
  console.error('❌', e.message)
  process.exit(1)
})
