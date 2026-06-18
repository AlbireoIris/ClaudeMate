import React, { useCallback, useState, useRef, useEffect } from 'react'
import { Send, Paperclip, Loader, X, FileText } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTaskStore } from '../stores/taskStore'
import { useAppStore } from '../stores/appStore'
import Sidebar from './Sidebar'
import SettingsBar from './SettingsBar'
import logo from '../assets/logo.png'
import type { FileItem } from '../../shared/types'

function now() { return new Date().toISOString() }
function progressColor(p: number): string {
  if (p < 30) return '#818cf8'
  if (p < 60) return '#60a5fa'
  if (p < 85) return '#34d399'
  return '#22c55e'
}

const MainArea: React.FC = () => {
  const addTask = useTaskStore(s => s.addTask)
  const executeTask = useTaskStore(s => s.executeTask)
  const isProcessing = useTaskStore(s => s.isProcessing)
  const allTasks = useTaskStore(s => s.tasks)
  const activeTaskId = useTaskStore(s => s.activeTaskId)
  const pendingFiles = useAppStore(s => s.pendingFiles)
  const attachFiles = useAppStore(s => s.attachFiles)
  const removeFile = useAppStore(s => s.removeFile)
  const clearFiles = useAppStore(s => s.clearFiles)
  const [inputValue, setInputValue] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string; time: string }[]>([])
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const task = allTasks.find(t => t.id === activeTaskId)
    if (task?.status === 'running') { setProgress(task.progress); setProgressMsg(task.message) }
    else if (!activeTaskId) { setProgress(0); setProgressMsg('') }
  }, [allTasks, activeTaskId])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [chatMessages, progressMsg])

  useEffect(() => {
    const shown = new Set(chatMessages.map(m => m.time))
    for (const task of allTasks) {
      if ((task.status === 'completed' || task.status === 'error') && !shown.has(task.id)) {
        setChatMessages(prev => [...prev, {
          role: 'ai',
          text: task.status === 'error' ? `❌ ${task.error || task.message}` : task.message,
          time: task.id
        }])
      }
    }
  }, [allTasks])

  const openFileDialog = useCallback(async () => {
    try {
      const paths = await window.electronAPI.openFileDialog()
      if (!paths?.length) return
      attachFiles(paths.map((p, i) => ({ id: `file-${Date.now()}-${i}`, name: p.split(/[/\\]/).pop() || p, path: p, type: 'file' as const, extension: '', size: 0 })))
      inputRef.current?.focus()
    } catch {}
  }, [attachFiles])

  const sendMessage = useCallback(() => {
    const text = inputValue.trim()
    if (!text && pendingFiles.length === 0) return
    const parts: string[] = []
    if (pendingFiles.length > 0) parts.push('📎 ' + pendingFiles.map(f => f.name).join(', '))
    if (text) parts.push(text)
    const userMsg = parts.join('\n')
    const taskFiles: FileItem[] = [...pendingFiles]
    if (text) taskFiles.push({ id: `input-${Date.now()}`, name: '用户输入', path: `__query__:${text}`, type: 'file', extension: '.txt', size: text.length })
    setChatMessages(prev => [...prev, { role: 'user', text: userMsg, time: now() }])
    setInputValue('')
    clearFiles()
    const taskId = addTask('smart-analyze', taskFiles)
    setTimeout(() => executeTask(taskId), 50)
  }, [inputValue, pendingFiles, addTask, executeTask])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false)
    const dt = e.dataTransfer

    // 从侧边栏拖入（自定义数据）
    const sidebarData = dt.getData('application/x-cc-file')
    if (sidebarData) {
      try {
        const items: FileItem[] = JSON.parse(sidebarData)
        if (items.length > 0) { attachFiles(items); return }
      } catch {}
    }

    // 从资源管理器拖入（原生文件）
    if (dt.files?.length) {
      const files: FileItem[] = Array.from(dt.files as any).map((f: any, i: number) => ({
        id: `drop-${Date.now()}-${i}`, name: f.name, path: f.path || f.name, type: 'file' as const, extension: '', size: f.size || 0
      }))
      attachFiles(files)
    }
  }, [attachFiles])

  return (
    <main className="flex-1 relative flex flex-col min-h-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-root)' }}>
      <Sidebar />

      <div
        className={`flex-1 flex flex-col min-h-0 relative px-3 pt-3 ${chatMessages.length === 0 ? 'justify-center' : ''}`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}>

        {/* 拖放覆盖层 */}
        <AnimatePresence>
          {isDragOver && (
            <motion.div className="absolute inset-1 z-10 rounded-xl flex items-center justify-center border-2 border-dashed"
              style={{ borderColor: 'var(--accent)', backgroundColor: 'rgba(99,102,241,0.06)' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <span className="text-xl font-medium" style={{ color: 'var(--accent)' }}>📂 释放文件到此处</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 聊天区 — 有消息时 flex-1，空态 auto */}
        <div ref={scrollRef}
          className={`overflow-y-auto pb-2 ${chatMessages.length > 0 ? 'flex-1' : ''}`}
          style={{ userSelect: 'text' }}>
          <div className="max-w-3xl mx-auto space-y-3 px-4">
            {chatMessages.length === 0 && !isProcessing && (
              <div className="flex flex-col items-center justify-center h-full text-center select-none">
                <img src={logo} alt="logo" className="w-28 h-28 mb-4" draggable={false} />
                <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
                  Claude Code Assistant
                </h2>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                  你的桌面智能文件助手
                </p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div className="max-w-[85%] rounded-2xl px-4 py-2.5 text-base whitespace-pre-wrap break-words"
                  style={{
                    userSelect: 'text',
                    backgroundColor: msg.role === 'user' ? 'var(--accent)' : 'var(--bg-dialog)',
                    color: msg.role === 'user' ? '#fff' : 'var(--text-primary)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-glass)'
                  }}>{msg.text}</div>
              </div>
            ))}
            {isProcessing && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-2xl px-4 py-3 border w-64"
                  style={{ backgroundColor: 'var(--bg-dialog)', borderColor: 'var(--border-glass)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <Loader size={13} className="animate-spin" style={{ color: progressColor(progress) }} />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{progressMsg || '处理中...'}</span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                    <div className="h-full rounded-full transition-all duration-500 ease-linear"
                      style={{ width: `${Math.max(progress, 3)}%`, background: `linear-gradient(90deg, #6366f1, ${progressColor(progress)})`, boxShadow: `0 0 8px ${progressColor(progress)}40` }} />
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>0%</span>
                    <span className="text-[10px] font-medium" style={{ color: progressColor(progress) }}>{progress}%</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>100%</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 输入栏 */}
        <div className="shrink-0 pt-2 pb-4">
          <div className="max-w-3xl mx-auto px-4">
            <AnimatePresence>
              {pendingFiles.length > 0 && (
                <motion.div className="flex gap-2 mb-2 overflow-x-auto pb-1"
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                  {pendingFiles.map(f => (
                    <div key={f.path} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs shrink-0"
                      style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-glow)' }}>
                      <FileText size={12} />
                      <span className="max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => removeFile(f.path)} className="p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10"><X size={10} /></button>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="flex items-center gap-2 p-1.5 rounded-xl border"
              style={{ borderColor: 'var(--border-glass)', backgroundColor: 'var(--bg-dialog)' }}>
              <button onClick={openFileDialog} disabled={isProcessing}
                className="p-2 rounded-lg shrink-0 transition-colors disabled:opacity-30 hover:bg-black/5 dark:hover:bg-white/[0.06]"
                style={{ color: 'var(--text-secondary)' }}><Paperclip size={16} /></button>
              <input ref={inputRef} type="text" value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={pendingFiles.length > 0 ? '输入指令（如：压缩这些文件）' : '输入指令或拖放文件...'}
                disabled={isProcessing}
                className="flex-1 bg-transparent px-2 py-1.5 text-sm outline-none disabled:opacity-30"
                style={{ color: 'var(--text-primary)' }} />
              <button onClick={sendMessage}
                disabled={isProcessing || (!inputValue.trim() && pendingFiles.length === 0)}
                className="p-2 rounded-lg shrink-0 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{ backgroundColor: (inputValue.trim() || pendingFiles.length > 0) ? 'var(--accent)' : 'transparent', color: (inputValue.trim() || pendingFiles.length > 0) ? '#fff' : 'var(--text-muted)' }}>
                {isProcessing ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>

          <SettingsBar />
        </div>
      </div>
    </main>
  )
}

export default MainArea
