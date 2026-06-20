import React, { useEffect } from 'react'
import { useThemeStore } from './stores/themeStore'
import { setupTaskListeners } from './stores/taskStore'
import Toolbar from './components/Toolbar'
import MainArea from './components/MainArea'
import StatusBar from './components/StatusBar'
import AgentPanel from './components/AgentPanel'

const App: React.FC = () => {
  const theme = useThemeStore(s => s.theme)

  useEffect(() => {
    const cleanup = setupTaskListeners()
    // 从统一配置同步主题（首次运行或外部修改后）
    useThemeStore.getState().syncFromConfig()
    return cleanup
  }, [])

  return (
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'dark' : ''}`}
      style={{ backgroundColor: 'var(--bg-root)' }}>
      <Toolbar />
      <div className="flex-1 flex min-h-0">
        <MainArea />
        <AgentPanel />
      </div>
      <StatusBar />
    </div>
  )
}

export default App
