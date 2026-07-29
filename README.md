# cube-level-generator

桌面端魔方关卡内容生产工具。用于管理章节与关卡、编辑旋转/指引公式、预览 3D 起始态与目标态，并可选接入通义千问（DashScope）生成公式候选。

---

## 功能特性

- **关卡目录** — 章节 CRUD、关卡排序/复制/隐藏、搜索与筛选、导入导出 JSON
- **关卡编辑器** — 基础信息、旋转公式（F2L / OLL / PLL）、亮度掩码、指引解法校验
- **3D 预览** — 基于 Three.js 实时预览初始态与目标态
- **LLM 助手** — 按教学目标描述生成候选公式，本地校验通过后可一键采纳到编辑器

---

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面壳 | Electron |
| 构建 | Vite 8 |
| 前端 | React 19、TypeScript |
| 3D | Three.js、@react-three/fiber、@react-three/drei |
| 状态 | Zustand |
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
| `npm run build:web` | 仅构建 Web 渲染层（`dist/`） |
| `npm run build` | 构建当前平台安装包 |
| `npm run build:mac` | 构建 macOS `.dmg`（arm64 + x64） |
| `npm run build:win` | 构建 Windows NSIS `.exe` |
| `npm run preview` | 预览 Web 构建产物 |

---

## 构建产物

安装包输出目录：`release/`

> **分发前注意**：当前未配置应用图标与代码签名（Windows Authenticode / macOS Developer ID + Notarize）。生产分发前请自行补充 `build.mac.icon`、`build.win.icon` 及签名配置。

---

## 项目结构

```text
cube-level-generator/
├── electron/                 # Electron 主进程
│   ├── main.ts               # 窗口、文件 IO、DashScope 代理、safeStorage
│   └── preload.ts            # 渲染进程 API 桥接
├── public/                   # 静态资源（含默认关卡 JSON）
├── src/
│   ├── core/                 # 纯 TypeScript 业务逻辑（无 UI 依赖）
│   │   ├── cube/             # 魔方状态矩阵、旋转、cubelet 构建
│   │   ├── formula/          # 公式解析、朝向映射、目标态构建
│   │   └── levels/           # 关卡类型、章节、校验、目录 CRUD
│   ├── features/
│   │   ├── catalog/          # 关卡管理面板
│   │   ├── editor/           # 关卡编辑器
│   │   ├── preview-3d/       # 3D 预览
│   │   └── llm-formula/      # LLM 公式助手
│   └── shared/
│       └── store/            # Zustand 全局状态
├── index.html
├── vite.config.ts
└── package.json
```

---

## 关卡数据

| 路径 | 用途 |
|------|------|
| `src/core/levels/game_levels_english.json` | 内置默认关卡（开发时读取） |
| `public/game_levels_english.json` | 生产构建副本 |
| `{userData}/levels.runtime.json` | 运行时草稿（界面「关卡文件」区显示完整路径） |

**工作流**

1. 在工具内编辑关卡并保存草稿
2. 点击「保存到文件」写入 `levels.runtime.json`
3. 通过「导出」与移动端 App 仓库的 `data/levels/` 同步 JSON

导入 / 恢复默认会立即覆盖当前草稿，操作前请确认或先导出备份。

---

## LLM 公式助手

1. 右侧面板点击 ⚙ 打开设置
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
│  文件读写 · safeStorage · DashScope HTTP · 系统对话框    │
└──────────────────────────┬──────────────────────────────┘
                           │ IPC (preload)
┌──────────────────────────▼──────────────────────────────┐
│                   React Renderer (Vite)                  │
│  CatalogPanel │ EditorPanel │ LlmPanel │ CubePreview    │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│              core/ (cube · formula · levels)             │
│              纯函数 · 可独立测试 · 无 Electron 依赖       │
└─────────────────────────────────────────────────────────┘
```

`core/` 模块自 LiberCube 移动端共享逻辑移植，保证关卡 JSON 格式与 App 端一致。

---

## 路线图

- [ ] 应用图标与代码签名 / 公证
- [ ] 自动更新（electron-updater）
- [ ] Skill / 难度标签与批量校验工具

---

## 相关项目

- **LiberCube App** — 移动端魔方学习 App；本工具产出的 JSON 为正式关卡数据源
- 产品方案文档（若在同 monorepo 内）：`../LiberCube-App-RN/docs/LEVEL_DESKTOP_STUDIO.md`

---

## 贡献

欢迎通过 Issue 反馈问题或提出功能建议。提交 PR 前请先运行 `npm run lint` 与 `npm run build:web` 确保通过。

---

## 作者

**飞马客** · fmk
