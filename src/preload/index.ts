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
  executeTask: (taskId: string, taskType: TaskType, files: FileItem[]) =>
    ipcRenderer.invoke(IPC_CHANNELS.TASK_EXECUTE, { taskId, taskType, files }),

  /** 监听任务进度 */
  onTaskProgress: (callback: (data: TaskProgress) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: TaskProgress) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.TASK_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TASK_PROGRESS, handler)
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

  /** 读取 Claude 配置 */
  getClaudeConfig: (): Promise<any> =>
    ipcRenderer.invoke('settings:getClaudeConfig'),

  /** 写入 app 配置覆写 */
  setAppConfig: (overrides: any): Promise<boolean> =>
    ipcRenderer.invoke('settings:setAppConfig', overrides),

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
    ipcRenderer.invoke('dialog:openFile')
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)

export type ElectronAPI = typeof electronAPI
