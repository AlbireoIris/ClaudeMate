/**
 * Sub-agent 可视化面板
 *
 * 挂载在窗口右侧，每个 agent 独立一栏，
 * 显示简略工作状态：名称、当前任务、进度、最近日志。
 */
import React, { useState, useCallback, useEffect } from 'react'
import {
  Bot, Loader, CheckCircle, XCircle, Clock,
  ChevronRight, Minimize2, Maximize2, Terminal,
} from 'lucide-react'

interface AgentState {
  id: string
  name: string
  status: 'idle' | 'running' | 'done' | 'error'
  task: string
  progress: number
  startedAt?: string
  finishedAt?: string
  logs: { time: string; text: string; level: 'info' | 'warn' | 'error' }[]
}

const DEFAULT_AGENTS: AgentState[] = [
  { id: 'build', name: 'Build', status: 'idle', task: '就绪', progress: 0, logs: [] },
  { id: 'plan', name: 'Plan', status: 'idle', task: '就绪', progress: 0, logs: [] },
  { id: 'explore', name: 'Explore', status: 'idle', task: '就绪', progress: 0, logs: [] },
  { id: 'general', name: 'General', status: 'idle', task: '就绪', progress: 0, logs: [] },
]

const statusColor = (s: string) => {
  switch (s) {
    case 'running': return '#f59e0b'
    case 'done': return '#22c55e'
    case 'error': return '#ef4444'
    default: return 'var(--text-muted)'
  }
}

const statusIcon = (s: string) => {
  switch (s) {
    case 'running': return <Loader size={12} className="animate-spin" style={{ color: '#f59e0b' }} />
    case 'done': return <CheckCircle size={12} style={{ color: '#22c55e' }} />
    case 'error': return <XCircle size={12} style={{ color: '#ef4444' }} />
    default: return <Clock size={12} style={{ color: 'var(--text-muted)' }} />
  }
}

const AgentCard: React.FC<{
  agent: AgentState
  expanded: boolean
  onToggle: () => void
}> = ({ agent, expanded, onToggle }) => (
  <div className="rounded-xl border transition-all"
    style={{
      borderColor: expanded ? 'var(--accent)' : 'var(--border-glass)',
      backgroundColor: expanded ? 'var(--accent-light)' : 'var(--bg-dialog)',
    }}
  >
    {/* Header */}
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 text-left"
    >
      {statusIcon(agent.status)}
      <Bot size={13} style={{ color: statusColor(agent.status) }} />
      <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text-primary)' }}>
        {agent.name}
      </span>
      {agent.status === 'running' && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{
          backgroundColor: 'rgba(245,158,11,0.15)',
          color: '#f59e0b',
        }}>
          {agent.progress}%
        </span>
      )}
      <ChevronRight
        size={10}
        className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
        style={{ color: 'var(--text-muted)' }}
      />
    </button>

    {/* Expanded view */}
    {expanded && (
      <div className="px-3 pb-2 space-y-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
        {/* Progress bar */}
        {agent.status === 'running' && (
          <div className="pt-2">
            <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.max(agent.progress, 2)}%`,
                  background: `linear-gradient(90deg, #f59e0b, ${agent.progress > 70 ? '#22c55e' : '#f59e0b'})`,
                }}
              />
            </div>
            <p className="text-[10px] mt-1 truncate" style={{ color: 'var(--text-secondary)' }}>
              {agent.task}
            </p>
          </div>
        )}

        {/* Logs */}
        {agent.logs.length > 0 && (
          <div className="max-h-[80px] overflow-y-auto mt-1 space-y-0.5">
            {agent.logs.slice(-5).map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px]">
                <span className="shrink-0 opacity-50" style={{ color: 'var(--text-muted)' }}>
                  {l.time.slice(-8)}
                </span>
                <Terminal size={9} className="shrink-0 mt-0.5" style={{
                  color: l.level === 'error' ? '#ef4444' : l.level === 'warn' ? '#f59e0b' : 'var(--text-muted)',
                }} />
                <span className="truncate" style={{
                  color: l.level === 'error' ? '#ef4444' : 'var(--text-secondary)',
                }}>{l.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Timing */}
        {agent.startedAt && (
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            ⏱ {new Date(agent.startedAt).toLocaleTimeString('zh-CN')}
            {agent.finishedAt && ` → ${new Date(agent.finishedAt).toLocaleTimeString('zh-CN')}`}
          </p>
        )}
      </div>
    )}
  </div>
)

const AgentPanel: React.FC = () => {
  const [agents, setAgents] = useState<AgentState[]>(DEFAULT_AGENTS)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)

  const toggleAgent = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Expose update function globally for IPC to call
  useEffect(() => {
    (window as any).__updateAgent = (update: Partial<AgentState> & { id: string }) => {
      setAgents(prev => prev.map(a =>
        a.id === update.id ? { ...a, ...update } : a
      ))
    }
    return () => { delete (window as any).__updateAgent }
  }, [])

  if (collapsed) {
    return (
      <div className="flex flex-col items-center py-2 gap-1 border-l" style={{ borderColor: 'var(--border-subtle)' }}>
        <button onClick={() => setCollapsed(false)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/[0.08]">
          <Maximize2 size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
        {agents.map(a => (
          <div key={a.id} className="relative" title={a.name + ': ' + a.task}>
            {statusIcon(a.status)}
            {a.status === 'running' && (
              <div className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-2 h-0.5 rounded"
                style={{ backgroundColor: statusColor(a.status) }} />
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col border-l" style={{
      backgroundColor: 'var(--bg-panel)',
      borderColor: 'var(--border-subtle)',
      width: 240,
    }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Bot size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
            Agents
          </span>
          <span className="text-[10px] px-1 py-0.5 rounded" style={{
            backgroundColor: 'var(--border-subtle)',
            color: 'var(--text-muted)',
          }}>
            {agents.filter(a => a.status === 'running').length} 活跃
          </span>
        </div>
        <button onClick={() => setCollapsed(true)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/[0.08]">
          <Minimize2 size={12} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {agents.map(a => (
          <AgentCard
            key={a.id}
            agent={a}
            expanded={expanded.has(a.id)}
            onToggle={() => toggleAgent(a.id)}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-1.5 border-t text-[10px]" style={{
        borderColor: 'var(--border-subtle)',
        color: 'var(--text-muted)',
      }}>
        {agents.filter(a => a.status === 'done').length} 完成 · {agents.filter(a => a.status === 'error').length} 失败
      </div>
    </div>
  )
}

export default AgentPanel
