import React, { useState, useCallback } from 'react'
import { ChevronLeft } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDock, useOrder, useCollapsed } from './ToolDock'

interface Props {
  id: string
  icon: React.ReactNode
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  badge?: number
  badgeColor?: string
}

const GAP = 8
const BTN_SIZE = 48
const UNIT = BTN_SIZE + GAP

const FloatingPanel: React.FC<Props> = ({ id, icon, title, children, footer, badge, badgeColor = 'var(--danger)' }) => {
  const { activeId, setActive } = useDock()
  const { ids, moveIdx, dragIdx, setDrag, dragOff, hoverIdx } = useOrder()
  const { collapsed } = useCollapsed()
  const [width, setWidth] = useState(300)

  const isOpen = activeId === id
  const idx = ids.indexOf(id)
  const isDragging = dragIdx === idx

  // 拖拽预览：其他图标让位
  let displayIdx = idx
  if (dragIdx !== null && dragIdx !== idx) {
    if (dragIdx < idx && hoverIdx >= idx) displayIdx = idx - 1
    else if (dragIdx > idx && hoverIdx <= idx) displayIdx = idx + 1
  }
  const top = GAP + displayIdx * UNIT

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // 不调 preventDefault — 让 click 事件正常工作
    let moved = false
    let offset = 0
    const startY = e.clientY
    const origTop = GAP + idx * UNIT
    const onMove = (ev: PointerEvent) => {
      offset = ev.clientY - startY
      if (!moved && Math.abs(offset) > 5) { moved = true; setDrag(idx, offset) }
      if (moved) setDrag(idx, offset)
    }
    const onUp = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
      setDrag(null, 0)
      if (moved) {
        const target = Math.round((origTop + offset - GAP) / UNIT)
        const clamped = Math.max(0, Math.min(ids.length - 1, target))
        if (clamped !== idx) moveIdx(idx, clamped)
      } else {
        // 纯点击 → toggle
        setActive(isOpen ? null : id)
      }
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
  }, [idx, ids.length, isOpen, setActive])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX; const sw = width
    const onMove = (ev: MouseEvent) => requestAnimationFrame(() => setWidth(Math.max(220, Math.min(500, sw + ev.clientX - sx))))
    const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); document.body.style.cursor = '' }
    document.body.style.cursor = 'ew-resize'
    document.addEventListener('mousemove', onMove); document.addEventListener('mouseup', onUp)
  }, [width])

  return (
    <>
      <button onMouseDown={onPointerDown as any}
        className="absolute left-3 rounded-xl border backdrop-blur-md shadow-lg flex items-center justify-center"
        style={{
          width: BTN_SIZE, height: BTN_SIZE, top,
          touchAction: 'none',
          marginLeft: collapsed ? -60 : 0,
          opacity: collapsed ? 0 : 1,
          transition: isDragging ? 'none' : (dragIdx !== null && !isDragging ? 'top 0.15s ease' : 'margin-left 0.2s ease, opacity 0.2s ease'),
          backgroundColor: 'var(--bg-glass)',
          borderColor: isOpen ? 'var(--accent)' : (badge && badge > 0) ? badgeColor : 'var(--border-glass)',
          cursor: isDragging ? 'grabbing' : 'grab',
          zIndex: isDragging ? 99 : 50,
          transform: isDragging ? `translateY(${dragOff}px)` : undefined,
          // transition merged above
        }}>
        <span style={{ pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</span>
        {badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: badgeColor, pointerEvents: 'none' }}>{badge}</span>
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div className="absolute inset-0 bg-black/20 backdrop-blur-sm" style={{ zIndex: 45 }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onMouseDown={() => setActive(null)} />
            <motion.div
              className="absolute top-8 left-16 bottom-8 rounded-2xl border backdrop-blur-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ width, zIndex: 55, backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-glass)' }}
              initial={{ x: -300, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -300, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}>
              <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{title}</span>
                <button onClick={() => setActive(null)} className="p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/[0.08]">
                  <ChevronLeft size={16} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{children}</div>
              {footer}
              <div onMouseDown={startResize} className="absolute top-0 right-0 bottom-0 w-1.5 cursor-ew-resize z-60" />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  )
}

export default FloatingPanel
