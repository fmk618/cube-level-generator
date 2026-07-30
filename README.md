# cube-level-generator

桌面端魔方关卡内容生产工具。用三个页面完成关卡数据联调：

1. **关卡编辑** — 管理章节与关卡、编辑旋转/指引公式、预览 3D 起终态
2. **技能编辑** — 维护 CFOP 技能树（阶段、目标、掌握标准）
3. **关卡映射** — 把关卡挂到技能，并设置教学模式与难度

可选接入通义千问（DashScope）生成公式候选；首次启动提供新手引导（也可从「帮助 → 新手引导」重看）。

---

## 功能特性

- **关卡目录** — 章节 CRUD、关卡排序/复制/隐藏、搜索与筛选、导入导出 JSON
- **关卡编辑器** — 基础信息、旋转公式（F2L / OLL / PLL）、亮度掩码、指引解法校验
- **3D 预览** — 基于 Three.js 实时预览初始态与目标态
- **技能编辑** — 按 CFOP 阶段筛选/新建/编辑技能，保存运行时草稿与导出技能树
- **关卡映射** — 单卡或批量把关卡关联到技能，配置引导/挑战/演示模式与公式难度
- **新手引导** — React Joyride 分步介绍三页联调流程
- **LLM 助手** — 按教学目标描述生成候选公式，本地校验通过后可一键采纳到编辑器

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron 43 |
| 构建 | Vite 8、electron-builder |
| 前端 | React 19、TypeScript |
| 3D | Three.js、@react-three/fiber、@react-three/drei |
| 状态 | Zustand |
| 引导 | react-joyride |
| 校验 | oxlint |

---

## 环境要求

- **Node.js** ≥ 20
- **npm** ≥ 10
- macOS / Windows（开发与打包均已验证脚本）

---

## 快速开始

```bash
git clone <repository-url>
cd cube-level-generator
npm install
npm run dev
```

执行 `npm run dev` 后会启动 Vite 开发服务器并自动打开 Electron 窗口。

---

## 开发命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 开发模式（Vite + Electron） |
| `npm run lint` | 运行 oxlint |
| `npm run build:web` | 仅构建 Web 渲染层与 Electron 入口（`dist/`、`dist-electron/`） |
| `npm run build` | 构建当前平台安装包 |
| `npm run build:mac` | 构建 macOS `.dmg`（arm64 + x64） |
| `npm run build:win` | 构建 Windows NSIS `.exe` |
| `npm run preview` | 预览 Web 构建产物 |

在 macOS 上可一次打出双端包：

```bash
npm run build:web
CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac --win
```

---

## 构建产物

安装包输出目录：`release/`

| 产物 | 说明 |
|------|------|
| `cube-level-generator-0.1.0-arm64.dmg` | macOS Apple Silicon |
| `cube-level-generator-0.1.0.dmg` | macOS Intel |
| `cube-level-generator Setup 0.1.0.exe` | Windows x64 NSIS 安装包 |

> **分发前注意**：当前未配置应用图标与代码签名（Windows Authenticode / macOS Developer ID + Notarize）。生产分发前请自行补充 `build.mac.icon`、`build.win.icon` 及签名配置。未签名的 macOS 包首次打开可能需在「隐私与安全性」中允许。

---

## 项目结构

```text
cube-level-generator/
├── electron/                 # Electron 主进程
│   ├── main.ts               # 窗口、文件 IO、技能树 IO、DashScope 代理、safeStorage
│   └── preload.ts            # 渲染进程 API 桥接
├── public/                   # 静态资源（默认关卡 / 技能树 JSON）
├── src/
│   ├── core/                 # 纯 TypeScript 业务逻辑（无 UI 依赖）
│   │   ├── cube/             # 魔方状态矩阵、旋转、cubelet 构建
│   │   ├── formula/          # 公式解析、朝向映射、目标态构建
│   │   ├── levels/           # 关卡类型、章节、校验、目录 CRUD
│   │   └── skill-graph/      # 技能定义与关卡映射类型 / 解析
│   ├── features/
│   │   ├── catalog/          # 关卡管理面板
│   │   ├── editor/           # 关卡编辑器
│   │   ├── preview-3d/       # 3D 预览
│   │   ├── skill-graph/      # 技能编辑 + 关卡映射面板
│   │   ├── onboarding/       # 新手引导（欢迎弹窗 + Joyride）
│   │   └── llm-formula/      # LLM 公式助手
│   ├── styles/               # 技能 / 映射等面板样式
│   └── shared/
│       ├── store/            # Zustand 全局状态
│       ├── ui/               # 公共 UI（如 SelectDropdown）
│       └── types/            # 窗口 / IPC 类型
├── index.html
├── vite.config.ts
└── package.json
```

---

## 三页联调工作流

推荐顺序：

1. **关卡编辑** — 导入或新建关卡，校对起终态与公式并保存
2. **技能编辑** — 确认目标 CFOP 技能存在、阶段与掌握标准正确并保存
3. **关卡映射** — 批量或单卡把关卡挂到技能，设置教学模式 / 难度后导出

没有关卡或技能数据时，映射页无法完成有效联调。

---

## 关卡与技能数据

| 路径 | 用途 |
|------|------|
| `src/core/levels/game_levels_english.json` | 内置默认关卡（开发时读取） |
| `public/game_levels_english.json` | 生产构建副本 |
| `public/skill_graph_default.json` | 默认技能树模版 |
| `{userData}/levels.runtime.json` | 关卡运行时草稿 |
| `{userData}/skill_graph.runtime.json` | 技能树运行时草稿 |
| 导出 `level_skill_map.json` | 关卡 ↔ 技能映射（映射页导出） |

**关卡工作流**

1. 在工具内编辑关卡并保存草稿
2. 点击「保存到文件」写入 `levels.runtime.json`
3. 通过「导出」与移动端 App 仓库的 `data/levels/` 同步 JSON

导入 / 恢复默认会立即覆盖当前草稿，操作前请确认或先导出备份。

---

## LLM 公式助手

1. 右侧面板点击「设置」
2. 填入 [DashScope API Key](https://help.aliyun.com/zh/model-studio/) 并保存
3. 描述教学目标，选择目标类型（F2L / OLL / PLL）与难度后生成候选

**安全说明**

- API Key 经 Electron `safeStorage` 加密后存于本机 `secrets.bin`，不会进入 git 或渲染进程网络层
- 生成请求在主进程发起（`electron/main.ts` → `dashscope:generate`）
- 候选公式在本地用 `core/levels/formulaPreset.ts` 校验；校验失败不可采纳；采纳后仍需保存关卡并在指引页校验解法

---

## 架构说明

```text
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  文件读写 · 技能树 IO · safeStorage · DashScope · 对话框 │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (preload)
┌──────────────────────────▼──────────────────────────────┐
│                   React Renderer (Vite)                  │
│  Catalog │ Editor │ SkillGraph │ LevelSkillMap │ Llm    │
│  + OnboardingTour（三页联调引导）                        │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│     core/ (cube · formula · levels · skill-graph)        │
│              纯函数 · 可独立测试 · 无 Electron 依赖       │
└─────────────────────────────────────────────────────────┘
```

---

## 贡献

欢迎通过 Issue 反馈问题或提出功能建议。提交 PR 前请先运行 `npm run lint` 与 `npm run build:web` 确保通过。

---

## 作者

**飞马客** · fmk
