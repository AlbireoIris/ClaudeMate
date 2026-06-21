import React, { useState, useCallback, useRef } from 'react'
import FloatingPanel from './FloatingPanel'
import { Brain, Plus, X, Save, Play, Search, GitFork, Zap, Eye, RotateCw, CheckCircle2 } from 'lucide-react'

// ═══ 思考范式节点类型 ═══
type NodeKind = 'input' | 'observe' | 'decide' | 'act' | 'reflect' | 'iterate' | 'done'

const NODE_DEFS: Record<NodeKind, {
  icon: React.ReactNode; color: string; label: string
  defaultQuestion: string; defaultGuidance: string
}> = {
  input: {
    icon: <Play size={12} />, color: '#6366f1', label: '输入',
    defaultQuestion: '我手里有什么？',
    defaultGuidance: '明确当前任务的目标和已知信息'
  },
  observe: {
    icon: <Search size={12} />, color: '#3b82f6', label: '观察',
    defaultQuestion: '我应该怎么分析它？',
    defaultGuidance: '选择合适的方式：看文件头/解析HTML/解码图片/检查格式'
  },
  decide: {
    icon: <GitFork size={12} />, color: '#f59e0b', label: '决策',
    defaultQuestion: '基于观察到的事实，下一步该做什么？',
    defaultGuidance: '根据分析结果选择分支：继续/换方法/跳过/报告'
  },
  act: {
    icon: <Zap size={12} />, color: '#22c55e', label: '执行',
    defaultQuestion: '我现在要执行什么操作？',
    defaultGuidance: '调用工具：读取/下载/解码/解压/转换'
  },
  reflect: {
    icon: <Eye size={12} />, color: '#ef4444', label: '反思',
    defaultQuestion: '我得到了什么结果？符合预期吗？',
    defaultGuidance: '检查输出：成功？失败？部分成功？异常？'
  },
  iterate: {
    icon: <RotateCw size={12} />, color: '#8b5cf6', label: '迭代',
    defaultQuestion: '下一步是重复哪个步骤？还是已经完成了？',
    defaultGuidance: '判断是否满足完成条件，否则回到相应的步骤继续'
  },
  done: {
    icon: <CheckCircle2 size={12} />, color: '#10b981', label: '完成',
    defaultQuestion: '任务是否已经达成所有目标？',
    defaultGuidance: '整理最终结果，汇报给用户'
  },
}

type ParadigmNode = { id: string; kind: NodeKind; x: number; y: number; question: string; guidance: string }
type Edge = { from: string; to: string; label?: string }

// ═══ 预置范式：通用任务解决流程 ═══
const DEFAULT_NODES: ParadigmNode[] = [
  { id: "n1", kind: "input",   x: 280, y: 20,  question: "我手里有什么？", guidance: "明确任务目标，列出已知信息和资源" },
  { id: "n2", kind: "observe", x: 280, y: 110, question: "我应该怎么分析它？", guidance: "根据数据类型选择分析方式：文本→提取关键信息, 图片→识别/解码, 链接→获取内容, 文件→检查格式" },
  { id: "n3", kind: "decide",  x: 280, y: 200, question: "基于观察到的事实，下一步该做什么？", guidance: "判断：信息够了→执行, 还需要更多→继续观察, 遇到障碍→换方法" },
  { id: "n4", kind: "act",     x: 280, y: 290, question: "我现在要执行什么操作？", guidance: "调用合适的工具执行操作。每次只做一步。" },
  { id: "n5", kind: "reflect", x: 280, y: 380, question: "执行后得到了什么？", guidance: "检查结果：成功？失败？得到了什么数据？有异常吗？" },
  { id: "n6", kind: "decide",  x: 280, y: 470, question: "任务完成了吗？还需要继续吗？", guidance: "判断：目标已达成→结束, 还需要更多步骤→继续分析, 出错了→换方法重试" },
]

