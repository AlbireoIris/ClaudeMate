/**
 * ADB 设备面板 — 显示设备列表、截图、OCR 识别
 */
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { Smartphone, Camera, Scan, MousePointer, RefreshCw, ChevronDown } from 'lucide-react'

interface Device {
  serial: string
  model: string
  state: string
  resolution: string
}

interface OcrLine {
  text: string
  confidence: number
}

const AdbPanel: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [screenshot, setScreenshot] = useState<string | null>(null)
  const [ocrLines, setOcrLines] = useState<OcrLine[]>([])
  const [loading, setLoading] = useState(false)
  const [tesseractOk, setTesseractOk] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const refreshDevices = useCallback(async () => {
    try {
      const list = await window.electronAPI.listAdbDevices()
      setDevices(list || [])
      if (list?.length && !selected) setSelected(list[0].serial)
    } catch { setDevices([]) }
  }, [selected])

  useEffect(() => { refreshDevices() }, [refreshDevices])

  useEffect(() => {
    window.electronAPI.adbTesseractAvailable().then(setTesseractOk)
  }, [])

  const takeScreenshot = async (serial: string) => {
    setLoading(true)
    try {
      const result = await window.electronAPI.adbScreenshot(serial)
      if (result) {
        setScreenshot(result.base64)
        // OCR
        if (tesseractOk) {
          const lines = await window.electronAPI.adbOcr(result.path)
          setOcrLines(lines || [])
        }
      }
    } catch {}
    setLoading(false)
  }

  const handleTap = async (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!selected || !canvasRef.current) return
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = canvasRef.current.width / rect.width
    const scaleY = canvasRef.current.height / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    await window.electronAPI.adbTap(selected, x, y)
    setTimeout(() => takeScreenshot(selected), 500)
  }

  const device = devices.find(d => d.serial === selected)

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-panel)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Smartphone size={15} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>ADB 设备</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
            {tesseractOk ? 'OCR ✅' : 'OCR ❌'}
          </span>
          <button onClick={refreshDevices} className="p-1 rounded hover:bg-black/5 dark:hover:bg-white/[0.08]">
            <RefreshCw size={12} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>
      </div>

      {/* Device selector */}
      {devices.length > 0 && (
        <div className="px-2 pt-2">
          <div className="relative">
            <select
              value={selected || ''}
              onChange={e => setSelected(e.target.value)}
              className="w-full px-2 py-1.5 rounded-lg text-xs border appearance-none"
              style={{
                borderColor: 'var(--border-glass)',
                backgroundColor: 'var(--bg-dialog)',
                color: 'var(--text-primary)',
              }}
            >
              {devices.map(d => (
                <option key={d.serial} value={d.serial}>
                  {d.model} ({d.serial.slice(0, 16)}) - {d.resolution}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: 'var(--text-muted)' }} />
          </div>
        </div>
      )}

      {/* Screenshot area */}
      <div className="flex-1 overflow-hidden relative m-2 rounded-xl border" style={{ borderColor: 'var(--border-glass)' }}>
        {!screenshot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <Camera size={28} style={{ color: 'var(--text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {devices.length === 0 ? '未连接设备' : '点击下方按钮截图'}
            </span>
          </div>
        )}

        {screenshot && (
          <canvas
            ref={canvasRef}
            onClick={handleTap}
            className="w-full h-full object-contain cursor-crosshair"
            style={{ imageRendering: 'pixelated' }}
          />
        )}

        {/* Screenshot image (hidden, used to draw on canvas) */}
        {screenshot && (
          <img
            src={`data:image/png;base64,${screenshot}`}
            onLoad={(e) => {
              const img = e.currentTarget
              const canvas = canvasRef.current
              if (!canvas) return
              canvas.width = img.naturalWidth
              canvas.height = img.naturalHeight
              const ctx = canvas.getContext('2d')
              if (ctx) ctx.drawImage(img, 0, 0)
            }}
            className="hidden"
            alt="screenshot"
          />
        )}
      </div>

      {/* OCR results */}
      {ocrLines.length > 0 && (
        <div className="px-2 pb-2 max-h-[120px] overflow-y-auto">
          <div className="flex items-center gap-1 mb-1">
            <Scan size={10} style={{ color: 'var(--accent)' }} />
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>OCR 识别</span>
          </div>
          {ocrLines.map((l, i) => (
            <div key={i} className="flex items-center gap-2 text-xs py-0.5">
              <span className="text-[10px] w-8 shrink-0" style={{ color: 'var(--text-muted)' }}>
                {l.confidence}%
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{l.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="p-2 border-t flex items-center gap-2" style={{ borderColor: 'var(--border-subtle)' }}>
        <button
          onClick={() => selected && takeScreenshot(selected)}
          disabled={!selected || loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {loading ? <RefreshCw size={12} className="animate-spin" /> : <Camera size={12} />}
          截图{loading ? '中...' : ''}
        </button>
        <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
          {device ? `${device.model} · ${device.resolution}` : '选择设备后开始'}
        </span>
      </div>
    </div>
  )
}

export default AdbPanel
