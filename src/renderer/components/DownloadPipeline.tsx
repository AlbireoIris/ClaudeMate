/**
 * 下载管道面板 — 一键从网页到解压完成
 */
import React, { useState, useCallback, useEffect } from 'react'
import { Download, Loader, CheckCircle, XCircle, Clock, Play, FileText } from 'lucide-react'

interface Step {
  id: string; status: string; message: string; data?: any
}

const stepLabel: Record<string, string> = {
  'parse-page': '解析网页',
  'qr-decode': 'QR码解码',
  'baidu-download': '百度盘下载',
  'extract': '解压文件',
}

const DownloadPipeline: React.FC = () => {
  const [url, setUrl] = useState('https://hxcy.top/634305.html')
  const [steps, setSteps] = useState<Step[]>([])
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    const cleanup = window.electronAPI.onPipelineStep((step: Step) => {
      setSteps(prev => {
        const idx = prev.findIndex(s => s.id === step.id)
        if (idx >= 0) {
          const next = [...prev]
          next[idx] = step
          return next
        }
        return [...prev, step]
      })
    })
    return cleanup
  }, [])

  const handleRun = useCallback(async () => {
    if (!url.trim() || running) return
    setRunning(true)
    setSteps([])
    setResult(null)
    try {
      const res = await window.electronAPI.runDownloadPipeline(url)
      setResult(res)
    } catch (e: any) {
      setResult({ success: false, error: e.message })
    }
    setRunning(false)
  }, [url, running])

  const statusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader size={12} className="animate-spin" style={{ color: '#f59e0b' }} />
      case 'done': return <CheckCircle size={12} style={{ color: '#22c55e' }} />
      case 'error': return <XCircle size={12} style={{ color: '#ef4444' }} />
      default: return <Clock size={12} style={{ color: 'var(--text-muted)' }} />
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-panel)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Download size={14} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>下载管道</span>
        </div>
      </div>

      {/* URL Input */}
      <div className="p-2 flex gap-2">
        <input
          type="text" value={url} onChange={e => setUrl(e.target.value)}
          disabled={running}
          placeholder="网页 URL..."
          className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none disabled:opacity-30"
          style={{ borderColor: 'var(--border-glass)', backgroundColor: 'var(--bg-dialog)', color: 'var(--text-primary)' }}
        />
        <button onClick={handleRun} disabled={running || !url.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30 flex items-center gap-1"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {running ? <Loader size={12} className="animate-spin" /> : <Play size={12} />}
          启动
        </button>
      </div>

      {/* Steps */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {steps.length === 0 && !running && (
          <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>输入网页URL，一键自动下载+解压</p>
        )}
        {steps.map(s => (
          <div key={s.id} className="flex items-start gap-2 p-2 rounded-lg" style={{
            backgroundColor: s.status === 'running' ? 'var(--accent-light)' : 'var(--bg-dialog)',
          }}>
            <div className="mt-0.5">{statusIcon(s.status)}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                  {stepLabel[s.id] || s.id}
                </span>
                <span className="text-[10px] px-1 py-0.5 rounded" style={{
                  backgroundColor: s.status === 'done' ? 'rgba(34,197,94,0.15)' : s.status === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
                  color: s.status === 'done' ? '#22c55e' : s.status === 'error' ? '#ef4444' : '#f59e0b',
                }}>{s.status}</span>
              </div>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-secondary)' }}>{s.message}</p>
              {s.data?.baiduLink && <p className="text-[10px] truncate" style={{ color: 'var(--accent)' }}>🔗 {s.data.baiduLink.slice(0, 80)}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* Result */}
      {result && (
        <div className="p-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 mb-1">
            {result.success
              ? <CheckCircle size={12} style={{ color: '#22c55e' }} />
              : <XCircle size={12} style={{ color: '#ef4444' }} />}
            <span className="text-xs" style={{ color: 'var(--text-primary)' }}>
              {result.success ? `${result.finalFiles?.length || 0} 个文件` : '失败'}
            </span>
          </div>
          {result.finalFiles?.map((f: string, i: number) => (
            <div key={i} className="flex items-center gap-1 text-[10px] py-0.5" style={{ color: 'var(--text-secondary)' }}>
              <FileText size={9} />
              <span className="truncate">{f.split('\\').pop()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default DownloadPipeline
