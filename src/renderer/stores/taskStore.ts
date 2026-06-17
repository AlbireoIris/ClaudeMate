import { create } from 'zustand'
import type { Task, TaskType, FileItem, TaskStatus } from '../../shared/types'

interface TaskState {
  tasks: Task[]
  activeTaskId: string | null
  progress: number
  statusMessage: string
  isProcessing: boolean

  /** 添加任务到队列 */
  addTask: (type: TaskType, files: FileItem[]) => string
  /** 更新任务状态 */
  updateTask: (taskId: string, update: Partial<Task>) => void
  /** 执行下一个待处理任务 */
  executeTask: (taskId: string) => Promise<void>
  /** 清除已完成/错误的任务 */
  clearCompleted: () => void
  /** 设置状态栏消息 */
  setStatusMessage: (msg: string) => void
  /** 设置全局进度 */
  setProgress: (p: number) => void
}

let taskCounter = 0

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  activeTaskId: null,
  progress: 0,
  statusMessage: '就绪',
  isProcessing: false,

  addTask: (type, files) => {
    const id = `task-${Date.now()}-${++taskCounter}`
    const task: Task = {
      id,
      type,
      files,
      status: 'pending',
      progress: 0,
      message: `等待处理 ${files.length} 个文件...`,
      createdAt: Date.now()
    }
    set(state => ({
      tasks: [...state.tasks, task],
      statusMessage: `已添加 ${files.length} 个文件到队列`
    }))
    return id
  },

  updateTask: (taskId, update) => {
    set(state => ({
      tasks: state.tasks.map(t => t.id === taskId ? { ...t, ...update } : t)
    }))
  },

  executeTask: async (taskId) => {
    const task = get().tasks.find(t => t.id === taskId)
    if (!task || task.status !== 'pending') return

    set({ activeTaskId: taskId, isProcessing: true })
    get().updateTask(taskId, { status: 'running', progress: 0, message: '开始执行...' })

    try {
      // 通过 IPC 调用主进程执行任务
      const result = await window.electronAPI.executeTask(taskId, task.type, task.files)

      if (result.success) {
        // 不在此处更新 message — IPC 的 onTaskComplete 会传回真实的 AI 回复
        get().updateTask(taskId, {
          status: 'completed',
          progress: 100,
          message: result.result || '完成',
          completedAt: Date.now()
        })
        set({ statusMessage: '完成' })
      } else {
        throw new Error(result.error || '未知错误')
      }
    } catch (e) {
      get().updateTask(taskId, {
        status: 'error',
        progress: 0,
        message: String(e),
        error: String(e)
      })
      set({ statusMessage: `任务失败: ${String(e)}` })
    } finally {
      set({ activeTaskId: null, isProcessing: false, progress: 0 })
      // 3 秒后恢复就绪状态
      setTimeout(() => {
        if (get().statusMessage !== '就绪' && !get().isProcessing) {
          set({ statusMessage: '就绪' })
        }
      }, 3000)
    }
  },

  clearCompleted: () => {
    set(state => ({
      tasks: state.tasks.filter(t => t.status === 'pending' || t.status === 'running')
    }))
  },

  setStatusMessage: (msg) => set({ statusMessage: msg }),
  setProgress: (p) => set({ progress: p })
}))

// 监听主进程推送的任务进度和完成事件
export function setupTaskListeners(): () => void {
  const unsubProgress = window.electronAPI.onTaskProgress((data) => {
    useTaskStore.getState().updateTask(data.taskId, {
      progress: data.progress,
      message: data.message
    })
    useTaskStore.getState().setProgress(data.progress)
  })

  const unsubComplete = window.electronAPI.onTaskComplete((data) => {
    useTaskStore.getState().updateTask(data.taskId, {
      status: 'completed',
      progress: 100,
      message: data.result,
      completedAt: Date.now()
    })
    useTaskStore.setState({ statusMessage: '任务执行完成 ✓', isProcessing: false, activeTaskId: null })
  })

  const unsubError = window.electronAPI.onTaskError((data) => {
    useTaskStore.getState().updateTask(data.taskId, {
      status: 'error',
      message: data.error,
      error: data.error
    })
    useTaskStore.setState({ statusMessage: `任务失败: ${data.error}`, isProcessing: false, activeTaskId: null })
  })

  return () => {
    unsubProgress()
    unsubComplete()
    unsubError()
  }
}
