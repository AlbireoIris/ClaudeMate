import React, { useEffect, useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Folder, FolderPlus, X, Menu, ChevronLeft, FileText, FolderOpen, ExternalLink, ChevronRight, Loader, ArrowRightToLine, Trash2, Pencil, Copy, FileImage, Film, Music, Archive, FileCode } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import { useAppStore } from '../stores/appStore'
import type { FileItem, FavoriteFolder } from '../../shared/types'

// ═══ 右键菜单 ═══
const ContextMenu: React.FC<{
  x: number; y: number; file: FileItem; onClose: () => void; onRefresh: () => void
}> = ({ x, y, file, onClose, onRefresh }) => {
  const menuRef = useRef<HTMLDivElement>(null)
  const attachFiles = useAppStore(s => s.attachFiles); const removeFile = useAppStore(s => s.removeFile)
  const pendingFiles = useAppStore(s => s.pendingFiles); const pending = pendingFiles.some(f => f.path === file.path)
  useEffect(() => { const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) onClose() }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h) }, [onClose])
  const adjX = Math.min(x, window.innerWidth - 180); const adjY = Math.min(y, window.innerHeight - 200)
  const items = [
    { icon: <ExternalLink size={12} />, label: '打开', action: () => { window.electronAPI.openFile(file.path); onClose() } },
    { type: 'sep' as const },
    { icon: <Copy size={12} />, label: '复制路径', action: () => { navigator.clipboard.writeText(file.path); onClose() } },
    { icon: <Pencil size={12} />, label: '重命名', action: () => { onClose(); setTimeout(() => { const name = prompt('新名称:', file.name); if (name && name !== file.name) window.electronAPI.renameFile(file.path, name).then(r => { if (r.error) alert('重命名失败: ' + r.error); else onRefresh() }) }, 100) } },
    { icon: <Trash2 size={12} />, label: '删除', action: () => { onClose(); setTimeout(() => { if (confirm(`确定删除 "${file.name}"？`)) window.electronAPI.deleteFile(file.path).then(r => { if (r?.error) alert('删除失败: ' + r.error); else onRefresh() }) }, 100) } },
  ]
  return createPortal(<div ref={menuRef} className="fixed z-[9999] rounded-xl border backdrop-blur-xl shadow-2xl py-1 min-w-[155px]" style={{ left: adjX, top: adjY, backgroundColor: 'var(--bg-panel)', borderColor: 'var(--border-glass)' }}>{items.map((item, i) => item.type === 'sep' ? <div key={i} className="my-1 border-t mx-2" style={{ borderColor: 'var(--border-subtle)' }} /> : <button key={i} onClick={item.action} className="w-full flex items-center gap-2 px-3 py-1.5 text-base text-left hover:bg-black/5 dark:hover:bg-white/[0.05]" style={{ color: 'var(--text-secondary)' }}>{item.icon}{item.label}</button>)}</div>, document.body)
}

