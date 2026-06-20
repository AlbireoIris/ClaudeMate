/**
 * 会话历史面板 — 显示保存的对话列表，支持恢复
 */
import React, { useEffect, useState, useCallback } from 'react'
import { MessageSquare, Trash2, Clock, FileText, RefreshCw } from 'lucide-react'

interface SessionMeta {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: { role: string; text: string; time: string }[]
  model: string
  effort: string
  tags: string[]
}

const SessionHistory: React.FC<{
  onRestore: (session: SessionMeta) => void
  onClose: () => void
}> = ({ onRestore, onClose }) => {
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.electronAPI.listSessions()
      setSessions(list || [])
    } catch { setSessions([]) }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    await window.electronAPI.deleteSession(id)
    if (selected === id) setSelected(null)
    load()
  }

  const handleRestore = async (id: string) => {
    const sess = await window.electronAPI.getSession(id)
    if (sess) onRestore(sess)
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
    return d.toLocaleDateString('zh-CN')
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-panel)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-3 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <MessageSquare size={16} style={{ color: 'var(--accent)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>会话历史</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={load} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08]" title="刷新">
            <RefreshCw size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--text-muted)' }} />
          </div>
        )}
        {!loading && sessions.length === 0 && (
          <div className="text-center py-8">
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>暂无保存的会话</p>
          </div>
        )}
        {sessions.map(s => (
          <div
            key={s.id}
            onClick={() => setSelected(s.id === selected ? null : s.id)}
            className="rounded-xl p-3 cursor-pointer transition-all border"
            style={{
              backgroundColor: selected === s.id ? 'var(--accent-light)' : 'var(--bg-dialog)',
              borderColor: selected === s.id ? 'var(--accent)' : 'var(--border-glass)',
            }}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                  {s.title || '未命名会话'}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <Clock size={10} style={{ color: 'var(--text-muted)' }} />
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {formatDate(s.updatedAt)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
                    backgroundColor: 'var(--border-subtle)',
                    color: 'var(--text-muted)',
                  }}>
                    {s.model?.split('[')[0] || s.model}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {s.messages?.length || 0} 条消息
                  </span>
                </div>
              </div>
            </div>

            {/* Actions */}
            {selected === s.id && (
              <div className="flex items-center gap-1 mt-2 pt-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <button
                  onClick={(e) => { e.stopPropagation(); handleRestore(s.id) }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05]"
                  style={{ color: 'var(--accent)' }}
                >
                  <FileText size={11} /> 恢复
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(s.id) }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs transition-colors hover:bg-red-500/10"
                  style={{ color: 'var(--text-muted)' }}
                >
                  <Trash2 size={11} /> 删除
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default SessionHistory
