/**
 * ADB 模块 — 截图 + OCR + 设备管理
 *
 * 通过 ADB 连接 Android 虚拟设备，执行截图并通过
 * Tesseract.js 进行 OCR 识别。
 */
import { spawn, execSync } from 'child_process'
import { join } from 'path'
import { existsSync } from 'fs'

// ADB 路径：优先 H:\downloads\platform-tools
const ADB_PATH = (() => {
  const candidates = [
    join(process.cwd(), '../../downloads/platform-tools/adb.exe'),
    'H:\\downloads\\platform-tools\\adb.exe',
    'adb',
  ]
  for (const c of candidates) {
    if (existsSync(c) || c === 'adb') return c
  }
  return 'adb'
})()

export interface AdbDevice {
  serial: string
  model: string
  state: string
  resolution: string
}

/** 列出所有连接的设备 */
export function listDevices(): AdbDevice[] {
  try {
    const output = execSync(`"${ADB_PATH}" devices`, { encoding: 'utf-8', timeout: 10000 })
    const lines = output.split('\n').slice(1).filter(l => l.includes('\tdevice'))
    return lines.map(line => {
      const serial = line.split('\t')[0].trim()
      let model = ''
      let resolution = ''
      try {
        model = execSync(`"${ADB_PATH}" -s ${serial} shell getprop ro.product.model`, {
          encoding: 'utf-8', timeout: 5000
        }).trim()
        const wm = execSync(`"${ADB_PATH}" -s ${serial} shell wm size`, {
          encoding: 'utf-8', timeout: 5000
        }).trim()
        resolution = wm.replace('Physical size: ', '').replace('Override size: ', '')
      } catch {}
      return { serial, model, state: 'device', resolution }
    })
  } catch (e: any) {
    console.error('[ADB] listDevices error:', e.message)
    return []
  }
}

/** 对指定设备截图，保存到临时文件，返回 base64 */
export async function screenshot(serial: string): Promise<{ base64: string; path: string } | null> {
  const tmpPath = join(process.env.TEMP || '/tmp', `adb_screenshot_${Date.now()}.png`)
  try {
    // screencap 并 pull
    execSync(`"${ADB_PATH}" -s ${serial} shell screencap -p /sdcard/screencap_tmp.png`, { timeout: 15000 })
    execSync(`"${ADB_PATH}" -s ${serial} pull /sdcard/screencap_tmp.png "${tmpPath}"`, { timeout: 15000 })
    execSync(`"${ADB_PATH}" -s ${serial} shell rm /sdcard/screencap_tmp.png`, { timeout: 5000 })

    const { readFileSync } = require('fs')
    const buf = readFileSync(tmpPath)
    return { base64: buf.toString('base64'), path: tmpPath }
  } catch (e: any) {
    console.error('[ADB] screenshot error:', e.message)
    return null
  }
}

/** 执行 ADB shell 命令 */
export function shell(serial: string, command: string): string {
  try {
    return execSync(`"${ADB_PATH}" -s ${serial} shell ${command}`, {
      encoding: 'utf-8', timeout: 15000
    }).trim()
  } catch (e: any) {
    return ''
  }
}

/** 点击屏幕坐标 */
export function tap(serial: string, x: number, y: number): void {
  shell(serial, `input tap ${x} ${y}`)
}

/** 滑动 */
export function swipe(serial: string, x1: number, y1: number, x2: number, y2: number, duration = 300): void {
  shell(serial, `input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`)
}

/** 输入文本 */
export function inputText(serial: string, text: string): void {
  shell(serial, `input text "${text.replace(/"/g, '\\"')}"`)
}

let _tesseractWorker: any = null

async function getTesseractWorker() {
  if (_tesseractWorker) return _tesseractWorker
  const { createWorker } = await import('tesseract.js')
  _tesseractWorker = await createWorker('chi_sim+eng', 1, {
    logger: (m: any) => {
      if (m.status === 'recognizing text') {
        console.log('[OCR] progress:', Math.round(m.progress * 100) + '%')
      }
    }
  })
  return _tesseractWorker
}

/**
 * OCR 识别 — 使用 Tesseract.js
 * 返回识别出的文本行数组
 */
export async function ocr(imagePath: string): Promise<{ text: string; confidence: number }[]> {
  try {
    const worker = await getTesseractWorker()
    const { data } = await worker.recognize(imagePath)
    return data.lines.map((l: any) => ({
      text: l.text.trim(),
      confidence: l.confidence
    }))
  } catch (e: any) {
    console.error('[OCR] error:', e.message)
    return []
  }
}

/** Tesseract.js 始终可用（npm 依赖） */
export function ensureTesseract(): boolean {
  try {
    require.resolve('tesseract.js')
    return true
  } catch {
    return false
  }
}
