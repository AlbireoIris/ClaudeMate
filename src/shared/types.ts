// 共享类型定义 - 主进程和渲染进程共用

/** 任务类型 */
export type TaskType = 'file-organize' | 'smart-analyze' | 'batch-decompress'

/** 文件项（拖放数据） */
export interface FileItem {
  id: string
  name: string
  path: string
  type: 'file' | 'folder'
  extension: string
  size: number // bytes
  icon?: string // base64 or path
}

/** 任务状态 */
export type TaskStatus = 'pending' | 'running' | 'completed' | 'error' | 'cancelled'

/** 单个任务 */
export interface Task {
  id: string
  type: TaskType
  files: FileItem[]
  status: TaskStatus
  progress: number // 0-100
  message: string
  createdAt: number
  completedAt?: number
  error?: string
}

/** 常用文件夹 */
export interface FavoriteFolder {
  id: string
  name: string
  path: string
  icon?: string
}

/** 应用主题 */
export type Theme = 'light' | 'dark'

/** IPC 通道名称 */
export const IPC_CHANNELS = {
  // 文件操作
  FILE_DRAG_START: 'file:drag-start',
  FILE_DROP: 'file:drop',
  FILE_MOVE: 'file:move',
  FILE_COPY: 'file:copy',

  // 任务
  TASK_EXECUTE: 'task:execute',
  TASK_PROGRESS: 'task:progress',
  TASK_STREAM: 'task:stream',
  TASK_COMPLETE: 'task:complete',
  TASK_ERROR: 'task:error',

  // 文件夹
  FOLDER_LIST: 'folder:list',
  FOLDER_ADD: 'folder:add',
  FOLDER_REMOVE: 'folder:remove',
  FOLDER_BROWSE: 'folder:browse',

  // 设置（新统一配置通道）
  SETTINGS_GET: 'config:get',
  SETTINGS_SET: 'config:set'
} as const

/** 任务进度数据 */
export interface TaskProgress {
  taskId: string
  progress: number
  message: string
}

/** 任务完成数据 */
export interface TaskComplete {
  taskId: string
  result: string
  outputFiles?: string[]
}

/** 任务错误数据 */
export interface TaskError {
  taskId: string
  error: string
  code?: string
}
