/**
 * 百度盘自动下载 — 复用 Chrome 用户配置（已登录）
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const SHARE_URL = 'https://pan.baidu.com/s/1lc98wHXZv7o9CbLISQYfMA'
const PASSWORD = 'smbd'
const DOWNLOAD_DIR = 'D:/百度网盘临时下载'

if (!existsSync(DOWNLOAD_DIR)) mkdirSync(DOWNLOAD_DIR, { recursive: true })

const userDataDir = process.env.LOCALAPPDATA + '/Google/Chrome/User Data'
console.log('Chrome profile:', userDataDir)

const browser = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: ['--no-sandbox'],
  viewport: { width: 1280, height: 900 },
  acceptDownloads: true,
})

const page = browser.pages()[0] || await browser.newPage()
const downloads = []

page.on('download', async (dl) => {
  const name = dl.suggestedFilename()
  const dest = join(DOWNLOAD_DIR, name)
  console.log('📥', name)
  await dl.saveAs(dest)
  console.log('✅', dest)
  downloads.push(dest)
})

try {
  console.log('=== Loading share page ===')
  await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(5000)

  // Input password
  const input = await page.$('input[type="text"], input[placeholder*="提取"]')
  if (input) {
    await input.fill(PASSWORD)
    console.log('Password filled')

    // Find and click submit by matching text "提取文件"
    const btns = await page.$$('a, span, div')
    for (const b of btns) {
      const t = await b.textContent()
      if (t?.trim() === '提取文件') {
        await b.click()
        console.log('Clicked: 提取文件')
        break
      }
    }
    await page.waitForTimeout(5000)
  }

  // Now should be on file list
  const text = await page.$$eval('body', els => els[0]?.innerText || '')
  console.log('\n=== Page content ===')
  console.log(text.slice(0, 1500))

  // Screenshot
  await page.screenshot({ path: 'H:/downloads/baidu_loggedin.png', fullPage: true })
  console.log('📸 Screenshot saved')

  // Try clicking file checkboxes and download button
  const checkboxes = await page.$$('span[class*="check"], input[type="checkbox"], div[class*="check"]')
  console.log('Checkboxes found:', checkboxes.length)
  if (checkboxes.length > 0) {
    await checkboxes[0].click()
    await page.waitForTimeout(1000)
  }

  // Look for download button
  const allBtns = await page.$$('a, span, div, button')
  for (const b of allBtns) {
    const t = await b.textContent()
    if (t?.includes('下载') && t.length < 10) {
      console.log('Clicking:', t.trim())
      await b.click()
      await page.waitForTimeout(5000)
      break
    }
  }

  await page.waitForTimeout(10000)
  console.log('\nDownloads:', downloads.length)
  if (downloads.length > 0) {
    console.log('Files:')
    downloads.forEach(f => console.log(' ', f))
  } else {
    console.log('No automatic downloads captured. Check screenshot.')
  }

} catch (e) {
  console.error('Error:', e.message)
  await page.screenshot({ path: 'H:/downloads/baidu_error.png' })
}

// Keep open for 30s to allow downloads to start
console.log('\nWaiting 30s for downloads...')
await page.waitForTimeout(30000)
await browser.close()
console.log('Downloads:', downloads.length)
