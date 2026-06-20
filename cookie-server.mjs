/**
 * Cookie 接收服务 — 监听 Chrome 扩展 POST，保存到 H 盘
 */
import { createServer } from 'http'
import { writeFileSync } from 'fs'

const PORT = 19999
const DEST = 'H:/downloads/cookies.json'

createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method === 'POST' && req.url === '/cookies') {
    let body = ''
    req.on('data', c => body += c)
    req.on('end', () => {
      try {
        // 格式化并保存
        const data = JSON.parse(body)
        writeFileSync(DEST, JSON.stringify(data, null, 2), 'utf-8')
        console.log(`✅ ${data.total || data.cookies?.length || '?'} cookies → ${DEST}`)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, saved: DEST }))
      } catch (e) {
        res.writeHead(400)
        res.end(JSON.stringify({ error: e.message }))
      }
    })
    return
  }

  res.writeHead(404)
  res.end('not found')
}).listen(PORT, '127.0.0.1', () => {
  console.log(`🍪 Cookie server: http://127.0.0.1:${PORT}/cookies`)
  console.log(`   保存位置: ${DEST}`)
})
