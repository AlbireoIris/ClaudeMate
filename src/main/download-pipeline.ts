/**
 * 下载管道 — 全自动百度盘资源获取 + 解压
 *
 * 流程:
 *   1. 网页 → QR码解码 → 百度盘链接+密码
 *   2. Playwright → 自动填密码 → 触发下载
 *   3. 监控下载 → 检测伪装文件(MP4头+ZIP尾)
 *   4. WinRAR → 改名zip → 外层解压(yejiang) → 内层解压(FLYYZ)
 *   5. 递归直到出现最终视频文件
 */
import { spawn, execSync } from 'child_process'
import { existsSync, readFileSync, writeFileSync, createWriteStream, statSync, readdirSync } from 'fs'
import { join, basename, extname } from 'path'
import { homedir } from 'os'

// ═══ 配置 ═══

const WINRAR = join(homedir(), 'Downloads', 'Winrar+小脚本3.2.1', 'Winrar', 'WinRAR.exe')
const DOWNLOAD_DIR = 'D:\\百度网盘临时下载'
const CHROME_COOKIES = 'H:\\downloads\\cookies.json'

interface PipelineStep {
  id: string
  status: 'pending' | 'running' | 'done' | 'error'
  message: string
  data?: any
}

type StepCallback = (step: PipelineStep) => void

// ═══ 工具函数 ═══

