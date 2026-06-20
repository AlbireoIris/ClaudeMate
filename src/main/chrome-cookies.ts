/**
 * Chrome Cookie 提取器
 *
 * 读取 Chrome 加密的 cookie 数据库，使用 Windows DPAPI 解密。
 * 用于网页抓取时注入认证 cookie 绕过 Cloudflare 等防护。
 */
import { execSync } from 'child_process'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CHROME_DIR = join(
  process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
  'Google', 'Chrome', 'User Data'
)

/** 从 Chrome Local State 获取加密密钥（base64 → DPAPI解密 → 原始AES密钥） */
function getDecryptionKey(): Buffer | null {
  try {
    const localStatePath = join(CHROME_DIR, 'Local State')
    if (!existsSync(localStatePath)) return null

    const localState = JSON.parse(readFileSync(localStatePath, 'utf-8'))
    const encryptedKeyB64 = localState?.os_crypt?.encrypted_key
    if (!encryptedKeyB64) return null

    // 去掉 'DPAPI' 前缀 (5 bytes)，然后 base64 解码
    const encryptedKey = Buffer.from(encryptedKeyB64, 'base64').slice(5)

    // 使用 PowerShell 调用 Windows DPAPI 解密
    const psScript = `
      Add-Type -AssemblyName System.Security
      $enc = [Convert]::FromBase64String('${encryptedKey.toString('base64')}')
      $dec = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, 'CurrentUser')
      [Convert]::ToBase64String($dec)
    `
    const result = execSync(
      `powershell -NoProfile -Command "${psScript.replace(/"/g, '\\"')}"`,
      { encoding: 'utf-8', timeout: 10000, windowsHide: true }
    )
    return Buffer.from(result.trim(), 'base64')
  } catch (e: any) {
    console.error('[ChromeCookies] key extraction failed:', e.message)
    return null
  }
}

/** 使用 AES-256-GCM 解密单个 cookie 值 */
function decryptCookie(encryptedValue: Buffer, key: Buffer): string | null {
  try {
    // Chrome 加密格式: 'v10' (3 bytes) + nonce (12 bytes) + ciphertext + tag (16 bytes)
    if (encryptedValue.length < 3 + 12 + 16) return null

    const nonce = encryptedValue.slice(3, 15)
    const ciphertextWithTag = encryptedValue.slice(15)

    const crypto = require('crypto')
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce)
    decipher.setAuthTag(ciphertextWithTag.slice(-16))
    const decrypted = Buffer.concat([
      decipher.update(ciphertextWithTag.slice(0, -16)),
      decipher.final(),
    ])
    return decrypted.toString('utf-8')
  } catch {
    return null
  }
}

/** 读取 Chrome cookies 并返回 key=value 字符串 */
export async function getChromeCookies(domain?: string): Promise<string> {
  try {
    const key = getDecryptionKey()
    if (!key) return ''

    const cookiesPath = join(CHROME_DIR, 'Default', 'Network', 'Cookies')
    if (!existsSync(cookiesPath)) return ''

    // 复制数据库（Chrome 可能正在使用）
    const tmpPath = join(process.env.TEMP || '/tmp', `chrome_cookies_${Date.now()}.db`)
    try { require('fs').copyFileSync(cookiesPath, tmpPath) } catch { return '' }

    // 使用 sql.js 读取
    let initSqlJs: any
    try {
      initSqlJs = require('sql.js')
    } catch {
      console.error('[ChromeCookies] sql.js not available')
      return ''
    }

    const SQL = await initSqlJs()
    const fileBuffer = readFileSync(tmpPath)
    const db = new SQL.Database(fileBuffer)

    // 查询目标域名的 cookies
    const query = domain
      ? `SELECT name, encrypted_value FROM cookies WHERE host_key LIKE '%${domain}%'`
      : `SELECT name, encrypted_value, host_key FROM cookies WHERE host_key LIKE '%hxcy%' OR host_key LIKE '%baidu%' OR host_key LIKE '%cloud%'`

    const results = db.exec(query)
    db.close()

    // 清理临时文件
    try { require('fs').unlinkSync(tmpPath) } catch {}

    if (!results.length) return ''

    const cookies: string[] = []
    for (const row of results[0].values) {
      const name = row[0] as string
      const encVal = row[1] as Uint8Array
      const decrypted = decryptCookie(Buffer.from(encVal), key)
      if (decrypted) {
        cookies.push(`${name}=${decrypted}`)
      }
    }

    return cookies.join('; ')
  } catch (e: any) {
    console.error('[ChromeCookies] error:', e.message)
    return ''
  }
}
