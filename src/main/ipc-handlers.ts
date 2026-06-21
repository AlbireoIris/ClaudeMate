import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync, renameSync, statSync } from 'fs'
import { join as pathJoin, dirname as pathDirname } from 'path'
import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { moveFile, copyFile, getFileInfo, listDirectory } from './file-system'
import { executeClaudeTask, resetOpenCodeServer } from './claude-cli-serve'
import { getStoredFolders, addStoredFolder, removeStoredFolder, loadConfig, updateConfig, switchProfile, getProfiles, getActiveProfile, updateActiveProfileField, getDenyRules, addDenyRule, removeDenyRule, updateDenyRule } from './config-store'
import { getMainWindow } from './index'
import * as SessionStore from './session-store'
import * as Adb from './adb'
import * as WebScraper from './web-scraper'
import * as GameAssistant from './game-assistant'
import * as DownloadPipeline from './download-pipeline'
import type { TaskType, FileItem } from '../shared/types'

export function registerIpcHandlers(): void {
  // === 文件操作 ===

  ipcMain.handle(IPC_CHANNELS.FILE_DRAG_START, async (_event, filePaths: string[]) => {
    const files: FileItem[] = []
    for (const filePath of filePaths) {
      try {
        const info = await getFileInfo(filePath)
        if (info) files.push(info)
      } catch { /* skip */ }
    }
    return files
  })

  ipcMain.handle(IPC_CHANNELS.FILE_DROP, async (_event, payload: {
    files: FileItem[]
    targetType: TaskType | 'folder'
    targetId?: string
  }) => {
    return { success: true, received: payload.files.length }
  })

  ipcMain.handle(IPC_CHANNELS.FILE_MOVE, async (_event, payload: {
    sourcePaths: string[]
    destFolder: string
  }) => {
    const results: { path: string; success: boolean; error?: string }[] = []
    for (const src of payload.sourcePaths) {
      try {
        await moveFile(src, payload.destFolder)
        results.push({ path: src, success: true })
      } catch (e) {
        results.push({ path: src, success: false, error: String(e) })
      }
    }
    return results
  })

  ipcMain.handle(IPC_CHANNELS.FILE_COPY, async (_event, payload: {
    sourcePaths: string[]
    destFolder: string
  }) => {
    const results: { path: string; success: boolean; error?: string }[] = []
    for (const src of payload.sourcePaths) {
      try {
        await copyFile(src, payload.destFolder)
        results.push({ path: src, success: true })
      } catch (e) {
        results.push({ path: src, success: false, error: String(e) })
      }
    }
    return results
  })

  // === 任务执行 ===

  ipcMain.handle(IPC_CHANNELS.TASK_EXECUTE, async (event, payload: {
    taskId: string
    taskType: TaskType
    files: FileItem[]
    history?: { role: string; text: string }[]
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
    try {
      const result = await executeClaudeTask(
        payload.taskId,
        payload.taskType,
        payload.files,
        payload.history || [],
        (progress, message) => {
          win?.webContents.send(IPC_CHANNELS.TASK_PROGRESS, {
            taskId: payload.taskId,
            progress,
            message
          })
        },
        (chunk) => {
          win?.webContents.send(IPC_CHANNELS.TASK_STREAM, {
            taskId: payload.taskId,
            type: chunk.type,
            text: chunk.text
          })
        }
      )

      win?.webContents.send(IPC_CHANNELS.TASK_COMPLETE, {
        taskId: payload.taskId,
        result: result  // ← 修复：传回实际的 AI 回复
      })

      return { success: true, result }
    } catch (e) {
      const errorMsg = String(e)
      win?.webContents.send(IPC_CHANNELS.TASK_ERROR, {
        taskId: payload.taskId,
        error: errorMsg
      })
      return { success: false, error: errorMsg }
    }
  })

  // === 文件夹管理 ===

  ipcMain.handle(IPC_CHANNELS.FOLDER_LIST, async () => {
    return getStoredFolders()
  })

  ipcMain.handle(IPC_CHANNELS.FOLDER_ADD, async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const folderPath = result.filePaths[0]
    const name = folderPath.split(/[/\\]/).pop() || folderPath
    return addStoredFolder(name, folderPath)
  })

  ipcMain.handle(IPC_CHANNELS.FOLDER_REMOVE, async (_event, folderId: string) => {
    return removeStoredFolder(folderId)
  })

  // 列出目录内容
  ipcMain.handle('folder:listDir', async (_event, dirPath: string) => {
    return listDirectory(dirPath)
  })

  ipcMain.handle(IPC_CHANNELS.FOLDER_BROWSE, async (_event, folderPath: string) => {
    await shell.openPath(folderPath)
    return true
  })

  // === 统一配置 ===

  ipcMain.handle('config:get', async () => {
    return loadConfig()
  })

  ipcMain.handle('config:set', async (_event, section: string, data: any) => {
    updateConfig(section as any, data)
    return true
  })

  // === Profile ===

  ipcMain.handle('profile:switch', async (_event, index: number) => {
    switchProfile(index)
    return getActiveProfile()
  })

  ipcMain.handle('profile:list', async () => {
    return getProfiles()
  })

  ipcMain.handle('profile:updateField', async (_event, field: string, value: any) => {
    updateActiveProfileField(field as any, value)
    return getActiveProfile()
  })

  // === 禁入规则 ===

  ipcMain.handle('config:getDenyRules', async () => {
    return getDenyRules()
  })

  ipcMain.handle('config:addDenyRule', async (_event, path: string, denyRead: boolean, denyWrite: boolean) => {
    const result = addDenyRule(path, denyRead, denyWrite)
    // 规则变更后重启 opencode server 使 opencode.json 生效
    try { resetOpenCodeServer() } catch {}
    return result
  })

  ipcMain.handle('config:removeDenyRule', async (_event, id: string) => {
    const result = removeDenyRule(id)
    try { resetOpenCodeServer() } catch {}
    return result
  })

  ipcMain.handle('config:updateDenyRule', async (_event, id: string, patch: any) => {
    const result = updateDenyRule(id, patch)
    try { resetOpenCodeServer() } catch {}
    return result
  })

  // 保存思考范式
  ipcMain.handle('paradigm:save', async (_event, data: any) => {
    try {
      const { writeFileSync: wf, existsSync: fe2, mkdirSync: md2 } = require('fs')
      const { join: jn2 } = require('path')
      const configDir = jn2(__dirname, '../../config')
      if (!fe2(configDir)) md2(configDir, { recursive: true })
      wf(jn2(configDir, 'paradigm.json'), JSON.stringify(data, null, 2), 'utf-8')
      return true
    } catch { return false }
  })

  // 选择文件夹对话框（仅返回路径，不加入收藏）
  ipcMain.handle('dialog:openFolder', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // 用默认程序打开文件
  ipcMain.handle('file:open', async (_event, filePath: string) => {
    await shell.openPath(filePath)
    return true
  })

  // 删除文件
  ipcMain.handle('file:delete', async (_event, filePath: string) => {
    try {
      const stat = statSync(filePath)
      if (stat.isDirectory()) rmdirSync(filePath)
      else unlinkSync(filePath)
      return true
    } catch (e: any) { return { error: e.message } }
  })

  // 重命名文件
  ipcMain.handle('file:rename', async (_event, payload: { oldPath: string; newName: string }) => {
    const newPath = pathJoin(pathDirname(payload.oldPath), payload.newName)
    try {
      renameSync(payload.oldPath, newPath)
      return { success: true, newPath }
    } catch (e: any) { return { error: e.message } }
  })

  // === 窗口控制 ===

  ipcMain.handle('window:minimize', () => {
    getMainWindow()?.minimize()
    return true
  })

  ipcMain.handle('window:maximize', () => {
    const win = getMainWindow()
    if (win?.isMaximized()) win.unmaximize()
    else win?.maximize()
    return true
  })

  ipcMain.handle('window:close', () => {
    const win = getMainWindow()
    if (win?.isDestroyed()) {
      app.quit()
    } else {
      win?.close()
    }
    return true
  })

  // === 文件选择对话框 ===

  ipcMain.handle('dialog:openFile', async () => {
    console.log('[IPC] dialog:openFile called')
    const win = getMainWindow()
    if (!win) { console.log('[IPC] no window'); return null }
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: '所有文件', extensions: ['*'] }]
    })
    console.log('[IPC] dialog result:', result.canceled ? 'cancelled' : result.filePaths.length + ' files')
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths
  })

  // === 会话持久化 ===

  ipcMain.handle('session:create', async (_event, meta: {
    title?: string; model?: string; effort?: string; thinking?: boolean
  }) => {
    return SessionStore.createSession(meta)
  })

  ipcMain.handle('session:list', async () => {
    return SessionStore.listSessions()
  })

  ipcMain.handle('session:get', async (_event, sessionId: string) => {
    return SessionStore.getSession(sessionId)
  })

  ipcMain.handle('session:saveMessage', async (_event, payload: {
    sessionId: string; messages: { role: string; text: string; time: string }[]
  }) => {
    SessionStore.saveMessage(payload.sessionId, payload.messages)
    return true
  })

  ipcMain.handle('session:appendMessage', async (_event, payload: {
    sessionId: string; message: { role: string; text: string; time: string }
  }) => {
    SessionStore.appendMessage(payload.sessionId, payload.message)
    return true
  })

  ipcMain.handle('session:delete', async (_event, sessionId: string) => {
    return SessionStore.deleteSession(sessionId)
  })

  // === ADB 设备管理 ===

  ipcMain.handle('adb:listDevices', async () => {
    return Adb.listDevices()
  })

  ipcMain.handle('adb:screenshot', async (_event, serial: string) => {
    return Adb.screenshot(serial)
  })

  ipcMain.handle('adb:shell', async (_event, payload: { serial: string; command: string }) => {
    return Adb.shell(payload.serial, payload.command)
  })

  ipcMain.handle('adb:tap', async (_event, payload: { serial: string; x: number; y: number }) => {
    Adb.tap(payload.serial, payload.x, payload.y)
    return true
  })

  ipcMain.handle('adb:swipe', async (_event, payload: {
    serial: string; x1: number; y1: number; x2: number; y2: number; duration?: number
  }) => {
    Adb.swipe(payload.serial, payload.x1, payload.y1, payload.x2, payload.y2, payload.duration)
    return true
  })

  ipcMain.handle('adb:inputText', async (_event, payload: { serial: string; text: string }) => {
    Adb.inputText(payload.serial, payload.text)
    return true
  })

  ipcMain.handle('adb:ocr', async (_event, imagePath: string) => {
    return Adb.ocr(imagePath)
  })

  ipcMain.handle('adb:tesseractAvailable', async () => {
    return Adb.ensureTesseract()
  })

  // === 网页抓取 ===

  ipcMain.handle('scraper:scrape', async (_event, url: string) => {
    return WebScraper.scrapePage(url)
  })

  ipcMain.handle('scraper:download', async (_event, payload: { url: string; filename?: string }) => {
    return WebScraper.downloadFile(payload.url, payload.filename)
  })

  ipcMain.handle('scraper:extract', async (_event, payload: { filePath: string; passwords?: string[] }) => {
    return WebScraper.extractArchive(payload.filePath, payload.passwords)
  })

  ipcMain.handle('scraper:scrapeAndDownload', async (_event, url: string) => {
    return WebScraper.scrapeAndDownload(url)
  })

  // === 游戏助手 ===

  ipcMain.handle('game:status', async () => {
    return GameAssistant.getStatus()
  })

  ipcMain.handle('game:maaTasks', async () => {
    return GameAssistant.getArknightsTasks()
  })

  ipcMain.handle('game:alasTasks', async () => {
    return GameAssistant.getAzurLaneTasks()
  })

  ipcMain.handle('game:startMaa', async (_event, taskName: string) => {
    return GameAssistant.startMaaTask(taskName, (msg) => {
      getMainWindow()?.webContents.send('game:maaLog', msg)
    })
  })

  ipcMain.handle('game:startAlas', async (_event, payload: { command: string; configName?: string }) => {
    return GameAssistant.startAlasTask(payload.command, payload.configName, (msg) => {
      getMainWindow()?.webContents.send('game:alasLog', msg)
    })
  })

  ipcMain.handle('game:stopMaa', async () => {
    GameAssistant.stopMaa()
    return true
  })

  ipcMain.handle('game:stopAlas', async () => {
    GameAssistant.stopAlas()
    return true
  })

  // === 下载管道 ===

  ipcMain.handle('pipeline:run', async (event, pageUrl: string) => {
    const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
    return DownloadPipeline.runDownloadPipeline(pageUrl, (step) => {
      win?.webContents.send('pipeline:step', step)
    })
  })
}
