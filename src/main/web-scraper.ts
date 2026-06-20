/**
 * 网页抓取模块 — 自动下载 + 解压
 *
 * 功能：
 *   1. 使用 Chrome cookie 访问目标网页
 *   2. 提取下载链接（href、二维码、网盘链接）
 *   3. 下载文件到 H:\downloads
 *   4. 调用 Bandizip/7z 自动解压（使用存储的密码）
 */
import { execSync, spawn } from 'child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import { homedir } from 'os'

const DOWNLOADS = 'H:\\downloads'
const BANDIZIP = 'C:\\Program Files\\Bandizip\\Bandizip.exe'

// ═══ HTTP 客户端 (使用 Node.js 内置) ═══

interface FetchResult {
  status: number
  body: string
  headers: Record<string, string>
  finalUrl: string
}

async function fetchWithCookies(
  url: string,
  cookieSource: 'chrome' | 'custom' = 'chrome',
  customCookies?: string,
): Promise<FetchResult> {
  const { get: httpGet, request: httpReq } = await import('https')

  // 读取 Chrome cookie 数据库（简化版：通过环境变量或文件）
  let cookieHeader = customCookies || ''

  if (cookieSource === 'chrome' && !cookieHeader) {
    try {
      // 尝试读取导出的 Chrome cookies
      const cookieFile = join(homedir(), '.claude', 'chrome-cookies.txt')
      if (existsSync(cookieFile)) {
        cookieHeader = readFileSync(cookieFile, 'utf-8').trim()
      }
    } catch {}
  }

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const options = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',
        Accept: 'text/html,application/xhtml+xml',
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      timeout: 30000,
    }

    const req = httpReq(options, (res) => {
      // 处理重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href
        fetchWithCookies(redirectUrl, 'custom', cookieHeader).then(resolve).catch(reject)
        return
      }

      let body = ''
      res.on('data', (c: Buffer) => (body += c.toString()))
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          body,
          headers: res.headers as Record<string, string>,
          finalUrl: url,
        })
      })
      res.on('error', reject)
    })

    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    req.end()
  })
}

// ═══ 链接提取 ═══

interface DownloadLink {
  url: string
  text: string
  type: 'direct' | 'pan' | 'magnet' | 'qr'
}

/** 从 HTML 中提取下载链接 */
export function extractLinks(html: string, baseUrl: string): DownloadLink[] {
  const links: DownloadLink[] = []

  // 直接下载链接 <a href="...">
  const hrefRegex = /<a[^>]*href=["']([^"']*\.(?:zip|rar|7z|tar|gz|exe|apk|mp4|mkv|torrent))["'][^>]*>(.*?)<\/a>/gi
  let match
  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1]
    links.push({
      url: href.startsWith('http') ? href : new URL(href, baseUrl).href,
      text: match[2].replace(/<[^>]*>/g, '').trim(),
      type: 'direct',
    })
  }

  // 网盘链接 (百度网盘/阿里云盘/115等)
  const panRegex = /https?:\/\/(?:pan\.baidu\.com|www\.aliyundrive\.com|115\.com|cloud\.189\.cn)\/[^\s"'<>]+/gi
  while ((match = panRegex.exec(html)) !== null) {
    links.push({ url: match[0], text: '网盘链接', type: 'pan' })
  }

  // 磁力链接
  const magnetRegex = /magnet:\?xt=urn:btih:[^\s"'<>]+/gi
  while ((match = magnetRegex.exec(html)) !== null) {
    links.push({ url: match[0], text: '磁力链接', type: 'magnet' })
  }

  // 二维码图片 (可能包含下载信息)
  const qrRegex = /<img[^>]*src=["']([^"']*(?:qr|qrcode|二维码)[^"']*)["'][^>]*>/gi
  while ((match = qrRegex.exec(html)) !== null) {
    links.push({
      url: match[1].startsWith('http') ? match[1] : new URL(match[1], baseUrl).href,
      text: '二维码',
      type: 'qr',
    })
  }

  return links
}

// ═══ 文件下载 ═══

interface DownloadResult {
  success: boolean
  url: string
  filePath?: string
  error?: string
}

export async function downloadFile(
  url: string,
  filename?: string,
  onProgress?: (percent: number) => void,
): Promise<DownloadResult> {
  const name = filename || basename(new URL(url).pathname) || `download_${Date.now()}`
  const destDir = join(DOWNLOADS, 'scraped')
  const destPath = join(destDir, name)

  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  try {
    const protocol = url.startsWith('https') ? await import('https') : await import('http')

    return new Promise((resolve) => {
      const file = require('fs').createWriteStream(destPath)
      let totalSize = 0
      let downloaded = 0

      const req = protocol.get(url, { timeout: 300000 }, (res: any) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400) {
          const redirect = res.headers.location
          if (redirect) {
            file.close()
            downloadFile(redirect, filename, onProgress).then(resolve)
            return
          }
        }

        totalSize = parseInt(res.headers['content-length'] || '0', 10)
        res.pipe(file)

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (totalSize > 0 && onProgress) {
            onProgress(Math.round((downloaded / totalSize) * 100))
          }
        })
      })

      req.on('error', (err: Error) => {
        file.close()
        resolve({ success: false, url, error: err.message })
      })

      file.on('finish', () => {
        file.close()
        resolve({ success: true, url, filePath: destPath })
      })
    })
  } catch (e: any) {
    return { success: false, url, error: e.message }
  }
}

