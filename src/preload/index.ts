import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '../shared/types'
import type { TaskType, FileItem, FavoriteFolder, TaskProgress, TaskComplete, TaskError } from '../shared/types'

const electronAPI = {
  // === 文件操作 ===

  /** 获取拖放文件的元数据 */
  getFileInfo: (paths: string[]): Promise<FileItem[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DRAG_START, paths),

  /** 文件放入目标区域 */
  fileDrop: (files: FileItem[], targetType: TaskType | 'folder', targetId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_DROP, { files, targetType, targetId }),

  /** 移动文件到目标文件夹 */
  moveFiles: (sourcePaths: string[], destFolder: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_MOVE, { sourcePaths, destFolder }),

  /** 复制文件到目标文件夹 */
  copyFiles: (sourcePaths: string[], destFolder: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.FILE_COPY, { sourcePaths, destFolder }),

  // === 任务 ===

  /** 执行任务 */
  executeTask: (taskId: string, taskType: TaskType, files: FileItem[], history?: { role: string; text: string }[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_EXECUTE, { taskId, taskType, files, history }),

  /** 监听任务进度 */
  onTaskProgress: (callback: (data: TaskProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TaskProgress) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS, handler)
  },

  /** 监听任务流式输出 */
  onTaskStream: (callback: (data: { taskId: string; type: string; text: string }) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { taskId: string; type: string; text: string }) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TASK_STREAM, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_STREAM, handler)
  },

  /** 监听任务完成 */
  onTaskComplete: (callback: (data: TaskComplete) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TaskComplete) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TASK_COMPLETE, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_COMPLETE, handler)
  },

  /** 监听任务错误 */
  onTaskError: (callback: (data: TaskError) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TaskError) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TASK_ERROR, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_ERROR, handler)
  },

  // === 文件夹 ===

  /** 获取常用文件夹列表 */
  getFolders: (): Promise<FavoriteFolder[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_LIST),

  /** 添加常用文件夹 */
  addFolder: (): Promise<FavoriteFolder | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_ADD),

  /** 删除常用文件夹 */
  removeFolder: (folderId: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_REMOVE, folderId),

  /** 列出目录内容 */
  listDir: (dirPath: string): Promise<FileItem[]> =>
    ipcRenderer.invoke('folder:listDir', dirPath),

  /** 在资源管理器中打开文件夹 */
  openFolder: (folderPath: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.FOLDER_BROWSE, folderPath),

  /** 读取完整应用配置 */
  getConfig: (): Promise<any> =>
    ipcRenderer.invoke('config:get'),

  /** 写入指定配置 section */
  setConfig: (section: string, data: any): Promise<boolean> =>
    ipcRenderer.invoke('config:set', section, data),

  /** 切换活跃 Profile */
  switchProfile: (index: number): Promise<any> =>
    ipcRenderer.invoke('profile:switch', index),

  /** 获取所有 Profile */
  getProfiles: (): Promise<any[]> =>
    ipcRenderer.invoke('profile:list'),

  /** 更新当前 Profile 的单个字段 */
  updateProfileField: (field: string, value: any): Promise<any> =>
    ipcRenderer.invoke('profile:updateField', field, value),

  /** 用默认程序打开文件 */
  openFile: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('file:open', filePath),

  /** 删除文件 */
  deleteFile: (filePath: string): Promise<any> =>
    ipcRenderer.invoke('file:delete', filePath),

  /** 重命名文件 */
  renameFile: (oldPath: string, newName: string): Promise<any> =>
    ipcRenderer.invoke('file:rename', { oldPath, newName }),

  // === 窗口控制 ===

  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close'),

  // === 文件对话框 ===

  openFileDialog: (): Promise<string[] | null> =>
    ipcRenderer.invoke('dialog:openFile'),

  // === 会话持久化 ===

  /** 创建新会话 */
  createSession: (meta?: { title?: string; model?: string; effort?: string; thinking?: boolean }): Promise<any> =>
    ipcRenderer.invoke('session:create', meta || {}),

  /** 列出所有会话 */
  listSessions: (): Promise<any[]> =>
    ipcRenderer.invoke('session:list'),

  /** 获取单个会话 */
  getSession: (sessionId: string): Promise<any> =>
    ipcRenderer.invoke('session:get', sessionId),

  /** 保存会话消息（全量覆盖） */
  saveSessionMessages: (sessionId: string, messages: { role: string; text: string; time: string }[]): Promise<boolean> =>
    ipcRenderer.invoke('session:saveMessage', { sessionId, messages }),

  /** 追加单条消息 */
  appendSessionMessage: (sessionId: string, message: { role: string; text: string; time: string }): Promise<boolean> =>
    ipcRenderer.invoke('session:appendMessage', { sessionId, message }),

  /** 删除会话 */
  deleteSession: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('session:delete', sessionId),

  // === ADB ===

  listAdbDevices: (): Promise<any[]> =>
    ipcRenderer.invoke('adb:listDevices'),

  adbScreenshot: (serial: string): Promise<{ base64: string; path: string } | null> =>
    ipcRenderer.invoke('adb:screenshot', serial),

  adbShell: (serial: string, command: string): Promise<string> =>
    ipcRenderer.invoke('adb:shell', { serial, command }),

  adbTap: (serial: string, x: number, y: number): Promise<boolean> =>
    ipcRenderer.invoke('adb:tap', { serial, x, y }),

  adbSwipe: (serial: string, x1: number, y1: number, x2: number, y2: number, duration?: number): Promise<boolean> =>
    ipcRenderer.invoke('adb:swipe', { serial, x1, y1, x2, y2, duration }),

  adbInputText: (serial: string, text: string): Promise<boolean> =>
    ipcRenderer.invoke('adb:inputText', { serial, text }),

  adbOcr: (imagePath: string): Promise<{ text: string; confidence: number }[]> =>
    ipcRenderer.invoke('adb:ocr', imagePath),

  adbTesseractAvailable: (): Promise<boolean> =>
    ipcRenderer.invoke('adb:tesseractAvailable'),

  // === 网页抓取 ===

  scrapePage: (url: string): Promise<any> =>
    ipcRenderer.invoke('scraper:scrape', url),

  downloadFile: (url: string, filename?: string): Promise<any> =>
    ipcRenderer.invoke('scraper:download', { url, filename }),

  extractArchive: (filePath: string, passwords?: string[]): Promise<any> =>
    ipcRenderer.invoke('scraper:extract', { filePath, passwords }),

  scrapeAndDownload: (url: string): Promise<any> =>
    ipcRenderer.invoke('scraper:scrapeAndDownload', url),

  // === 游戏助手 ===

  gameStatus: (): Promise<any> =>
    ipcRenderer.invoke('game:status'),

  maaTasks: (): Promise<string[]> =>
    ipcRenderer.invoke('game:maaTasks'),

  alasTasks: (): Promise<string[]> =>
    ipcRenderer.invoke('game:alasTasks'),

  startMaaTask: (taskName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:startMaa', taskName),

  startAlasTask: (command: string, configName?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('game:startAlas', { command, configName }),

  stopMaa: (): Promise<boolean> =>
    ipcRenderer.invoke('game:stopMaa'),

  stopAlas: (): Promise<boolean> =>
    ipcRenderer.invoke('game:stopAlas'),

  onMaaLog: (callback: (msg: string) => void) => {
    const handler = (_e: any, msg: string) => callback(msg)
    ipcRenderer.on('game:maaLog', handler)
    return () => ipcRenderer.removeListener('game:maaLog', handler)
  },

  onAlasLog: (callback: (msg: string) => void) => {
    const handler = (_e: any, msg: string) => callback(msg)
    ipcRenderer.on('game:alasLog', handler)
    return () => ipcRenderer.removeListener('game:alasLog', handler)
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