// ═══ 文件行 ═══
const FileRow: React.FC<{ item: FileItem; depth: number; selected: boolean; onSelect: (path: string, ctrl: boolean, shift: boolean) => void; onRefresh: () => void }> = ({ item, depth, selected, onSelect, onRefresh }) => {
  const [expanded, setExpanded] = useState(false); const [children, setChildren] = useState<FileItem[]>([]); const [loading, setLoading] = useState(false); const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const attachFiles = useAppStore(s => s.attachFiles); const removeFile = useAppStore(s => s.removeFile); const pendingFiles = useAppStore(s => s.pendingFiles); const isPending = pendingFiles.some(f => f.path === item.path)
  const toggleExpand = useCallback(async () => { if (item.type !== 'folder') return; if (expanded) { setExpanded(false); setChildren([]) } else { setExpanded(true); setLoading(true); try { setChildren(await window.electronAPI.listDir(item.path) || []) } catch { setChildren([]) } setLoading(false) } }, [expanded, item.path, item.type])
  const clickCount = useRef(0); const clickTimer = useRef<ReturnType<typeof setTimeout>>()
  const handleClick = (e: React.MouseEvent) => { e.stopPropagation(); clickCount.current++; if (clickCount.current === 1) { clickTimer.current = setTimeout(() => { if (item.type === 'folder') toggleExpand(); else onSelect(item.path, e.ctrlKey, e.shiftKey); clickCount.current = 0 }, 300) } else { clearTimeout(clickTimer.current); clickCount.current = 0; window.electronAPI.openFile(item.path) } }
  const handleContextMenu = (e: React.MouseEvent) => { e.preventDefault(); e.stopPropagation(); setMenu({ x: e.clientX, y: e.clientY }) }
  return (<>
    <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg group transition-colors text-base" style={{ paddingLeft: `${8 + depth * 16}px`, color: selected ? 'var(--accent)' : 'var(--text-secondary)', backgroundColor: selected ? 'var(--accent-light)' : 'transparent', cursor: 'default' }} onClick={handleClick} onContextMenu={handleContextMenu}>
      {item.type === 'folder' ? <button onClick={(e) => { e.stopPropagation(); toggleExpand() }} className="p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/[0.08] shrink-0">{loading ? <Loader size={10} className="animate-spin" style={{ color: 'var(--text-muted)' }} /> : <ChevronRight size={10} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />}</button> : <span className="w-[18px] shrink-0" />}
      {item.type === 'folder' ? (expanded ? <FolderOpen size={18} style={{ color: 'var(--accent)' }} /> : <Folder size={18} style={{ color: 'var(--accent)' }} />) : (() => { const [iconEl, color] = fileIcon(item.extension); return <span style={{ color: selected ? 'var(--accent)' : color }}>{iconEl}</span> })()}
      <span className="flex-1 truncate select-none">{item.name}</span>
      <button onClick={(e) => { e.stopPropagation(); isPending ? removeFile(item.path) : attachFiles([item]) }} className={`p-1 rounded transition-all ${isPending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`} style={{ backgroundColor: isPending ? 'var(--accent)' : 'transparent', color: isPending ? '#fff' : 'var(--accent)' }} title={isPending ? '取消推送' : '推送到对话框'}><ArrowRightToLine size={11} /></button>
    </div>
    {menu && <ContextMenu x={menu.x} y={menu.y} file={item} onClose={() => setMenu(null)} onRefresh={onRefresh} />}
    <AnimatePresence>{expanded && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>{children.map(child => <FileRow key={child.path} item={child} depth={depth + 1} selected={false} onSelect={onSelect} onRefresh={onRefresh} />)}</motion.div>}</AnimatePresence>
  </>)
}

