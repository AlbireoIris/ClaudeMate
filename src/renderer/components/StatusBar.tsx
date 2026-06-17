import React from 'react'
import { useTaskStore } from '../stores/taskStore'
import { Loader, CheckCircle } from 'lucide-react'

const StatusBar: React.FC = () => {
  const statusMessage = useTaskStore(s => s.statusMessage)
  const isProcessing = useTaskStore(s => s.isProcessing)

  return (
    <footer className="flex items-center h-6 px-3 shrink-0 border-t text-[11px]"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-muted)'
      }}>
      {isProcessing ? (
        <Loader size={10} className="animate-spin text-indigo-400 shrink-0 mr-1.5" />
      ) : (
        <CheckCircle size={10} className="shrink-0 mr-1.5" style={{ color: 'var(--text-muted)' }} />
      )}
      <span className="truncate">{statusMessage}</span>
    </footer>
  )
}

export default StatusBar
