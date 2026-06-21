import React, { useState, useEffect } from 'react'
import { Shield, X, FolderOpen, Eye, EyeOff, PenLine, PenOff, Plus } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import { useDenyStore } from '../stores/denyStore'

const DenyPanel: React.FC = () => {
  const { rules, loaded, loadRules, addRule, removeRule, updateRule } = useDenyStore()
  useEffect(() => { loadRules() }, [loadRules])

  const toggleRead = (id: string, current: boolean) => updateRule(id, { denyRead: !current })
  const toggleWrite = (id: string, current: boolean) => updateRule(id, { denyWrite: !current })

  const handleAddFolder = async () => {
    try {
      const folderPath = await window.electronAPI.openFolderDialog()
      if (folderPath) await addRule(folderPath, true, true)
    } catch (e) { console.error('[DenyPanel]', e) }
  }

  return (
    <FloatingPanel id="deny"
      icon={<Shield size={22} style={{ color: rules.length > 0 ? 'var(--danger)' : 'var(--text-secondary)' }} />}
      title="访问控制"
      badge={rules.length || undefined}
      badgeColor="var(--danger)"
      footer={
        <div className="pt-1.5 pb-2 border-t shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <button onClick={handleAddFolder}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed hover:bg-black/5 dark:hover:bg-white/[0.05] transition-all text-xs"
            style={{ borderColor: 'var(--border-glass)', color: 'var(--text-muted)' }}>
            <Plus size={14} />添加禁入文件夹
          </button>
        </div>
      }
    >
      <div className="p-2 space-y-2">
        {rules.length === 0 && loaded && (
          <div className="flex flex-col items-center justify-center py-8 text-center gap-2 px-4">
            <Shield size={28} style={{ color: 'var(--text-muted)' }} />
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>尚未设置禁入规则<br />默认允许访问所有文件夹</p>
          </div>
        )}
        {rules.map(rule => (
          <div key={rule.id} className="rounded-xl border p-3 space-y-2"
            style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-dialog)' }}>
            <div className="flex items-center gap-2">
              <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
              <span className="text-xs truncate flex-1" style={{ color: 'var(--text-primary)' }} title={rule.path}>{rule.path}</span>
              <button onClick={() => removeRule(rule.id)} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/[0.08] shrink-0">
                <X size={12} style={{ color: 'var(--text-muted)' }} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleRead(rule.id, rule.denyRead)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: rule.denyRead ? 'var(--danger)' : 'rgba(34,197,94,0.15)', color: rule.denyRead ? '#fff' : 'var(--success)', border: rule.denyRead ? 'none' : '1px solid var(--success)' }}>
                {rule.denyRead ? <EyeOff size={12} /> : <Eye size={12} />}
                读取{rule.denyRead ? '已禁' : '允许'}
              </button>
              <button onClick={() => toggleWrite(rule.id, rule.denyWrite)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                style={{ backgroundColor: rule.denyWrite ? 'var(--danger)' : 'rgba(34,197,94,0.15)', color: rule.denyWrite ? '#fff' : 'var(--success)', border: rule.denyWrite ? 'none' : '1px solid var(--success)' }}>
                {rule.denyWrite ? <PenOff size={12} /> : <PenLine size={12} />}
                写入{rule.denyWrite ? '已禁' : '允许'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </FloatingPanel>
  )
}

export default DenyPanel
