import { promises as fs } from 'fs'
import { createReadStream, createWriteStream, existsSync, mkdirSync } from 'fs'
import { join, basename, extname, dirname } from 'path'
import { createGzip, createGunzip } from 'zlib'
import { pipeline } from 'stream/promises'
import type { FileItem } from '../shared/types'

/**
 * 获取文件/文件夹的元信息（轻量，仅读取 stat，不读内容）
 */
export async function getFileInfo(filePath: string): Promise<FileItem | null> {
  try {
    const stat = await fs.stat(filePath)
    const name = basename(filePath)
    const ext = extname(name).toLowerCase()
    const isDir = stat.isDirectory()

    return {
      id: Buffer.from(filePath).toString('base64'),
      name,
      path: filePath,
      type: isDir ? 'folder' : 'file',
      extension: ext,
      size: stat.size
    }
  } catch {
    return null
  }
}

/**
 * 列出目录中的文件和子目录
 */
export async function listDirectory(dirPath: string): Promise<FileItem[]> {
  const entries = await fs.readdir(dirPath, { withFileTypes: true })
  const items: FileItem[] = []

  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const info = await getFileInfo(fullPath)
    if (info) items.push(info)
  }

  return items
}

/**
 * 移动文件到目标文件夹
 */
export async function moveFile(sourcePath: string, destFolder: string): Promise<void> {
  const name = basename(sourcePath)
  const destPath = join(destFolder, name)

  // 如果目标已存在，添加序号
  let finalDest = destPath
  let counter = 1
  const ext = extname(name)
  const baseName = basename(name, ext)
  while (await fileExists(finalDest)) {
    finalDest = join(destFolder, `${baseName} (${counter})${ext}`)
    counter++
  }

  await fs.rename(sourcePath, finalDest)
}

/**
 * 复制文件到目标文件夹
 */
export async function copyFile(sourcePath: string, destFolder: string): Promise<void> {
  const name = basename(sourcePath)
  const destPath = join(destFolder, name)

  let finalDest = destPath
  let counter = 1
  const ext = extname(name)
  const baseName = basename(name, ext)
  while (await fileExists(finalDest)) {
    finalDest = join(destFolder, `${baseName} (${counter})${ext}`)
    counter++
  }

  await fs.copyFile(sourcePath, finalDest)
}

/**
 * 检查文件是否存在
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * 获取文件的文本内容
 */
export async function readTextFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, 'utf-8')
}

/**
 * 压缩单个文件（gzip）
 */
export async function compressFile(filePath: string): Promise<string> {
  const name = basename(filePath)
  const outputDir = join(dirname(filePath), 'compressed')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = join(outputDir, `${name}.gz`)
  const source = createReadStream(filePath)
  const dest = createWriteStream(outputPath)
  const gzip = createGzip()

  await pipeline(source, gzip, dest)
  return outputPath
}

/**
 * 整理文件到分类文件夹
 */
export async function organizeFile(filePath: string): Promise<string> {
  const name = basename(filePath)
  const ext = extname(name).toLowerCase()

  const categoryMap: Record<string, string> = {
    '.jpg': '图片', '.jpeg': '图片', '.png': '图片', '.gif': '图片', '.webp': '图片', '.svg': '图片', '.bmp': '图片',
    '.mp4': '视频', '.avi': '视频', '.mkv': '视频', '.mov': '视频', '.wmv': '视频',
    '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频', '.ogg': '音频',
    '.pdf': '文档', '.doc': '文档', '.docx': '文档', '.xls': '文档', '.xlsx': '文档',
    '.ppt': '文档', '.pptx': '文档', '.txt': '文档', '.md': '文档',
    '.zip': '压缩包', '.rar': '压缩包', '.7z': '压缩包', '.tar': '压缩包', '.gz': '压缩包',
    '.js': '代码', '.ts': '代码', '.py': '代码', '.java': '代码', '.c': '代码', '.cpp': '代码',
    '.html': '代码', '.css': '代码', '.json': '代码', '.xml': '代码',
    '.csv': '数据', '.sql': '数据', '.db': '数据'
  }

  const category = categoryMap[ext] || '其他'
  const outputDir = join(dirname(filePath), category)
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const destPath = join(outputDir, name)
  await fs.rename(filePath, destPath)
  return destPath
}

/**
 * 分析文件基本信息
 */
export async function analyzeFile(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath)
  const name = basename(filePath)
  const ext = extname(name).toLowerCase()
  const size = formatFileSize(stat.size)

  const lines: string[] = [
    `📄 文件: ${name}`,
    `📏 大小: ${size}`,
    `📅 修改: ${stat.mtime.toLocaleString('zh-CN')}`,
    `📁 类型: ${ext || '未知'}`
  ]

  // 如果是文本文件，读取前几行
  const textExts = ['.txt', '.md', '.json', '.csv', '.log', '.xml', '.html', '.css', '.js', '.ts', '.py']
  if (textExts.includes(ext)) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const lineCount = content.split('\n').length
      lines.push(`📝 行数: ${lineCount}`)
      lines.push('')
      lines.push('--- 预览（前5行）---')
      lines.push(content.split('\n').slice(0, 5).join('\n'))
    } catch {
      lines.push('⚠️ 无法读取文本内容')
    }
  }

  return lines.join('\n')
}

/**
 * 解压 gzip 文件
 */
export async function decompressFile(filePath: string): Promise<string> {
  const name = basename(filePath)
  // 移除 .gz 后缀
  const outName = name.endsWith('.gz') ? name.slice(0, -3) : `${name}.decompressed`
  const outputDir = join(dirname(filePath), 'decompressed')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  const outputPath = join(outputDir, outName)
  const source = createReadStream(filePath)
  const dest = createWriteStream(outputPath)
  const gunzip = createGunzip()

  await pipeline(source, gunzip, dest)
  return outputPath
}

/**
 * 获取文件大小的人类可读格式
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`
}