const DEFAULT_EDGES: Edge[] = [
  { from: "n1", to: "n2" },
  { from: "n2", to: "n3" },
  { from: "n3", to: "n4" },
  { from: "n4", to: "n5" },
  { from: "n5", to: "n6" },
  { from: "n6", to: "n2", label: "继续分析" },
  { from: "n6", to: "n6", label: "任务未完成" },
]

const NODE_W = 250; const NODE_H = 72

// ═══ 组件 ═══
const ParadigmEditor: React.FC = () => {
  const [paradigmName, setParadigmName] = useState('通用任务解决流程')
  const [nodes, setNodes] = useState<ParadigmNode[]>(DEFAULT_NODES)
  const [edges, setEdges] = useState<Edge[]>(DEFAULT_EDGES)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)

  const selected = nodes.find(n => n.id === selectedId)

  const onPointerDown = useCallback((e: React.PointerEvent, id: string) => {
    e.stopPropagation(); e.preventDefault()
    setSelectedId(id)
    const startX = e.clientX; const startY = e.clientY
    const node = nodes.find(n => n.id === id); if (!node) return
    const origX = node.x; const origY = node.y
    const onMove = (ev: PointerEvent) => setNodes(prev => prev.map(n => n.id === id ? { ...n, x: origX + ev.clientX - startX, y: origY + ev.clientY - startY } : n))
    const onUp = () => { document.removeEventListener('pointermove', onMove); document.removeEventListener('pointerup', onUp) }
    document.addEventListener('pointermove', onMove); document.addEventListener('pointerup', onUp)
  }, [nodes])

  const addNode = (kind: NodeKind) => {
    const def = NODE_DEFS[kind]
    setNodes(prev => [...prev, { id: 'n' + Date.now(), kind, x: 100 + Math.random() * 400, y: 50 + Math.random() * 300, question: def.defaultQuestion, guidance: def.defaultGuidance }])
    setAddMenuOpen(false)
  }

  const removeSelected = () => {
    if (!selectedId) return
    setNodes(prev => prev.filter(n => n.id !== selectedId))
    setEdges(prev => prev.filter(e => e.from !== selectedId && e.to !== selectedId))
    setSelectedId(null)
  }

  // 导出为 AI 可用的范式指令
  const exportPrompt = () => {
    const lines = [`【思考范式: ${paradigmName}】`, '', '遵循以下思考循环，直到任务完成：', '']
    for (const node of nodes) {
      const def = NODE_DEFS[node.kind]
      lines.push(`[${def.label}] ${node.question}`)
      lines.push(`  → ${node.guidance}`)
      lines.push('')
    }
    const cycle = edges.find(e => e.label === '未完成')
    const done = edges.find(e => e.label === '已完成')
    if (cycle) lines.push('如果未完成 → 回到【观察】步骤继续分析')
    if (done) lines.push('如果已完成 → 进入【完成】步骤汇报结果')
    return lines.join('\n')
  }

  const renderEdges = () => edges.map(e => {
    const from = nodes.find(n => n.id === e.from); const to = nodes.find(n => n.id === e.to)
    if (!from || !to) return null
    const x1 = from.x + NODE_W / 2; const y1 = from.y + NODE_H
    const x2 = to.x + NODE_W / 2; const y2 = to.y
    const midY = (y1 + y2) / 2
    return (
      <g key={`${e.from}-${e.to}`}>
        <path d={`M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`} fill="none" stroke="var(--border-glass)" strokeWidth={2} />
        <circle cx={x2} cy={y2 - 5} r={4} fill={NODE_DEFS[to.kind]?.color || '#6366f1'} />
        {e.label && <text x={(x1 + x2) / 2} y={midY - 6} textAnchor="middle" fontSize={11} fill="var(--text-muted)">{e.label}</text>}
      </g>
    )
  })

  const nodeColors = (kind: NodeKind) => NODE_DEFS[kind]

  return (
    <FloatingPanel id="paradigm"
      icon={<Brain size={22} style={{ color: 'var(--text-secondary)' }} />}
      title="思考范式">
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <input value={paradigmName} onChange={e => setParadigmName(e.target.value)} className="flex-1 bg-transparent text-xs font-medium outline-none" style={{ color: 'var(--text-primary)' }} />
          <button onClick={() => setAddMenuOpen(!addMenuOpen)} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08]"><Plus size={14} style={{ color: 'var(--accent)' }} /></button>
          <button onClick={removeSelected} disabled={!selectedId} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08] disabled:opacity-30"><X size={14} style={{ color: 'var(--danger)' }} /></button>
          <button onClick={async () => { const data = { name: paradigmName, nodes: nodes.map(n => ({ kind: n.kind, question: n.question, guidance: n.guidance, label: NODE_DEFS[n.kind].label })) }; const ok = await window.electronAPI.saveParadigm(data); alert(ok ? "范式已保存！AI 将在下一条消息中遵循此思考流程。" : "保存失败") }} className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08]"><Save size={14} style={{ color: "var(--success)" }} /></button>
        </div>

        {addMenuOpen && (
          <div className="absolute top-10 right-2 z-50 rounded-xl border shadow-xl p-1" style={{ backgroundColor: 'var(--bg-dialog)', borderColor: 'var(--border-glass)' }}>
            {(Object.entries(NODE_DEFS) as [NodeKind, typeof NODE_DEFS['input']][]).map(([kind, def]) => (
              <button key={kind} onClick={() => addNode(kind)} className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08]" style={{ color: 'var(--text-secondary)' }}>
                <span style={{ color: def.color }}>{def.icon}</span> {def.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 relative overflow-auto" style={{ minHeight: 400, backgroundColor: 'var(--bg-root)' }}
          onClick={() => { setSelectedId(null); setAddMenuOpen(false) }}>
          <svg className="absolute inset-0 pointer-events-none" style={{ width: 800, height: Math.max(700, Math.max(...nodes.map(n => n.y)) + 200) }}>
            {renderEdges()}
          </svg>
          {nodes.map(node => {
            const def = nodeColors(node.kind)
            const isSel = selectedId === node.id
            return (
              <div key={node.id} onPointerDown={(e) => onPointerDown(e, node.id)}
                className="absolute rounded-xl border cursor-pointer select-none"
                style={{ left: node.x, top: node.y, width: NODE_W, minHeight: NODE_H, backgroundColor: 'var(--bg-dialog)', borderColor: isSel ? def.color : 'var(--border-glass)', borderWidth: isSel ? 2 : 1, zIndex: isSel ? 10 : 1 }}>
                <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-t-xl" style={{ backgroundColor: def.color + '20' }}>
                  <span style={{ color: def.color }}>{def.icon}</span>
                  <span className="text-[10px] font-medium" style={{ color: def.color }}>{def.label}</span>
                </div>
                <div className="px-2 py-1 text-xs font-medium" style={{ color: 'var(--text-primary)' }}>{node.question}</div>
                <div className="px-2 pb-1.5 text-[10px]" style={{ color: 'var(--text-muted)' }}>{node.guidance}</div>
              </div>
            )
          })}
        </div>

        {selected && (
          <div className="border-t p-3 shrink-0 space-y-2" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="text-xs font-medium" style={{ color: nodeColors(selected.kind).color }}>{nodeColors(selected.kind).label} · 属性</div>
            <input value={selected.question} onChange={e => setNodes(prev => prev.map(n => n.id === selected.id ? { ...n, question: e.target.value } : n))}
              placeholder="该阶段的问题" className="w-full bg-transparent border rounded-lg px-2 py-1.5 text-xs outline-none" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-primary)' }} />
            <textarea value={selected.guidance} onChange={e => setNodes(prev => prev.map(n => n.id === selected.id ? { ...n, guidance: e.target.value } : n))}
              placeholder="如何思考 / 指导方向" rows={2} className="w-full bg-transparent border rounded-lg px-2 py-1.5 text-xs outline-none resize-none" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }} />
          </div>
        )}
      </div>
    </FloatingPanel>
  )
}

export default ParadigmEditor
