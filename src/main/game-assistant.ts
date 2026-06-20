/**
 * 游戏助手模块 — MAA (明日方舟) + ALAS (碧蓝航线) 集成
 *
 * 两者均通过 ADB 控制模拟器，提供截图/OCR/点击自动化。
 * 此模块将其作为子进程管理，通过 ClaudeMate 面板控制。
 */
import { spawn, execSync, type ChildProcess } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'

// ═══ 项目路径 ═══

const MAA_DIR = 'H:\\MAA'
const ALAS_DIR = 'H:\\ALAS'
const PYTHON = 'python'  // 或 python3

// ═══ 状态类型 ═══

export interface GameTask {
  id: string
  game: 'arknights' | 'azurlane'
  name: string
  status: 'idle' | 'running' | 'done' | 'error'
  progress: number
  message: string
  startedAt?: string
  finishedAt?: string
}

export interface GameStatus {
  tasks: GameTask[]
  adbConnected: boolean
  maaAvailable: boolean
  alasAvailable: boolean
}

// ═══ MAA ═══

let maaProcess: ChildProcess | null = null

export function isMaaAvailable(): boolean {
  return existsSync(join(MAA_DIR, 'src'))
}

/** 启动 MAA 任务 */
export async function startMaaTask(
  taskName: string,
  onLog: (msg: string) => void,
): Promise<{ success: boolean; error?: string }> {
  if (!isMaaAvailable()) {
    return { success: false, error: 'MAA 未安装。请 clone MaaAssistantArknights 到 H:\\MAA' }
  }

  // MAA 的 Python 入口
  const maaPy = join(MAA_DIR, 'src', 'Python')
  if (!existsSync(maaPy)) {
    return { success: false, error: 'MAA Python 绑定不存在' }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(PYTHON, ['-c', `
import sys
sys.path.insert(0, r'${MAA_DIR}/src/Python')
print('MAA Python bindings loaded')
print('Task: ${taskName}')
      `], {
        cwd: MAA_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      child.stdout?.on('data', (c: Buffer) => onLog(c.toString().trim()))
      child.stderr?.on('data', (c: Buffer) => onLog('[err] ' + c.toString().trim()))
      child.on('close', (code) => resolve({ success: code === 0 }))

      maaProcess = child
    } catch (e: any) {
      resolve({ success: false, error: e.message })
    }
  })
}

export function stopMaa(): void {
  if (maaProcess) { maaProcess.kill(); maaProcess = null }
}

// ═══ ALAS ═══

let alasProcess: ChildProcess | null = null

export function isAlasAvailable(): boolean {
  return existsSync(join(ALAS_DIR, 'alas.py'))
}

/** 启动 ALAS 任务 */
export async function startAlasTask(
  command: string,
  configName = 'alas',
  onLog: (msg: string) => void,
): Promise<{ success: boolean; error?: string }> {
  if (!isAlasAvailable()) {
    return { success: false, error: 'ALAS 未安装。请 clone AzurLaneAutoScript 到 H:\\ALAS' }
  }

  return new Promise((resolve) => {
    try {
      const child = spawn(PYTHON, [
        join(ALAS_DIR, 'alas.py'),
        '-c', configName,
        '-t', command,
      ], {
        cwd: ALAS_DIR,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONPATH: ALAS_DIR },
      })

      child.stdout?.on('data', (c: Buffer) => onLog(c.toString().trim()))
      child.stderr?.on('data', (c: Buffer) => onLog('[err] ' + c.toString().trim()))
      child.on('close', (code) => resolve({ success: code === 0 }))

      alasProcess = child
    } catch (e: any) {
      resolve({ success: false, error: e.message })
    }
  })
}

export function stopAlas(): void {
  if (alasProcess) { alasProcess.kill(); alasProcess = null }
}

// ═══ 共享 ADB 检测 ═══

/** 获取 MAA 已知的明日方舟任务列表 */
export function getArknightsTasks(): string[] {
  return [
    'WakeUp',           // 唤醒
    'Fight',            // 刷图
    'Recruit',          // 公开招募
    'Infrast',          // 基建
    'Mall',             // 信用商店
    'Award',            // 领取奖励
    'Roguelike',        // 集成战略
    'Reclamation',      // 生息演算
  ]
}

/** 获取 ALAS 已知的碧蓝航线任务列表 */
export function getAzurLaneTasks(): string[] {
  return [
    'General',          // 主线
    'Event',            // 活动
    'Event2',           // 活动 SP
    'Event3',           // 活动 EX
    'Raid',             // 共斗
    'Raid2',            // 共斗困难
    'Raid3',            // 共斗 SP
    'WarArchives',      // 作战档案
    'Opsi',             // 大世界
    'OpsiHazard',       // 大世界高危
    'OpsiStronghold',   // 大世界要塞
    'Daily',            // 日常
    'Hard',             // 困难
    'Exercise',         // 演习
    'Meowfficer',       // 指挥猫
    'Tactical',         // 战术研修
    'ShipGear',         // 舰船装备
  ]
}

/** 获取整体状态 */
export function getStatus(): GameStatus {
  return {
    tasks: [],
    adbConnected: existsSync('H:\\downloads\\platform-tools\\adb.exe'),
    maaAvailable: isMaaAvailable(),
    alasAvailable: isAlasAvailable(),
  }
}
