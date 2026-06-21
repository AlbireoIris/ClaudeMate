/**
 * 范式驱动下载 — 纯 GUI 操作
 *   node test-paradigm-dl.cjs
 */
const { _electron: electron } = require('playwright')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const APP_DIR = __dirname
const MAIN_ENTRY = path.join(APP_DIR, 'out', 'main', 'index.js')
const ELECTRON_BIN = require('electron')

// ═══ 下载专用范式 ═══
const DL_PARADIGM = {
  name: '下载管道流程',
  nodes: [
    { kind: 'input',   question: '目标网页是什么？有什么资源可用？', guidance: '确认URL、Cookie文件路径(H:/downloads/cookies.json)、已知的提取码和surl。列出所有已知信息。', label: '输入' },
    { kind: 'observe', question: '网页返回了什么内容？', guidance: '用curl+筛选后的Cookie抓取网页。检查HTTP状态码。分析页面内容：提取密码字段、寻找二维码图片链接、提取百度盘链接和提取码。', label: '观察' },
    { kind: 'decide',  question: '页面中有二维码还是直接的百度盘链接？', guidance: '有二维码→下载图片用zbarimg解码。有直接链接→提取surl和pwd。都没有→报告无法处理。', label: '决策' },
    { kind: 'act',     question: '如何获取百度盘中的文件？', guidance: '使用Playwright：注入百度Cookie→打开pan.baidu.com/s/{surl}→填写提取码→点击下载→保存到D:/百度网盘临时下载。如果需要QR解码：先下载图片，用zbarimg或jsQR解码。', label: '执行' },
    { kind: 'reflect', question: '下载完成了吗？文件是什么格式？', guidance: '检查：文件是否完整下载？检查文件头判断是否为伪装文件(MP4头+ZIP尾)。伪装→改名.zip。正常文件→直接处理。', label: '反思' },
    { kind: 'decide',  question: '需要解压吗？', guidance: '检查文件是否为压缩包(.zip/.rar/.7z)或伪装文件。需要解压→使用WinRAR按密码列表尝试(archivePassword→yejiang→FLYYZ→smbd)。不需要→直接汇报。', label: '决策' },
    { kind: 'act',     question: '如何解压？', guidance: 'WinRAR: "C:/Users/Iris/Downloads/Winrar+小脚本3.2.1/Winrar/WinRAR.exe" x 文件.zip 输出目录\\ -p密码 -y。递归解压直到没有压缩包为止。', label: '执行' },
    { kind: 'reflect', question: '所有步骤完成了吗？', guidance: '检查：所有文件已解压？最终输出目录中有哪些文件？汇总文件列表和路径，汇报给用户。', label: '反思' },
  ],
}

async function main() {
  try { execSync('taskkill //F //IM electron.exe', { stdio: 'ignore' }) } catch {}
  try { execSync('taskkill //F //IM opencode-engine.exe', { stdio: 'ignore' }) } catch {}
  await new Promise(r => setTimeout(r, 2000))

  // 写范式文件
  fs.writeFileSync(path.join(APP_DIR, 'config', 'paradigm.json'), JSON.stringify(DL_PARADIGM, null, 2))
  console.log('Paradigm saved: ' + DL_PARADIGM.nodes.length + ' nodes\n')

  // 启动应用
  const app = await electron.launch({
    args: [MAIN_ENTRY], executablePath: ELECTRON_BIN,
    env: { ...process.env, NODE_ENV: 'development' },
  })
  const win = await app.firstWindow()
  await win.waitForLoadState('domcontentloaded')
  await new Promise(r => setTimeout(r, 4000))

  console.log('=== Step 1: 发送下载指令 ===')
  const input = win.locator('input[type="text"]').first()
  // 用已知的测试URL
  const testUrl = 'https://hxcy.top/634305.html'
  const cmd = `处理这个网页的下载: ${testUrl}。已知surl=1lc98wHXZv7o9CbLISQYfMA, 提取码=smbd。Cookie在H:/downloads/cookies.json。按范式逐步执行并汇报。`
  await input.fill(cmd)
  await input.press('Enter')
  console.log('Sent: ' + cmd.slice(0, 100) + '...')
  console.log('')

  // 监控 AI 回复
  console.log('=== AI 回复监控 (每15秒检查, 最多10分钟) ===')
  const seen = new Set()
  for (let round = 0; round < 40; round++) {
    await new Promise(r => setTimeout(r, 15000))
    const bubbles = win.locator('.justify-end .whitespace-pre-wrap')
    const count = await bubbles.count()
    if (count === 0) { console.log(`[${new Date().toLocaleTimeString()}] 等待AI回复...`); continue }
    for (let i = count - 1; i >= Math.max(0, count - 3); i--) {
      const text = (await bubbles.nth(i).textContent()) || ''
      const preview = text.slice(0, 200)
      if (!seen.has(preview) && preview.length > 5) {
        seen.add(preview)
        console.log(`[${new Date().toLocaleTimeString()}] ${preview}`)
        console.log('---')
      }
    }
    const lastText = count > 0 ? (await bubbles.nth(count - 1).textContent()) || '' : ''
    if (lastText.includes('完成') || lastText.includes('汇总') || lastText.includes('结果')) {
      console.log('\n✅ 流程可能已完成')
      break
    }
  }

  // 清理
  try { fs.unlinkSync(path.join(APP_DIR, 'config', 'paradigm.json')) } catch {}
  await app.close()
  console.log('\nDone')
  process.exit(0)
}
main().catch(async e => { console.error(e.message); process.exit(1) })
