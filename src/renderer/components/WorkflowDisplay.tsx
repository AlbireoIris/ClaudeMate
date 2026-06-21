import React from 'react'
import { motion } from 'framer-motion'
import { CheckCircle2, Loader, XCircle, Clock, Play, GitFork, Zap, Eye, ChevronRight } from 'lucide-react'

// ═══ 类型 ═══
export type NodeStatus = 'pending' | 'active' | 'completed' | 'failed' | 'skipped'

export interface WfNodeState {
  id: string
  label: string
  type: string
  status: NodeStatus
  input?: string
  output?: string
  decision?: string
  duration?: number
  error?: string
}

interface Props {
  nodes: WfNodeState[]
  visible: boolean
  onClose?: () => void
}

const COLORS: Record<string, string> = {
  action: '#22c55e', decide: '#f59e0b', tool: '#3b82f6', output: '#8b5cf6',
  input: '#6366f1', observe: '#3b82f6', reflect: '#ef4444', iterate: '#8b5cf6', done: '#10b981',
}

const ICONS: Record<string, React.ReactNode> = {
  action: <Zap size={10} />, decide: <GitFork size={10} />, tool: <Play size={10} />,
  output: <CheckCircle2 size={10} />, input: <Play size={10} />, observe: <Eye size={10} />,
  reflect: <Eye size={10} />, iterate: <ChevronRight size={10} />, done: <CheckCircle2 size={10} />,
}

const StatusIcon: React.FC<{ status: NodeStatus }> = ({ status }) => {
  switch (status) {
    case 'completed': return <CheckCircle2 size={12} style={{ color: '#22c55e' }} />
    case 'active': return <Loader size={12} className="animate-spin" style={{ color: '#f59e0b' }} />
    case 'failed': return <XCircle size={12} style={{ color: '#ef4444' }} />
    case 'skipped': return <Clock size={12} style={{ color: '#6b7280' }} />
    default: return <span className="w-3 h-3 rounded-full border" style={{ borderColor: 'var(--border-glass)' }} />
  }
}

const NODE_W = 120, NODE_H = 44, GAP_X = 40, GAP_Y = 30

const WorkflowDisplay: React.FC<Props> = ({ nodes, visible, onClose }) => {
  if (!visible || nodes.length === 0) return null

  // 简单布局：水平流，一行最多 4 个
  const cols = Math.min(4, nodes.length)
  const rows = Math.ceil(nodes.length / cols)
  const totalW = cols * (NODE_W + GAP_X) + 20
  const totalH = rows * (NODE_H + GAP_Y) + 40

  return (
    <div className="absolute bottom-16 left-4 right-4 z-50 rounded-2xl border backdrop-blur-xl shadow-2xl overflow-hidden"
      style={{ backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-glass)', maxHeight: 300 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: nodes.some(n => n.status === 'active') ? '#f59e0b' : '#22c55e' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>工作流执行</span>
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {nodes.filter(n => n.status === 'completed').length}/{nodes.length} 完成
          </span>
        </div>
        {onClose && <button onClick={onClose} className="text-xs" style={{ color: 'var(--text-muted)' }}>收起</button>}
      </div>

      {/* Flow graph */}
      <div className="overflow-auto p-3" style={{ maxHeight: 250 }}>
        <svg width={totalW} height={totalH} style={{ minWidth: '100%' }}>
          {/* Edges */}
          {nodes.slice(0, -1).map((node, i) => {
            const cx = (i % cols) * (NODE_W + GAP_X) + NODE_W / 2 + 10
            const cy = Math.floor(i / cols) * (NODE_H + GAP_Y) + NODE_H + 10
            const nx = ((i + 1) % cols) * (NODE_W + GAP_X) + NODE_H / 2 + 10
            const ny = Math.floor((i + 1) / cols) * (NODE_H + GAP_Y) + 10
            const sameRow = (i % cols) < cols - 1 && Math.floor(i / cols) === Math.floor((i + 1) / cols)
            if (!sameRow) return null
            const midX = (cx + nx) / 2
            return (
              <g key={`edge-${i}`}>
                <line x1={cx + NODE_W / 2} y1={cy - NODE_H / 2} x2={nx - NODE_W / 2} y2={ny + NODE_H / 2}
                  stroke={nodes[i + 1]?.status === 'active' ? '#f59e0b' : nodes[i + 1]?.status === 'completed' ? '#22c55e' : 'var(--border-glass)'}
                  strokeWidth={2} strokeDasharray={nodes[i + 1]?.status === 'active' ? '6,3' : 'none'} />
                {node.decision && (
                  <text x={midX} y={cy - NODE_H / 2 - 6} textAnchor="middle" fontSize={9} fill="var(--text-muted)">{node.decision}</text>
                )}
              </g>
            )
          })}

          {/* Nodes */}
          {nodes.map((node, i) => {
            const x = (i % cols) * (NODE_W + GAP_X) + 10
            const y = Math.floor(i / cols) * (NODE_H + GAP_Y) + 10
            const color = COLORS[node.type] || '#6366f1'
            const isActive = node.status === 'active'
            return (
              <g key={node.id} transform={`translate(${x},${y})`}>
                {/* Node rect */}
                <motion.rect width={NODE_W} height={NODE_H} rx={10}
                  fill="var(--bg-dialog)" stroke={color}
                  strokeWidth={isActive ? 2.5 : 1.5}
                  initial={false}
                  animate={isActive ? { filter: 'drop-shadow(0 0 6px ' + color + ')' } : {}}
                  style={{ filter: isActive ? `drop-shadow(0 0 6px ${color}80)` : undefined }} />
                {/* Header */}
                <rect width={NODE_W} height={14} rx={10} fill={color + '25'} />
                <rect width={NODE_W} height={14} rx={10} fill="transparent" />
                <text x={NODE_W / 2} y={10} textAnchor="middle" fontSize={9} fill={color} fontWeight="bold">
                  {ICONS[node.type]} {node.label.slice(0, 10)}
                </text>
                {/* Status */}
                <text x={NODE_W / 2} y={28} textAnchor="middle" fontSize={9} fill="var(--text-primary)">
                  {node.status === 'pending' ? '...' : node.status === 'active' ? (node.input || '').slice(0, 20) : node.output?.slice(0, 25) || 'OK'}
                </text>
                {/* Duration */}
                {node.duration && (
                  <text x={NODE_W / 2} y={40} textAnchor="middle" fontSize={8} fill="var(--text-muted)">{node.duration}s</text>
                )}
                {/* Status badge */}
                <circle cx={NODE_W - 8} cy={8} r={7} fill="var(--bg-dialog)" />
                <foreignObject x={NODE_W - 14} y={2} width={14} height={14}>
                  <StatusIcon status={node.status} />
                </foreignObject>
              </g>
            )
          })}
        </svg>
      </div>

      {/* Failed node detail */}
      {nodes.filter(n => n.status === 'failed').map(n => (
        <div key={n.id} className="px-3 py-1.5 border-t text-xs flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)', color: '#ef4444' }}>
          <XCircle size={12} /> {n.label}: {n.error || '执行失败'}
        </div>
      ))}
    </div>
  )
}

export default WorkflowDisplay
