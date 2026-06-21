import React from 'react'
import { Sun, Moon, Minus, Square, X } from 'lucide-react'
import { useThemeStore } from '../stores/themeStore'
import logo from '../assets/logo.png'

const Toolbar: React.FC = () => {
  const { theme, toggle } = useThemeStore()
  const isDark = theme === 'dark'
  const hoverBg = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'

  return (
    <header
      className="flex items-center justify-between h-10 px-4 shrink-0 border-b"
      style={{
        backgroundColor: 'var(--bg-panel)',
        borderColor: 'var(--border-subtle)',
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
    >
      <div className="flex items-center gap-2.5">
        <img src={logo} alt="NAVI" className="w-5 h-5 rounded-md shrink-0" />
        <span className="text-xs font-medium tracking-wide" style={{ color: 'var(--text-secondary)' }}>
          NAVI
        </span>
      </div>

      <div className="flex items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <Btn icon={isDark ? <Sun size={14} /> : <Moon size={14} />} onClick={toggle} hoverBg={hoverBg} color="var(--text-secondary)" />
        <div className="w-px h-4 mx-1.5" style={{ backgroundColor: 'var(--border-subtle)' }} />
        <Btn icon={<Minus size={13} />} onClick={() => window.electronAPI.minimize()} hoverBg={hoverBg} color="var(--text-secondary)" />
        <Btn icon={<Square size={12} />} onClick={() => window.electronAPI.maximize()} hoverBg={hoverBg} color="var(--text-secondary)" />
        <Btn icon={<X size={13} />} onClick={() => window.electronAPI.close()} hoverBg="rgba(239,68,68,0.6)" hoverColor="#fff" color="var(--text-secondary)" />
      </div>
    </header>
  )
}

/** 最小按钮组件 */
const Btn: React.FC<{
  icon: React.ReactNode
  onClick: () => void
  hoverBg: string
  color: string
  hoverColor?: string
}> = ({ icon, onClick, hoverBg, color, hoverColor }) => {
  const [hover, setHover] = React.useState(false)
  const bg = hover ? hoverBg : 'transparent'
  const fg = hover && hoverColor ? hoverColor : color
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="p-1.5 rounded-lg transition-colors cursor-pointer"
      style={{ backgroundColor: bg, color: fg }}
    >
      {icon}
    </button>
  )
}

export default Toolbar
