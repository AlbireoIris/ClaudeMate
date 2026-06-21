import React from 'react'
import { MessageSquare } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import SessionHistory from './SessionHistory'

const HistoryFloat: React.FC = () => (
  <FloatingPanel id="history"
    icon={<MessageSquare size={22} style={{ color: 'var(--text-secondary)' }} />}
    title="会话历史">
    <SessionHistory onRestore={(s: any) => { if ((window as any).__restoreSession && s.messages) (window as any).__restoreSession(s.messages) }} onClose={() => {}} />
  </FloatingPanel>
)
export default HistoryFloat
