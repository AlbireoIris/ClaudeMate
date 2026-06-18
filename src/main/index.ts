import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { registerIpcHandlers } from './ipc-handlers'

/**
 * 应用图标路径。
 * - dev / 未打包：__dirname = <项目根>/out/main，回溯到 <项目根>/build/icon.png
 * - 打包后：electron-builder 会把 build/icon.* 作为应用图标，运行时资源在 process.resourcesPath
 */
function resolveIconPath(): string | undefined {
  const candidates = [
    join(__dirname, '../../build/icon.png'), // dev: out/main -> 项目根/build
    join(process.resourcesPath, 'icon.png'), // 打包后
    join(__dirname, '../../resources/icon.png')
  ]
  return candidates.find((p) => existsSync(p))
}

// Linux 下部分显卡/驱动组合会导致 Electron GPU 进程崩溃
// (GPU process isn't usable. Goodbye.)，禁用硬件加速规避
if (process.platform === 'linux') {
  app.disableHardwareAcceleration()
  app.commandLine.appendSwitch('disable-gpu')
  app.commandLine.appendSwitch('disable-gpu-compositing')
  app.commandLine.appendSwitch('no-sandbox')
}

let mainWindow: BrowserWindow | null = null

export function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

const isDev = !!process.env['ELECTRON_RENDERER_URL']

function createWindow(): void {
  const iconPath = resolveIconPath()
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 400,
    minHeight: 300,
    frame: false,
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

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 窗口关闭时清理引用 + 退出
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 最大化/取消最大化时通知渲染进程重绘
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:state-change', 'maximized')
  })
  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:state-change', 'normal')
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

// 防止任务栏出现重复图标
app.setAppUserModelId('com.iris.claude-code-assistant')

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 所有窗口关闭 → 退出
app.on('window-all-closed', () => {
  app.quit()
})