// ═══ 解压 ═══

interface ExtractResult {
  success: boolean
  outputDir?: string
  error?: string
  usedPassword?: string
}

/** Bandizip 存储的密码路径 */
const BANDIZIP_PASSWORDS = [
  join(process.env.APPDATA || '', 'Bandizip', 'password.ini'),
  join(homedir(), 'AppData', 'Roaming', 'Bandizip', 'password.ini'),
]

/** 读取 Bandizip 存储的密码列表 */
function readBandizipPasswords(): string[] {
  for (const p of BANDIZIP_PASSWORDS) {
    try {
      if (existsSync(p)) {
        const content = readFileSync(p, 'utf-8')
        // Bandizip 密码文件格式：可能是 ini 或纯文本
        return content.split('\n')
          .filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('['))
          .map(l => l.split('=').pop()?.trim() || '')
          .filter(Boolean)
      }
    } catch {}
  }
  return []
}

/** 解压文件，尝试 Bandizip 密码列表 */
export async function extractArchive(
  filePath: string,
  passwords?: string[],
): Promise<ExtractResult> {
  const dir = join(DOWNLOADS, 'extracted', basename(filePath).replace(/\.[^.]+$/, ''))
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const allPasswords = [...(passwords || []), ...readBandizipPasswords()]

  // 优先尝试 Bandizip
  if (existsSync(BANDIZIP)) {
    for (const pw of allPasswords) {
      try {
        const cmd = `"${BANDIZIP}" x -o:"${dir}" -p:"${pw}" "${filePath}"`
        execSync(cmd, { timeout: 120000 })
        return { success: true, outputDir: dir, usedPassword: pw }
      } catch {}
    }

    // 无密码尝试
    try {
      execSync(`"${BANDIZIP}" x -o:"${dir}" "${filePath}"`, { timeout: 120000 })
      return { success: true, outputDir: dir }
    } catch {}
  }

  // Fallback: 使用 7z（如果可用）或 PowerShell Expand-Archive
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${filePath}' -DestinationPath '${dir}' -Force"`, { timeout: 120000 })
    return { success: true, outputDir: dir }
  } catch {
    return { success: false, error: '无法解压：Bandizip 不可用，且无匹配密码' }
  }
}

// ═══ 主入口 ═══

export interface ScrapeResult {
  url: string
  links: DownloadLink[]
  html: string
}

export async function scrapePage(url: string): Promise<ScrapeResult> {
  const result = await fetchWithCookies(url)
  if (result.status !== 200) {
    throw new Error(`HTTP ${result.status}`)
  }
  return {
    url: result.finalUrl,
    links: extractLinks(result.body, url),
    html: result.body,
  }
}

/** 整流程：抓取 → 提取 → 下载 → 解压 */
export async function scrapeAndDownload(
  url: string,
  onStep?: (step: string) => void,
): Promise<{ links: DownloadLink[]; downloads: DownloadResult[]; extracts: ExtractResult[] }> {
  onStep?.('正在抓取网页...')
  const { links } = await scrapePage(url)

  onStep?.(`找到 ${links.length} 个链接`)

  const downloads: DownloadResult[] = []
  const extracts: ExtractResult[] = []

  for (const link of links.filter(l => l.type === 'direct')) {
    onStep?.(`正在下载: ${link.text}`)
    const result = await downloadFile(link.url)
    downloads.push(result)

    if (result.success && result.filePath) {
      onStep?.(`正在解压: ${basename(result.filePath)}`)
      const extract = await extractArchive(result.filePath)
      extracts.push(extract)
    }
  }

  return { links, downloads, extracts }
}
