/**
 * 网页抓取面板 — 输入 URL，自动提取链接、下载、解压
 */
import React, { useState, useCallback } from 'react'
import { Globe, Download, Link, Package, RefreshCw, ExternalLink } from 'lucide-react'

interface DownloadLink {
  url: string
  text: string
  type: 'direct' | 'pan' | 'magnet' | 'qr'
}

interface Step {
  text: string
  time: string
}

const WebScraper: React.FC = () => {
  const [url, setUrl] = useState('')
  const [links, setLinks] = useState<DownloadLink[]>([])
  const [steps, setSteps] = useState<Step[]>([])
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{
    downloads: { success: boolean; url: string; filePath?: string; error?: string }[]
    extracts: { success: boolean; outputDir?: string; error?: string }[]
  } | null>(null)

  const addStep = (text: string) => {
    setSteps(prev => [...prev, { text, time: new Date().toLocaleTimeString() }])
  }

  const handleScrape = useCallback(async () => {
    if (!url.trim()) return
    setLoading(true)
    setLinks([])
    setResults(null)
    setSteps([])

    try {
      addStep('正在抓取网页...')
      const result = await window.electronAPI.scrapePage(url)
      setLinks(result.links)
      addStep(`找到 ${result.links.length} 个下载链接`)
    } catch (e: any) {
      addStep(`❌ 抓取失败: ${e.message}`)
    }
    setLoading(false)
  }, [url])

  const handleDownloadAll = useCallback(async () => {
    if (!url.trim()) return
    setLoading(true)
    setSteps([])

    try {
      const result = await window.electronAPI.scrapeAndDownload(url)
      setLinks(result.links)
      setResults({
        downloads: result.downloads,
        extracts: result.extracts,
      })

      const ok = result.downloads.filter((d: any) => d.success).length
      addStep(`✅ 下载完成: ${ok}/${result.downloads.length} 成功`)
      result.extracts.forEach((e: any) => {
        addStep(e.success ? `📦 解压: ${e.outputDir}` : `❌ 解压失败: ${e.error}`)
      })
    } catch (e: any) {
      addStep(`❌ 失败: ${e.message}`)
    }
    setLoading(false)
  }, [url])

  const typeIcon = (t: string) => {
    switch (t) {
      case 'direct': return <Download size={11} style={{ color: '#22c55e' }} />
      case 'pan': return <Package size={11} style={{ color: '#f59e0b' }} />
      case 'magnet': return <Link size={11} style={{ color: '#3b82f6' }} />
      case 'qr': return <Globe size={11} style={{ color: '#a855f7' }} />
      default: return <Link size={11} />
    }
  }

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: 'var(--bg-panel)' }}>
      <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: 'var(--border-subtle)' }}>
        <div className="flex items-center gap-2">
          <Globe size={15} style={{ color: 'var(--accent)' }} />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>网页抓取</span>
        </div>
      </div>

      {/* URL Input */}
      <div className="p-2 flex gap-2">
        <input
          type="text"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleScrape()}
          placeholder="输入网页 URL..."
          disabled={loading}
          className="flex-1 px-2.5 py-1.5 rounded-lg border text-xs outline-none disabled:opacity-30"
          style={{
            borderColor: 'var(--border-glass)',
            backgroundColor: 'var(--bg-dialog)',
            color: 'var(--text-primary)',
          }}
        />
        <button
          onClick={handleScrape}
          disabled={loading || !url.trim()}
          className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-30"
          style={{ backgroundColor: 'var(--accent)', color: '#fff' }}
        >
          {loading ? <RefreshCw size={12} className="animate-spin" /> : '分析'}
        </button>
      </div>

      {/* Links */}
      {links.length > 0 && (
        <div className="flex-1 overflow-y-auto px-2">
          <div className="flex items-center justify-between mb-1 px-1">
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              找到 {links.length} 个链接
            </span>
            <button
              onClick={handleDownloadAll}
              disabled={loading}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors disabled:opacity-30"
              style={{ backgroundColor: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <Download size={10} /> 全部下载
            </button>
          </div>
          {links.map((l, i) => (
            <a
              key={i}
              href={l.url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs hover:bg-black/5 dark:hover:bg-white/[0.05] transition-colors"
              style={{ color: 'var(--text-secondary)' }}
            >
              {typeIcon(l.type)}
              <span className="flex-1 truncate">{l.text || l.url.slice(0, 60)}</span>
              <span className="text-[10px] px-1 py-0.5 rounded" style={{
                backgroundColor: 'var(--border-subtle)',
                color: 'var(--text-muted)',
              }}>{l.type}</span>
              <ExternalLink size={10} style={{ color: 'var(--text-muted)' }} />
            </a>
          ))}
        </div>
      )}

      {/* Steps log */}
      {steps.length > 0 && (
        <div className="max-h-[120px] overflow-y-auto px-2 pb-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-[10px] py-0.5">
              <span style={{ color: 'var(--text-muted)', width: 56 }}>{s.time}</span>
              <span style={{ color: 'var(--text-secondary)' }}>{s.text}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="p-2 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-2 text-xs">
            <span style={{ color: 'var(--text-primary)' }}>
              📥 {results.downloads.filter(d => d.success).length}/{results.downloads.length} 下载成功
            </span>
            <span style={{ color: 'var(--text-primary)' }}>
              📦 {results.extracts.filter(e => e.success).length}/{results.extracts.length} 解压成功
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export default WebScraper
