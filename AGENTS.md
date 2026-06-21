# NAVI 下载管道指令

## 概述
当用户提供网页链接需要下载资源时，按以下流程自主处理。不要硬编码步骤——每一步根据实际情况灵活调整。

## 可用资源

| 资源 | 路径 |
|------|------|
| Chrome Cookie | `H:\downloads\cookies.json` (格式: `{cookies: [{name,value,domain,...}]}`) |
| 下载目录 | `D:\百度网盘临时下载` |
| WinRAR | `C:\Users\Iris\Downloads\Winrar+小脚本3.2.1\Winrar\WinRAR.exe` |
| Playwright | `npx playwright` (已安装) |

## 处理流程

### Phase 1: 获取网页内容
- 用 `curl` 或 `webfetch` 抓取目标页面
- 必须携带 Cookie：从 `H:\downloads\cookies.json` 读取，按目标域名筛选
- 筛选规则：`c.domain.includes(domain)`（目标域名精确筛选，hxcy 和 baidu 分开）

### Phase 2: 信息提取
- **解压密码**: 正则 `/密码[：:]\s*([A-Za-z0-9\-_]{4,16})/g`，取最后一个匹配
- **百度提取码**: 正则 `/提取码[：:]\s*([A-Za-z0-9]{4})/`
- **QR码图片**: 从 HTML 中提取 `https://.../*.png|jpg|jpeg|webp` 链接（前5个）
- **百度盘链接**: `/s/([A-Za-z0-9_-]+)` 或 QR 解码结果

### Phase 3: QR 码解码
```bash
# 方式1: zbarimg (推荐，已安装)
zbarimg -q qr_image.png

# 方式2: node 脚本
node -e "const {PNG}=require('pngjs');const jsQR=require('jsqr').default;const png=PNG.sync.read(require('fs').readFileSync('qr.png'));console.log(jsQR(new Uint8ClampedArray(png.data),png.width,png.height)?.data||'')"
```

### Phase 4: 百度盘下载
用 Playwright 自动化：
1. 读取 `H:\downloads\cookies.json`，筛选 `domain.includes('baidu.com')` 的 cookie
2. 启动 chromium: `npx playwright chromium launch --headless`
3. 注入 cookie，导航到 `https://pan.baidu.com/s/{surl}`
4. 找密码输入框: `input[type="text"]`, `input[placeholder*="提取"]`, `input[placeholder*="密码"]`
5. 填入提取码，按 Enter
6. 等待页面加载（5秒），点击下载按钮：`a:has-text("下载")`, `span:has-text("下载")`
7. 监听 download 事件，保存到 `D:\百度网盘临时下载`

Playwright 关键代码模式：
```javascript
const { chromium } = require('playwright');
const cookies = JSON.parse(require('fs').readFileSync('H:/downloads/cookies.json','utf-8'))
  .cookies.filter(c => c.domain.includes('baidu.com'))
  .map(c => ({ name:c.name, value:c.value, domain:c.domain, path:c.path||'/', httpOnly:c.httpOnly||false, secure:c.secure||false, sameSite:'Lax' }));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport:{width:1280,height:900}, acceptDownloads:true, locale:'zh-CN' });
await context.addCookies(cookies);
const page = await context.newPage();
// 监听下载
page.on('download', async dl => { await dl.saveAs('D:/百度网盘临时下载/' + dl.suggestedFilename()); });
```

### Phase 5: 伪装文件检测
部分百度盘下载的文件是**伪装的 MP4**（MP4 头部 + ZIP 尾部）：
```bash
# 检测: 用 xxd 或 node 检查
node -e "
const fs=require('fs');const buf=fs.readFileSync(process.argv[1]);
const isMP4=buf[4]===0x66&&buf[5]===0x74&&buf[6]===0x79&&buf[7]===0x70;
let hasZIP=false;
for(let i=Math.max(0,buf.length-65536);i<buf.length-22;i++){
  if(buf[i]===0x50&&buf[i+1]===0x4B&&buf[i+2]===0x05&&buf[i+3]===0x06){hasZIP=true;break}
}
console.log(isMP4&&hasZIP?'DISGUISED':'normal');
" filename.mp4
```
如果是伪装文件：改名 `.mp4` → `.zip`

### Phase 6: 解压
密码尝试顺序（按优先级）：
1. 从网页提取到的 `archivePassword`
2. `yejiang`
3. `FLYYZ`
4. `smbd`

```bash
# WinRAR 解压
"C:\Users\Iris\Downloads\Winrar+小脚本3.2.1\Winrar\WinRAR.exe" x "文件.zip" "输出目录\\" -p密码 -y

# 7z 备用
7z x "文件.zip" -o"输出目录" -p密码 -y

# Node.js 备用 (仅 zip)
node -e "const z=require('7zip-min');z.unpack('文件.zip','输出目录',err=>{})"
```

解压后递归检查：如果解压目录里还有 `.zip/.rar/.7z`，继续解压，直到只剩非压缩文件。

### Phase 7: 验证码处理
如果 Playwright 遇到验证码：
```bash
# 截图后用 tesseract OCR 识别
node -e "
const {createWorker}=require('tesseract.js');
const w=await createWorker('eng');
const r=await w.recognize('captcha.png');
console.log(r.data.text);
await w.terminate();
"
```

## 错误处理策略

| 问题 | 对策 |
|------|------|
| Cookie 过期 | 提示用户重新导出 Chrome cookie |
| 百度要求登录 | 切换 headless:false，让用户手动扫码 |
| 验证码 | tesseract OCR 自动识别，失败则截图让用户输入 |
| 下载超时 | 增加 playwright 等待时间 |
| 解压密码错误 | 遍历密码列表，全部失败则重新抓取页面分析 |
| QR 解码失败 | 下载图片 → 检查图片是否完整 → 重试 |
| 伪装文件但无 ZIP 尾 | 用 `file` 命令检测真实格式 |

## 规则
- 每一步输出具体结果（文件路径、大小、解压结果）
- 遇到失败不要终止，分析原因后尝试替代方案
- 所有下载和解压操作限定在 `D:\百度网盘临时下载` 目录内
