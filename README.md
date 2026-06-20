# ClaudeMate

> 基于 Electron + React 的 Windows 桌面 AI 文件助手，支持拖放操作、文件管理，通过 DeepSeek API 代理调用 Claude 模型。

## 功能

- **AI 对话** — 输入自然语言指令，由 Claude 模型分析处理
- **文件拖放** — 从 Windows 资源管理器拖入文件，或从侧边栏推送
- **文件浏览器** — 展开文件夹浏览，右键菜单支持打开/重命名/删除/复制路径
- **快捷操作** — 文件压缩 (gzip)、解压、按类型分类整理、内容分析
- **模型切换** — 底部面板切换模型、Effort 级别、Thinking 模式
- **明暗主题** — 支持浅色/深色切换
- **窗口控制** — 无边框窗口，自定义标题栏按钮

## 界面

```
┌──────────────────────────────────────┐
│  ClaudeMate      🌙 ─ ☐ ✕│
├──────────────────────────────────────┤
│ ☰                                    │
│         ClaudeMate        │
│         你的桌面智能文件助手            │
│                                      │
│  [📎 选文件] [输入指令...]     [➤]   │
│                                      │
│  🧠 [v4-pro ▼]  💡 思考  ⚡ [max ▼] │
└──────────────────────────────────────┘
```

## 前置要求

| 依赖 | 说明 |
|------|------|
| **Node.js** | ≥18.0.0 |
| **npm** | ≥9.0.0 |
| **Claude Code** | 全局安装 `@anthropic-ai/claude-code`（提供 API 配置） |

### 1. 配置 Claude Code（最重要）

本应用依赖 Claude Code 的配置文件来连接 AI 服务。你需要先安装并配置 Claude Code CLI：

```bash
npm install -g @anthropic-ai/claude-code
```

配置通过 `~/.claude/settings.json` 进行。如果你使用 DeepSeek 代理（推荐国内用户），配置文件应包含：

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.deepseek.com/anthropic",
    "ANTHROPIC_AUTH_TOKEN": "你的DeepSeek API Key",
    "ANTHROPIC_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "deepseek-v4-pro[1m]",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "deepseek-v4-flash"
  },
  "permissions": {
    "defaultMode": "bypassPermissions"
  }
}
```

**关键字段说明**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `ANTHROPIC_BASE_URL` | API 端点地址 | DeepSeek: `https://api.deepseek.com/anthropic` |
| `ANTHROPIC_AUTH_TOKEN` | API 密钥 | `sk-xxxxxxxx` |
| `ANTHROPIC_MODEL` | 默认模型 | `deepseek-v4-pro[1m]` |

> 如果直接使用 Anthropic 官方 API，将 `ANTHROPIC_BASE_URL` 设为 `https://api.anthropic.com`，`ANTHROPIC_AUTH_TOKEN` 为 Anthropic API Key。

### 2. 支持的模型

| 模型 | Thinking |
|------|:--:|
| `deepseek-v4-pro[1m]` | 可开关 |
| `deepseek-v4-flash` | 可开关 |

Effort 级别：`low` / `medium` / `high` / `xhigh` / `max`

## 安装与运行

```bash
# 克隆仓库
git clone https://github.com/AlbireoIris/ClaudeMate.git
cd ClaudeMate

# 安装依赖
npm install

# 启动开发模式
npm run dev

# 构建生产包
npm run build
```

> **注意**：`npm install` 后 Electron 可能下载失败（国内网络），如遇此问题请手动设置镜像：
> ```bash
> ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" npm install
> ```
> 若 Electron postinstall 仍失败，可手动下载后解压到 `node_modules/electron/dist/`，并创建 `node_modules/electron/path.txt` 写入 `electron.exe`。

## 技术栈

| 层面 | 技术 |
|------|------|
| 桌面框架 | Electron 31 |
| 构建工具 | electron-vite |
| UI 框架 | React 18 + TypeScript |
| 样式 | TailwindCSS 3 + CSS 变量 |
| 状态管理 | Zustand |
| AI SDK | @anthropic-ai/sdk |
| 图标 | Lucide React |
| 动画 | Framer Motion |

## 项目结构

```
src/
├── main/           # Electron 主进程
│   ├── index.ts        # 窗口创建
│   ├── ipc-handlers.ts # IPC 通道
│   ├── claude-cli.ts   # AI API 调用
│   ├── file-system.ts  # 文件操作
│   └── settings.ts     # 配置持久化
├── preload/        # 预加载脚本
│   └── index.ts
└── renderer/       # React UI
    ├── App.tsx
    ├── components/
    │   ├── Toolbar.tsx
    │   ├── MainArea.tsx
    │   ├── Sidebar.tsx
    │   ├── SettingsBar.tsx
    │   ├── StatusBar.tsx
    │   └── common/
    └── stores/
        ├── themeStore.ts
        ├── taskStore.ts
        └── appStore.ts
```

## 快捷键

| 操作 | 方式 |
|------|------|
| 发送消息 | Enter |
| 选择文件 | 点击 📎 或拖放到窗口 |
| 切换侧边栏 | 点击 ☰ 按钮 |
| 双击文件 | 默认程序打开 |
| 右键文件 | 弹出操作菜单 |

## 故障排除

| 问题 | 原因 | 解决 |
|------|------|------|
| 白屏/空白窗口 | preload 加载失败 | 确认 `node_modules/electron/dist/` 下存在 `electron.exe` |
| 发送消息无回复 | `~/.claude/settings.json` 未配置 | 检查 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL` 是否正确 |
| 关闭按钮无响应 | 主进程 IPC 未注册 | 重启应用，确认终端无报错 |
| API 返回空 | 模型名无效 | 仅支持 `deepseek-v4-pro[1m]` 和 `deepseek-v4-flash` |
| 文件浏览器为空 | 未添加文件夹 | 点击侧边栏「添加文件夹」按钮 |
| 端口占用 | Vite dev server 冲突 | 应用会自动换端口，或手动杀掉占用进程 |

## License

MIT
