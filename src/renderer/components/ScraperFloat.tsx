import React from 'react'
import { Globe } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import WebScraper from './WebScraper'

const ScraperFloat: React.FC = () => (
  <FloatingPanel id="scraper"
    icon={<Globe size={22} style={{ color: 'var(--text-secondary)' }} />}
    title="网页抓取">
    <WebScraper />
  </FloatingPanel>
)
export default ScraperFloat
