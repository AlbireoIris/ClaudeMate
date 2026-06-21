import React from 'react'
import { Smartphone } from 'lucide-react'
import FloatingPanel from './FloatingPanel'
import AdbPanel from './AdbPanel'

const AdbFloat: React.FC = () => (
  <FloatingPanel id="adb"
    icon={<Smartphone size={22} style={{ color: 'var(--text-secondary)' }} />}
    title="ADB 设备">
    <AdbPanel />
  </FloatingPanel>
)
export default AdbFloat