/** 读取 Chrome cookie 导出文件，按域名过滤 */
function loadCookies(domain?: string): string {
  if (!existsSync(CHROME_COOKIES)) return ''
  const data = JSON.parse(readFileSync(CHROME_COOKIES, 'utf-8'))
  const all = data.cookies?.map((c: any) => `${c.name}=${c.value}`).join('; ') || data.cookieString || ''
  if (!domain) return all
  // 筛选匹配域名的 cookie（精确 + 子域名）
  const filtered = data.cookies?.filter((c: any) => c.domain?.includes(domain.replace(/^https?:\/\//, '').split('/')[0])) || []
  return filtered.map((c: any) => `${c.name}=${c.value}`).join('; ')
}

/** 检测文件是否为伪装文件 (MP4头 + ZIP尾) */
function isDisguisedFile(filePath: string): boolean {
  try {
    const buf = readFileSync(filePath)
    if (buf.length < 100) return false
    // MP4 signature at start
    const hasMP4 = buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70
    // Check for ZIP EOCD near end
    for (let i = buf.length - 65536; i < buf.length - 22; i++) {
      if (i < 0) i = 0
      if (buf[i] === 0x50 && buf[i+1] === 0x4B && buf[i+2] === 0x05 && buf[i+3] === 0x06) {
        return hasMP4
      }
    }
    return false
  } catch { return false }
}

/** WinRAR 解压 */
function extractWithWinRAR(filePath: string, outDir: string, password: string): boolean {
  try {
    execSync(`"${WINRAR}" x "${filePath}" "${outDir}\\" -p${password} -y`, {
      timeout: 600000,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

/** Python ZIP 解压 (备用) */
function extractWithPython(filePath: string, outDir: string, password: string): boolean {
  const script = `
import zipfile, os, sys
try:
    with zipfile.ZipFile(r'${filePath}') as zf:
        zf.setpassword(b'${password}')
        zf.extractall(r'${outDir}')
    print('OK')
except Exception as e:
    print('FAIL: ' + str(e))
`
  try {
    const result = execSync(`python -c "${script.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8', timeout: 600000, windowsHide: true,
    })
    return result.includes('OK')
  } catch { return false }
}

/** 查找目录下的 zip 文件 */
function findZips(dir: string): string[] {
  const results: string[] = []
  try {
    for (const entry of walkDir(dir)) {
      const ext = extname(entry).toLowerCase()
      if (ext === '.zip' || ext === '.rar' || ext === '.7z') {
        results.push(entry)
      }
    }
  } catch {}
  return results
}

function walkDir(dir: string): string[] {
  const results: string[] = []
  try {
    for (const f of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, f.name)
      if (f.isDirectory()) results.push(...walkDir(full))
      else results.push(full)
    }
  } catch {}
  return results
}

// ═══ 核心管道 ═══

export interface PipelineResult {
  success: boolean
  steps: PipelineStep[]
  finalFiles: string[]
  baiduLink?: string
  baiduPassword?: string
  archivePassword?: string
}

export async function runDownloadPipeline(
  pageUrl: string,
  onStep?: StepCallback,
): Promise<PipelineResult> {
  const steps: PipelineStep[] = []
  const finalFiles: string[] = []
  const emit = (id: string, status: PipelineStep['status'], message: string, data?: any) => {
    const step = { id, status, message, data }
    steps.push(step)
    onStep?.(step)
    console.log(`[Pipeline] ${status.toUpperCase()} | ${id}: ${message}`)
  }

  try {
    // ═══ Phase 1: 解析网页 ═══
    emit('parse-page', 'running', '解析网页获取解压密码...')

    // 提取目标域名用于 cookie 筛选
    const targetDomain = new URL(pageUrl).hostname
    const cookies = loadCookies(targetDomain)
    if (!cookies) {
      emit('parse-page', 'error', '未找到 Chrome cookie，请先通过扩展导出')
      return { success: false, steps, finalFiles }
    }

    // 获取网页内容
    const { get } = await import('https')
    const pageHtml = await new Promise<string>((resolve) => {
      get(pageUrl, {
        timeout: 30000,
        headers: {
          'Cookie': cookies,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0.0.0',
          'Accept': 'text/html',
        }
      }, (res) => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => resolve(body))
        res.on('error', () => resolve(''))
      }).on('error', () => resolve(''))
    })

    if (!pageHtml || pageHtml.length < 500) {
      emit('parse-page', 'error', '网页获取失败或内容过短')
      return { success: false, steps, finalFiles }
    }

    // 提取解压密码
    const pwMatches = [...pageHtml.matchAll(/(?:密码|解压)[：:\s]*([A-Za-z0-9\-_]{4,16})/g)]
    const archivePassword = pwMatches.length > 0 ? pwMatches[pwMatches.length - 1][1] : 'yejiang'
    emit('parse-page', 'done', `解压密码: ${archivePassword}`, { archivePassword })

    // 提取百度提取码
    const baiduPwMatch = pageHtml.match(/(?:提取码)[：:\s]*([A-Za-z0-9]{4})/)
    const baiduPassword = baiduPwMatch?.[1] || 'smbd'

    // ═══ Phase 2: QR码 → 百度盘链接 ═══
    emit('qr-decode', 'running', '搜索并解析二维码...')

    // 从网页中找 QR 图片链接
    const imgMatches = [...pageHtml.matchAll(/https?:\/\/[^\s"']+\.(?:png|jpg|jpeg|webp)[^\s"']*/gi)]
    let baiduLink = ''

    for (const match of imgMatches.slice(0, 5)) {
      const imgUrl = match[0]
      try {
        // 下载图片并解码 QR
        const imgBuf = await new Promise<Buffer>((resolve) => {
          const proto = imgUrl.startsWith('https') ? require('https') : require('http')
          proto.get(imgUrl, { timeout: 15000 }, (res: any) => {
            const chunks: Buffer[] = []
            res.on('data', (c: Buffer) => chunks.push(c))
            res.on('end', () => resolve(Buffer.concat(chunks)))
            res.on('error', () => resolve(Buffer.alloc(0)))
          }).on('error', () => resolve(Buffer.alloc(0)))
        })

        if (imgBuf.length < 100) continue

        // QR 解码
        const { PNG } = await import('pngjs')
        const jsQR = (await import('jsqr')).default
        const png = PNG.sync.read(imgBuf as any)
        const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height)

        if (code?.data?.includes('pan.baidu.com')) {
          baiduLink = code.data
          emit('qr-decode', 'done', 'QR码解码成功', { baiduLink })
          break
        }
      } catch {}
    }

    if (!baiduLink) {
      emit('qr-decode', 'error', '未找到包含百度盘链接的QR码')
      return { success: false, steps, finalFiles, archivePassword, baiduPassword }
    }

    // ═══ Phase 3: Playwright 自动下载 ═══
    emit('baidu-download', 'running', 'Playwright 自动下载中...')

    const { chromium } = await import('playwright')
    const cookieData = JSON.parse(readFileSync(CHROME_COOKIES, 'utf-8'))
    // 注入百度系 cookie（Playwright 访问百度盘用）
    const pwCookies = cookieData.cookies
      ?.filter((c: any) => c.domain?.includes('baidu'))
      ?.map((c: any) => ({
        name: c.name, value: c.value, domain: c.domain,
        path: c.path || '/', httpOnly: c.httpOnly || false, secure: c.secure || false,
        sameSite: 'Lax' as const,
      })) || []

    const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true })
    await ctx.addCookies(pwCookies)
    const page = await ctx.newPage()

    // 提取 surl
    const surlMatch = baiduLink.match(/\/s\/([A-Za-z0-9_-]+)/)
    const surl = surlMatch?.[1] || ''
    const pwdFromUrl = baiduLink.match(/pwd=([A-Za-z0-9]+)/)?.[1] || baiduPassword

    const downloadPromise = new Promise<string[]>((resolve) => {
      const dlFiles: string[] = []
      page.on('download', async (dl: any) => {
        const name = dl.suggestedFilename()
        const dest = join(DOWNLOAD_DIR, name)
        await dl.saveAs(dest)
        dlFiles.push(dest)
        console.log('[Pipeline] Downloaded:', name)
      })
      // Resolve after some time
      setTimeout(() => resolve(dlFiles), 60000)
    })

    await page.goto(`https://pan.baidu.com/s/${surl}#list/path=%2F`, {
      waitUntil: 'domcontentloaded', timeout: 30000
    })
    await page.waitForTimeout(5000)

    const pwInput = await page.$('input[type="text"]')
    if (pwInput) {
      await pwInput.fill(pwdFromUrl)
      await pwInput.press('Enter')
      await page.waitForTimeout(5000)
    }

    // 点击下载
    const dlBtn = await page.$('a:has-text("下载"), span:has-text("下载")')
    if (dlBtn) {
      await dlBtn.click()
      emit('baidu-download', 'running', '已触发下载，等待完成(60s)...')
    }

    const downloaded = await downloadPromise
    await browser.close()

    if (downloaded.length === 0) {
      emit('baidu-download', 'error', '下载未完成，请检查百度网盘客户端')
      return { success: false, steps, finalFiles, baiduLink, baiduPassword: pwdFromUrl, archivePassword }
    }

    emit('baidu-download', 'done', `下载完成: ${downloaded.length} 个文件`, { files: downloaded })

    // ═══ Phase 4: 解压管道 ═══
    emit('extract', 'running', '开始解压...')

    const toExtract = [...downloaded]
    const extractedDir = join(DOWNLOAD_DIR, 'extracted')

    while (toExtract.length > 0) {
      const file = toExtract.shift()!
      const ext = extname(file).toLowerCase()

      // 伪装文件: 改后缀为 zip
      if (ext === '.mp4' && isDisguisedFile(file)) {
        const zipPath = file.replace(/\.mp4$/, '.zip')
        try { require('fs').renameSync(file, zipPath) } catch {}
        toExtract.push(zipPath)
        emit('extract', 'running', `检测到伪装文件，改名: ${basename(file)} → .zip`)
        continue
      }

      // ZIP/RAR 文件: 解压
      if (ext === '.zip' || ext === '.rar' || ext === '.7z') {
        const outSub = join(extractedDir, basename(file, ext))
        const passwords = [archivePassword, 'yejiang', 'FLYYZ', 'smbd']
        let extracted = false

        for (const pwd of passwords) {
          if (extractWithWinRAR(file, outSub, pwd)) {
            emit('extract', 'running', `解压成功 (pwd=${pwd}): ${basename(file)}`)
            // 递归: 检查解压出的 zip
            const innerZips = findZips(outSub)
            toExtract.push(...innerZips)
            // 收集非 zip 文件
            for (const f of walkDir(outSub)) {
              if (!['.zip', '.rar', '.7z'].includes(extname(f).toLowerCase())) {
                finalFiles.push(f)
              }
            }
            extracted = true
            break
          }
        }

        if (!extracted) {
          // 尝试 Python 备用
          for (const pwd of passwords) {
            if (extractWithPython(file, outSub, pwd)) {
              emit('extract', 'running', `Python解压 (pwd=${pwd}): ${basename(file)}`)
              extracted = true
              break
            }
          }
          if (!extracted) {
            emit('extract', 'error', `无法解压: ${basename(file)}`)
          }
        }
      }
    }

    emit('extract', 'done', `完成! ${finalFiles.length} 个文件`, { files: finalFiles })

    return {
      success: finalFiles.length > 0,
      steps,
      finalFiles,
      baiduLink,
      baiduPassword: pwdFromUrl,
      archivePassword,
    }

  } catch (e: any) {
    emit('fatal', 'error', `管道异常: ${e.message}`)
    return { success: false, steps, finalFiles }
  }
}
