/**
 * 百度盘下载 — Playwright + 从JSON注入cookie
 */
import { chromium } from 'playwright'
import { readFileSync, createWriteStream, existsSync, mkdirSync } from 'fs'
import { join } from 'path'

const DEST = 'D:/百度网盘临时下载'
const SURL = '1lc98wHXZv7o9CbLISQYfMA'

if (!existsSync(DEST)) mkdirSync(DEST, { recursive: true })

// 加载导出的 cookie JSON → 转 Playwright 格式
const data = JSON.parse(readFileSync('H:/downloads/cookies.json', 'utf-8'))
const cookies = data.cookies.map(c => ({
  name: c.name,
  value: c.value,
  domain: c.domain,
  path: c.path || '/',
  httpOnly: c.httpOnly || false,
  secure: c.secure || false,
  sameSite: 'Lax',
}))

console.log('Cookies loaded:', cookies.length)

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
})

// 注入所有 cookie
await context.addCookies(cookies)
console.log('Cookies injected')

const page = await context.newPage()
const downloads = []

page.on('download', async (dl) => {
  const name = dl.suggestedFilename()
  const dest = join(DEST, name)
  console.log('📥', name)
  await dl.saveAs(dest)
  console.log('✅', dest)
  downloads.push(dest)
})

try {
  // 直接访问分享页（有 BDUSS 应该能看到文件列表）
  console.log('\n=== Opening share page ===')
  await page.goto(`https://pan.baidu.com/s/${SURL}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(5000)

  // 填密码
  const input = await page.$('input[type="text"], input[placeholder*="提取"]')
  if (input) {
    await input.fill('smbd')
    console.log('Filled password')

    // 点提取文件
    const submitBtn = await page.$('a.btn, span.btn, div.btn, button, a.node, .pickpw-clearfix a')
    // Try text matching
    const all = await page.$$('a, span, div')
    for (const el of all) {
      const t = await el.textContent()
      if (t?.trim() === '提取文件' || t?.includes('提取')) {
        await el.click()
        console.log('Clicked:', t.trim())
        break
      }
    }
    await page.waitForTimeout(5000)
  } else {
    console.log('No password input — already authenticated')
  }

  // 截图看状态
  await page.screenshot({ path: 'H:/downloads/baidu_after_pw.png', fullPage: true })

  // 拿页面文本
  const text = await page.$$eval('body', els => els[0]?.innerText || '')
  console.log('\n=== Page text ===')
  console.log(text.slice(0, 2000))

  // 找文件元素
  const fileEls = await page.$$('[class*="file"], [class*="item"], [class*="entry"], .filename, .file-name, dd, li')
  console.log('\nFile elements:', fileEls.length)
  for (const el of fileEls.slice(0, 20)) {
    const t = await el.textContent()
    if (t && t.length > 3 && t.length < 200) {
      console.log(' -', t.trim().slice(0, 100))
    }
  }

  // 尝试勾选全选 + 下载
  const checkAll = await page.$('[class*="check-all"], [class*="select-all"], .select-all')
  if (checkAll) {
    await checkAll.click()
    console.log('Clicked select all')
    await page.waitForTimeout(1000)
  }

  // 点下载按钮
  const dlBtns = await page.$$('a, span, div, button')
  for (const b of dlBtns) {
    const t = await b.textContent()
    if (t?.trim() === '下载' || t?.trim() === '保存到网盘') {
      console.log('Button:', t.trim())
    }
  }

  // 等下载
  console.log('\nWaiting 30s for downloads...')
  await page.waitForTimeout(30000)

  console.log('\nDownloads captured:', downloads.length)
  downloads.forEach(f => console.log(' ✅', f))

} catch (e) {
  console.error('Error:', e.message)
  await page.screenshot({ path: 'H:/downloads/baidu_error.png' })
}

await browser.close()
