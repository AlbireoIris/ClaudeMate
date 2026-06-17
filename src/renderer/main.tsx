import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/globals.css'

// 启动诊断
console.log('[APP] Starting...')
console.log('[APP] electronAPI available:', !!window.electronAPI)
if (window.electronAPI) {
  console.log('[APP] API methods:', Object.keys(window.electronAPI))
}

const rootEl = document.getElementById('root')
if (!rootEl) {
  console.error('[APP] #root not found!')
} else {
  const root = ReactDOM.createRoot(rootEl)
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
  console.log('[APP] React mounted')
}
