/**
 * 百度盘 API 直接下载 — 使用 BDUSS cookie
 */
import { readFileSync, writeFileSync, createWriteStream, existsSync, mkdirSync } from 'fs'
import { request } from 'https'
import { join } from 'path'

const COOKIE_STR = readFileSync('H:/downloads/baidu_cookies.txt', 'utf-8')
const SURL = '1lc98wHXZv7o9CbLISQYfMA'
const PASSWORD = 'smbd'
const DEST = 'D:/百度网盘临时下载'

function apiPost(path, body = '') {
  return new Promise((resolve, reject) => {
    const req = request({
      hostname: 'pan.baidu.com', port: 443, path, method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': COOKIE_STR,
        'User-Agent': 'Mozilla/5.0',
        'Referer': 'https://pan.baidu.com/s/' + SURL,
      },
      timeout: 30000,
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve({ raw: data, status: res.statusCode }) }
      })
      res.on('error', reject)
    })
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

function apiGet(path) {
  return new Promise((resolve, reject) => {
    request({
      hostname: 'pan.baidu.com', port: 443, path, method: 'GET',
      headers: { 'Cookie': COOKIE_STR, 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000,
    }, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => {
        try { resolve(JSON.parse(data)) }
        catch { resolve({ raw: data, status: res.statusCode }) }
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

async function main() {
  // Step 1: Verify share password
  console.log('=== Step 1: Verify share ===')
  const verify = await apiPost(
    `/share/verify?surl=${SURL}&t=${Date.now()}&web=1&app_id=250528&clienttype=0`,
    `pwd=${PASSWORD}`
  )
  console.log('Verify:', verify.errno === 0 ? 'OK' : 'FAIL', verify)

  if (verify.errno !== 0) {
    console.log('Password verification failed. errno:', verify.errno)
    return
  }

  const randsk = verify.randsk
  console.log('randsk:', randsk)

  // Step 2: Get file list
  console.log('\n=== Step 2: File list ===')
  const fileList = await apiGet(
    `/share/init?surl=${SURL}&randsk=${randsk}&t=${Date.now()}&web=1&app_id=250528&clienttype=0`
  )
  console.log('File list errno:', fileList.errno)

  if (fileList.errno !== 0 || !fileList.records) {
    console.log('File list error:', JSON.stringify(fileList).slice(0, 500))
    return
  }

  const files = fileList.records
  console.log('Files:', files.length)
  files.forEach(f => {
    const sizeMB = (f.size / 1024 / 1024).toFixed(1)
    console.log(` 📁 ${f.server_filename} | ${sizeMB} MB | fs_id: ${f.fs_id} | isdir: ${f.isdir}`)
  })

  // Step 3: For each file, get download link
  console.log('\n=== Step 3: Download ===')
  for (const f of files.filter(f => !f.isdir)) {
    console.log(`\nProcessing: ${f.server_filename}`)

    // Get download sign
    const dlinkReq = await apiPost(
      `/api/sharedownload?` +
      `shareid=${fileList.shareid}&from=${fileList.uk}&fid_list=[${f.fs_id}]` +
      `&sign=${fileList.sign}&timestamp=${fileList.timestamp}` +
      `&bdstoken=${fileList.bdstoken || ''}&web=1&app_id=250528&clienttype=0`,
      'encrypt=0&product=share&uk=&primaryid=' + fileList.shareid
    )
    console.log('Download sign:', dlinkReq.errno === 0 ? 'OK' : 'FAIL')

    if (dlinkReq.errno === 0 && dlinkReq.list) {
      const dlink = dlinkReq.list[0].dlink
      console.log('dlink length:', dlink?.length || 0)

      if (dlink) {
        // Download the actual file
        const destPath = join(DEST, f.server_filename)
        console.log('Downloading to:', destPath)

        await new Promise((resolve) => {
          const url = new URL(dlink + '&' + COOKIE_STR.split(';').filter(c => c.includes('BDUSS')).join(';'))
          const req = request({
            hostname: dlink.split('/')[2].split(':')[0],
            path: dlink.split(dlink.split('/')[2])[1],
            headers: {
              'Cookie': COOKIE_STR,
              'User-Agent': 'netdisk',
            },
            timeout: 30000,
          }, (res) => {
            if (res.statusCode === 302 || res.statusCode === 301) {
              // Follow redirect
              const redirUrl = res.headers.location
              console.log('Redirect to:', redirUrl?.slice(0, 80))
              // Real download URL - use it directly
              const { get } = require('https')
              const dl = get(redirUrl, { timeout: 300000 }, (res2) => {
                const file = createWriteStream(destPath)
                let total = 0, size = parseInt(res2.headers['content-length'] || '0')
                res2.pipe(file)
                res2.on('data', c => {
                  total += c.length
                  if (size > 0 && total % (1024 * 1024) < 65536) {
                    process.stdout.write(`\r  ${(total/1024/1024).toFixed(1)} MB / ${(size/1024/1024).toFixed(1)} MB`)
                  }
                })
                file.on('finish', () => {
                  console.log(`\n✅ Downloaded: ${f.server_filename} (${(total/1024/1024).toFixed(1)} MB)`)
                  resolve()
                })
                file.on('error', (e) => { console.log('Error:', e.message); resolve() })
              }).on('error', (e) => { console.log('DL error:', e.message); resolve() })
            } else {
              console.log('Unexpected status:', res.statusCode)
              resolve()
            }
          }).on('error', (e) => { console.log('Req error:', e.message); resolve() })
          req.end()
        })
      }
    }
  }

  console.log('\n✅ Done')
}

main().catch(e => console.error(e))
