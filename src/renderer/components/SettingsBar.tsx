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
          className="absolute bottom-full left-0 mb-1 rounded-lg border shadow-lg py-1 z-[100] min-w-[140px]"
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
    window.electronAPI.getClaudeConfig().then(c => {
      console.log('[Settings] loaded:', c)
      setConfig(c)
    }).catch(() => {})
  }, [])

  if (!config) return null

  const mandatoryModels = config.thinkingMandatoryModels || []
  const isMandatory = mandatoryModels.includes(config.model)

  const set = (key: string, val: any) => {
    const next = { ...config, [key]: val }
    // 切换模型时，自动设置 thinking 状态
    if (key === 'model' && mandatoryModels.includes(val)) {
      next.thinking = true
    }
    setConfig(next)
    window.electronAPI.setAppConfig({ model: next.model, effort: next.effort, thinking: next.thinking })
    console.log('[Settings] updated:', key, '=', val, '→ full:', { model: next.model, effort: next.effort, thinking: next.thinking })
  }

  return (
    <div className="max-w-3xl mx-auto px-4 pt-[6px] pb-3 flex items-center gap-3 flex-wrap">
      {/* 模型 */}
      <Select
        icon={<Brain size={16} style={{ color: 'var(--accent)' }} />}
        value={config.model}
        options={config.availableModels || ['deepseek-v4-pro']}
        onChange={v => set('model', v)}
      />

      {/* 思考模式 */}
      <button
        onClick={() => { if (!isMandatory) set('thinking', !config.thinking) }}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all duration-150"
        style={{
          borderColor: config.thinking ? 'var(--accent)' : 'var(--border-glass)',
          backgroundColor: config.thinking ? 'var(--accent-light)' : 'var(--bg-dialog)',
          color: config.thinking ? 'var(--accent)' : 'var(--text-muted)',
          cursor: isMandatory ? 'default' : 'pointer',
          opacity: isMandatory ? 1 : undefined
        }}>
        <Lightbulb size={16} />
        思考{isMandatory ? ' 🔒' : config.thinking ? ' ✓' : ''}
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
