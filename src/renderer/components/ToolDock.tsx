import React, { createContext, useContext, useState, useCallback } from 'react'

// 互斥 — 同一时间只有一个面板打开
interface DockCtx {
  activeId: string | null
  setActive: (id: string | null) => void
}
const DockCtx = createContext<DockCtx>({ activeId: null, setActive: () => {} })
export const useDock = () => useContext(DockCtx)

// 排序 + 拖拽预览
interface OrderCtx {
  ids: string[]
  moveIdx: (from: number, to: number) => void
  dragIdx: number | null
  setDrag: (idx: number | null, off: number) => void
  dragOff: number
  hoverIdx: number
}
const OrderCtx = createContext<OrderCtx>({
  ids: [], moveIdx: () => {}, dragIdx: null, setDrag: () => {}, dragOff: 0, hoverIdx: -1,
})
export const useOrder = () => useContext(OrderCtx)

const GAP = 8
const BTN = 48

interface Props { children: React.ReactNode; initialOrder: string[] }

// 折叠状态上下文
const CollapseCtx = createContext<{ collapsed: boolean; toggle: () => void }>({ collapsed: false, toggle: () => {} })
export const useCollapsed = () => useContext(CollapseCtx)

const ToolDock: React.FC<Props> = ({ children, initialOrder }) => {
  const [collapsed, setCollapsed] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [ids, setIds] = useState(initialOrder)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOff, setDragOff] = useState(0)
  const [hoverIdx, setHoverIdx] = useState(-1)

  const setActive = useCallback((id: string | null) => setActiveId(id), [])
  const moveIdx = useCallback((from: number, to: number) => {
    setIds(prev => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next })
  }, [])

  const setDrag = useCallback((idx: number | null, off: number) => {
    setDragIdx(idx)
    setDragOff(off)
    if (idx === null) { setHoverIdx(-1); return }
    const top = GAP + idx * (GAP + BTN)
    const hover = Math.round((top + off - GAP) / (GAP + BTN))
    setHoverIdx(Math.max(0, Math.min(ids.length - 1, hover)))
  }, [ids.length])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => !prev)
    setActiveId(null) // 折叠时关闭面板
  }, [])

  return (
    <CollapseCtx.Provider value={{ collapsed, toggle: toggleCollapse }}>
      <DockCtx.Provider value={{ activeId, setActive }}>
        <OrderCtx.Provider value={{ ids, moveIdx, dragIdx, setDrag, dragOff, hoverIdx }}>
          {/* 折叠切换按钮 */}
          <button onClick={toggleCollapse}
            className="absolute left-3 rounded-xl border backdrop-blur-md shadow-lg flex items-center justify-center"
            style={{
              width: BTN, height: BTN, top: GAP,
              backgroundColor: 'var(--bg-glass)', borderColor: 'var(--border-glass)',
              cursor: 'pointer', zIndex: 51,
              transform: collapsed ? 'none' : `translateY(${(ids.length) * (BTN + GAP)}px)`,
              transition: 'transform 0.15s ease',
            }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: 16, transform: collapsed ? 'rotate(0deg)' : 'rotate(0deg)', display: 'inline-block', transition: 'transform 0.15s ease' }}>{collapsed ? '▶' : '◀'}</span>
          </button>
          {children}
        </OrderCtx.Provider>
      </DockCtx.Provider>
    </CollapseCtx.Provider>
  )
}

export default ToolDock
