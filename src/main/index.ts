import { app, BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc-handlers'
import { loadConfig, loadWindowState, saveWindowState } from './config-store'

/**
 * 应用图标路径。
 * - dev / 未打包：__dirname = <项目根>/out/main，回溯到 <项目根>/build/icon.png
 * - 打包后：electron-builder 会把 build/icon.* 作为应用图标，运行时资源在 process.resourcesPath
 */
function resolveIconPath(): string | undefined {
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = [
    join(__dirname, '../../build', iconName),
    join(process.resourcesPath, iconName),
    join(app.getAppPath(), 'build', iconName)
  ]
  return candidates.find((p) => existsSync(p))
}

let mainWindow: BrowserWindow | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

const isDev = !!process.env['ELECTRON_RENDERER_URL']

/** 验证坐标是否在当前某个屏幕内 */
function isPositionOnScreen(x: number, y: number): boolean {
  return screen.getAllDisplays().some(d =>
    x >= d.bounds.x - 50 &&
    y >= d.bounds.y - 50 &&
    x < d.bounds.x + d.bounds.width + 50 &&
    y < d.bounds.y + d.bounds.height + 50
  )
}

function createWindow(): void {
  const config = loadConfig()
  const remember = config.window.rememberWindowState
  const winState = remember ? loadWindowState() : { width: 1200, height: 800, isMaximized: false, x: undefined, y: undefined }

  // 窗口大小
  const width = winState.width
  const height = winState.height

  // 窗口位置 — 验证是否在有效屏幕区域内
  const hasPosition = winState.x !== undefined && winState.y !== undefined
    && isPositionOnScreen(winState.x, winState.y)

  const iconPath = resolveIconPath()
  console.log('[MAIN] iconPath:', iconPath)
  console.log('[MAIN] rememberWindow:', remember, 'restore:', hasPosition ? `${winState.x},${winState.y} ${width}x${height}` : `default ${width}x${height}`)

  mainWindow = new BrowserWindow({
    ...(hasPosition ? { x: winState.x, y: winState.y } : {}),
    width,
    height,
    minWidth: 400,
    minHeight: 300,
    frame: false,
    title: 'NAVI',
    backgroundColor: '#0f0f1a',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  // 恢复最大化
  if (winState.isMaximized) {
    mainWindow.maximize()
  }

  // ---- 窗口状态记忆（仅在开关启用时保存） ----

  function debouncedSaveWindow(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      if (!loadConfig().window.rememberWindowState) return
      const bounds = mainWindow.getBounds()
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: mainWindow.isMaximized()
      })
    }, 500)
  }

  mainWindow.on('resize', () => {
    if (!mainWindow?.isMaximized()) debouncedSaveWindow()
  })
  mainWindow.on('move', () => {
    if (!mainWindow?.isMaximized()) debouncedSaveWindow()
  })
  mainWindow.on('maximize', () => {
    debouncedSaveWindow()
    mainWindow?.webContents.send('window:state-change', 'maximized')
  })
  mainWindow.on('unmaximize', () => {
    debouncedSaveWindow()
    mainWindow?.webContents.send('window:state-change', 'normal')
  })

  mainWindow.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer)
    if (!loadConfig().window.rememberWindowState) return
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isMaximized()) {
      const bounds = mainWindow.getBounds()
      saveWindowState({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false
      })
    }
  })

  // ----

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.on('did-fail-load', (_e, code, desc) => {
    console.error(`[MAIN] Load failed: ${code} - ${desc}`)
  })

  if (isDev) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']!)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 单例锁 — 只允许运行一个实例
app.setAppUserModelId('com.iris.NAVI')
const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  // app.quit() 只退主进程，子进程变孤儿。必须用 exit 终止整个进程树
  app.exit(0)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
      mainWindow.show()
    }
  })

  app.whenReady().then(() => {
    registerIpcHandlers()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}