function fileIcon(ext: string): [React.ReactNode, string] {
  const e = ext.toLowerCase()
  if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg', '.ico'].includes(e)) return [<FileImage size={18} />, '#f59e0b']
  if (['.mp4', '.avi', '.mkv', '.mov', '.wmv', '.webm'].includes(e)) return [<Film size={18} />, '#3b82f6']
  if (['.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma'].includes(e)) return [<Music size={18} />, '#22c55e']
  if (['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz'].includes(e)) return [<Archive size={18} />, '#a855f7']
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.c', '.cpp', '.rs', '.go', '.rb', '.php', '.swift', '.kt'].includes(e)) return [<FileCode size={18} />, '#06b6d4']
  if (['.json', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg'].includes(e)) return [<FileCode size={18} />, '#6b7280']
  if (['.pdf'].includes(e)) return [<FileText size={18} />, '#ef4444']
  return [<FileText size={18} />, 'var(--text-muted)']
}

// ═══ 主侧边栏（纯文件浏览器） ═══
const Sidebar: React.FC = () => {
  const { folders, foldersLoaded, loadFolders, addFolder, removeFolder, attachFiles } = useAppStore()
  const [expandedFolder, setExpandedFolder] = useState<string | null>(null)
  const [folderContents, setFolderContents] = useState<FileItem[]>([])
  const [loadingDir, setLoadingDir] = useState(false)
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => { loadFolders() }, [loadFolders])

  const toggleExpand = useCallback(async (folder: FavoriteFolder) => {
    if (expandedFolder === folder.path) { setExpandedFolder(null); setFolderContents([]) }
    else { setExpandedFolder(folder.path); setLoadingDir(true); try { setFolderContents(await window.electronAPI.listDir(folder.path) || []) } catch { setFolderContents([]) } setLoadingDir(false) }
  }, [expandedFolder])

  const importFolderContents = useCallback(async (folder: FavoriteFolder) => {
    try { const items = await window.electronAPI.listDir(folder.path); if (items?.length) attachFiles([{ id: `folder-import-${Date.now()}`, name: `📁 ${folder.name} (${items.length} 项)`, path: folder.path, type: 'folder' as const, extension: '', size: items.reduce((s, i) => s + i.size, 0) }]) } catch {}
  }, [attachFiles])

  return (
    <FloatingPanel id="files"
      icon={<Menu size={24} style={{ color: 'var(--text-secondary)' }} />}
      title="文件浏览器"
      footer={
        <div className="pt-1.5 pb-2 border-t shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <button onClick={addFolder} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed hover:bg-black/5 dark:hover:bg-white/[0.05] transition-all text-xs" style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}><FolderPlus size={14} />添加文件夹</button>
        </div>
      }
    >
      <div className="p-2 space-y-0.5">
        {folders.map((folder, i) => (
          <div key={folder.id}>
            <motion.div className="flex items-center gap-2 px-2 py-2 rounded-xl cursor-pointer group"
              style={{ backgroundColor: expandedFolder === folder.path ? 'var(--border-subtle)' : 'transparent' }}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.03 }}
              onClick={() => toggleExpand(folder)}>
              <ChevronRight size={12} className={`transition-transform ${expandedFolder === folder.path ? 'rotate-90' : ''}`} style={{ color: 'var(--text-muted)' }} />
              {expandedFolder === folder.path ? <FolderOpen size={16} style={{ color: 'var(--accent)' }} /> : <Folder size={16} style={{ color: 'var(--accent)' }} />}
              <span className="flex-1 text-base truncate select-none" style={{ color: 'var(--text-primary)' }}>{folder.name}</span>
              <button onClick={(e) => { e.stopPropagation(); importFolderContents(folder) }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/[0.08]" title="导入全部文件到对话框"><ArrowRightToLine size={11} style={{ color: 'var(--accent)' }} /></button>
              <button onClick={(e) => { e.stopPropagation(); window.electronAPI.openFolder(folder.path) }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/[0.08]"><ExternalLink size={11} style={{ color: 'var(--text-muted)' }} /></button>
              <button onClick={(e) => { e.stopPropagation(); removeFolder(folder.id) }} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-black/5 dark:hover:bg-white/[0.08]"><X size={11} style={{ color: 'var(--text-muted)' }} /></button>
            </motion.div>
            <AnimatePresence>
              {expandedFolder === folder.path && (
                <motion.div className="ml-5 pl-3 border-l" style={{ borderColor: 'var(--border-subtle)' }} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  {loadingDir && <div className="flex items-center gap-2 py-2"><Loader size={12} className="animate-spin" style={{ color: 'var(--text-muted)' }} /><span className="text-xs" style={{ color: 'var(--text-muted)' }}>加载中...</span></div>}
                  {!loadingDir && folderContents.length === 0 && <p className="text-xs py-2" style={{ color: 'var(--text-muted)' }}>空目录</p>}
                  {folderContents.slice(0, 200).map(item => <FileRow key={item.path} item={item} depth={0} selected={selectedPath === item.path} onSelect={(path, ctrl) => { setSelectedPath(ctrl && selectedPath === path ? null : path) }} onRefresh={() => { setRefreshKey(k => k + 1); if (expandedFolder) window.electronAPI.listDir(expandedFolder).then(items => setFolderContents(items || [])) }} />)}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </FloatingPanel>
  )
}

export default Sidebar
