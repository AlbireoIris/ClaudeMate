import React, { useEffect } from 'react'
import { useThemeStore } from './stores/themeStore'
import { setupTaskListeners } from './stores/taskStore'
import Toolbar from './components/Toolbar'
import MainArea from './components/MainArea'
import StatusBar from './components/StatusBar'

const App: React.FC = () => {
  const theme = useThemeStore(s => s.theme)

  useEffect(() => {
    const cleanup = setupTaskListeners()
    return cleanup
  }, [])

  return (
    <div className={`h-full flex flex-col ${theme === 'dark' ? 'dark' : ''}`}
      style={{ backgroundColor: 'var(--bg-root)' }}>
      <Toolbar />
      <MainArea />
      <StatusBar />
    </div>
  )
}

export default App
