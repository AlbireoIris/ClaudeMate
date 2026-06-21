import React from 'react'
import { Download } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import DownloadPipeline from './DownloadPipeline'

const PipelineFloat: React.FC = () => (
  <FloatingPanel id="pipeline"
    icon={<Download size={22} style={{ color: 'var(--text-secondary)' }} />}
    title="下载管道">
    <DownloadPipeline />
  </FloatingPanel>
)
export default PipelineFloat
