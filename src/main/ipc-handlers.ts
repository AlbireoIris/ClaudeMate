import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmdirSync, renameSync, statSync } from 'fs'
import { homedir } from 'os'
import { join as pathJoin, dirname as pathDirname } from 'path'
import { app, ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import { moveFile, copyFile, getFileInfo, listDirectory } from './file-system'
import { executeClaudeTask } from './claude-cli'
import { getStoredFolders, addStoredFolder, removeStoredFolder } from './settings'
import { getMainWindow } from './index'
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
  }) => {
    const win = BrowserWindow.fromWebContents(event.sender) || getMainWindow()
    try {
      const result = await executeClaudeTask(
        payload.taskId,
        payload.taskType,
        payload.files,
        (progress, message) => {
          win?.webContents.send(IPC_CHANNELS.TASK_PROGRESS, {
            taskId: payload.taskId,
            progress,
            message
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

  // 读取 Claude 设置
  ipcMain.handle('settings:getClaudeConfig', async () => {
    try {
      const raw = readFileSync(pathJoin(homedir(), '.claude', 'settings.json'), 'utf-8')
      const s = JSON.parse(raw)
      // 也读取 app 自己的覆写配置
      let overrides: any = {}
      try { overrides = JSON.parse(readFileSync(pathJoin(homedir(), '.claude', 'cc-assistant.json'), 'utf-8')) } catch {}
      return {
        model: overrides.model || s.env?.ANTHROPIC_MODEL || 'deepseek-v4-pro[1m]',
        effort: overrides.effort || s.effortLevel || 'medium',
        thinking: overrides.thinking ?? true,
        baseURL: s.env?.ANTHROPIC_BASE_URL || '',
        availableModels: ['deepseek-v4-pro[1m]', 'deepseek-v4-flash'],
        thinkingMandatoryModels: [],
        availableEfforts: ['low', 'medium', 'high', 'xhigh', 'max']
      }
    } catch { return null }
  })

  // 写入 app 配置覆写
  ipcMain.handle('settings:setAppConfig', async (_event, overrides: any) => {
    try {
      const configDir = pathJoin(homedir(), '.claude')
      if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
      writeFileSync(pathJoin(configDir, 'cc-assistant.json'), JSON.stringify(overrides, null, 2), 'utf-8')
      return true
    } catch { return false }
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
}
