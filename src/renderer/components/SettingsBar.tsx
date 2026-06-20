import React, { useEffect, useState, useRef } from 'react'
import { Brain, Zap, Lightbulb, ChevronDown } from 'lucide-react'

const Select: React.FC<{
  icon: React.ReactNode
  value: string
  options: string[]
  onChange: (v: string) => void
}> = ({ icon, value, options, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-150"
        style={{
          borderColor: 'var(--border-glass)',
          backgroundColor: 'var(--bg-dialog)',
          color: 'var(--text-primary)'
        }}>
        {icon}
        <span className="max-w-[150px] truncate">{value}</span>
        <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
      </button>
      {open && (
        <div
          className="absolute bottom-full left-0 mb-1 rounded-lg border shadow-lg py-1 z-[100] min-w-[140px] max-h-[240px] overflow-y-auto"
          style={{
            backgroundColor: 'var(--bg-panel)',
            borderColor: 'var(--border-glass)',
            boxShadow: '0 8px 30px rgba(0,0,0,0.3)'
          }}>
          {options.map(o => (
            <button
              key={o}
              onClick={() => { onChange(o); setOpen(false) }}
              className="w-full text-left px-3 py-2 text-sm transition-colors hover:bg-black/5 dark:hover:bg-white/[0.05]"
              style={{
                color: o === value ? 'var(--accent)' : 'var(--text-secondary)',
                backgroundColor: o === value ? 'var(--accent-light)' : 'transparent'
              }}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const SettingsBar: React.FC = () => {
  const [config, setConfig] = useState<any>(null)

  useEffect(() => {
    window.electronAPI.getConfig().then(c => {
      const claude = c?.claude || {}
      const profs = claude.profiles || []
      const idx = claude.activeProfile ?? 0
      const active = profs[idx] || profs[0] || {}

      setConfig({
        ...active,
        availableModels: ['deepseek-v4-pro[1m]', 'deepseek-v4-flash'],
        availableEfforts: ['low', 'medium', 'high', 'xhigh', 'max']
      })
    }).catch(() => {})
  }, [])

  if (!config) return null

  // DeepSeek 模型强制开启 thinking，其他模型可切换
  const isThinkMandatory = (config.model || '').includes('deepseek')
  const thinkingOn = isThinkMandatory || config.thinking

  const set = async (key: string, val: any) => {
    const next = { ...config, [key]: val }
    setConfig(next)
    try {
      await window.electronAPI.updateProfileField(key, val)
      console.log('[Settings] updated:', key, '=', val)
    } catch (e) {
      console.error('[Settings] update failed:', e)
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-[6px] pb-3 flex items-center justify-center gap-3 flex-wrap">
      {/* 模型 */}
      <Select
        icon={<Brain size={16} style={{ color: 'var(--accent)' }} />}
        value={config.model}
        options={config.availableModels || ['deepseek-v4-pro']}
        onChange={v => set('model', v)}
      />

      {/* Thinking — DeepSeek 强制开启，锁定 */}
      <button
        onClick={() => { if (!isThinkMandatory) set('thinking', !config.thinking) }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-150"
        style={{
          borderColor: thinkingOn ? 'var(--accent)' : 'var(--border-glass)',
          backgroundColor: thinkingOn ? 'var(--accent-light)' : 'var(--bg-dialog)',
          color: thinkingOn ? 'var(--accent)' : 'var(--text-muted)',
          cursor: isThinkMandatory ? 'default' : 'pointer'
        }}>
        <Lightbulb size={16} />
        {isThinkMandatory ? '思考 🔒' : thinkingOn ? '思考 ✓' : '思考'}
      </button>

      {/* Effort */}
      <Select
        icon={<Zap size={16} style={{ color: '#f59e0b' }} />}
        value={config.effort}
        options={config.availableEfforts || ['medium']}
        onChange={v => set('effort', v)}
      />
    </div>
  )
}

export default SettingsBar
