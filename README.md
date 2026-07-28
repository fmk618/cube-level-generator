# LiberCube Level Studio

桌面端关卡内容工厂：关卡/章节管理 + 3D 起始/目标态预览 + 旋转与指引公式编辑 + LLM（通义千问 DashScope）公式候选助手。

对应产品方案见 `../LiberCube-App-RN/docs/LEVEL_DESKTOP_STUDIO.md`。手机 App 里的 `level-debug` / `level-edit` 仍保留用于快速调试，正式关卡生产以本工具导出的 JSON 为准。

## 技术栈

Electron + Vite + React 19 + TypeScript + Three.js / @react-three/fiber + Zustand。

## 目录结构

```text
electron/            主进程（窗口、文件 IO、safeStorage 密钥、DashScope 请求代理）
  main.ts
  preload.ts
src/
  core/               从 LiberCube-App-RN 移植的纯 TS 逻辑（cube-core）：矩阵/公式/关卡校验
    cube/             魔方状态矩阵、旋转、cubelet 构建
    formula/          公式解析、朝向映射、F2L/OLL/PLL 目标态构建
    levels/           关卡类型、章节配置、公式预设、指引校验、目录 CRUD 纯函数
  shared/
    store/            Zustand：useCatalogStore（关卡目录+文件持久化）、useUiStore（选中关卡/公式采纳桥接）
  features/
    catalog/          关卡管理台（原 level-debug）
    editor/            关卡编辑器（原 level-edit）
    preview-3d/        R3F 3D 预览
    llm-formula/       LLM 公式助手（DashScope）
```

## 开发

```bash
npm install
npm run dev        # 启动 Vite + 自动拉起 Electron 窗口
```

## 构建安装包

```bash
npm run build:mac   # 生成 .dmg（arm64 + x64）
npm run build:win   # 生成 NSIS .exe
npm run build       # 当前平台默认目标
```

产物输出到 `release/`。首次在 Windows/macOS 分发前需要补充代码签名（Windows Authenticode / macOS Developer ID + notarize），当前配置未打自定义图标与签名。

## 关卡文件

- 内置默认关卡：`src/core/levels/game_levels_english.json`（同时复制一份到 `public/` 供生产构建读取）
- 运行时草稿：保存在 Electron `userData` 目录下的 `levels.runtime.json`（左侧面板「关卡文件」区展示完整路径）
- 「导入 / 导出」走系统文件对话框，用于和 `LiberCube-App-RN/data/levels/` 之间同步 JSON

## LLM 公式助手

- 右侧面板「⚙」设置 DashScope API Key，通过 Electron `safeStorage` 加密后存本机 `secrets.bin`，不会打进渲染进程或 git
- 生成请求在主进程发起（`electron/main.ts` 的 `dashscope:generate` handler），Key 不经过渲染进程网络层
- 候选公式先在本地用 `core/levels/formulaPreset.ts` 校验能否解析，校验失败禁止采纳；采纳后写入编辑器草稿，仍需保存 + 校验推荐解法才能落盘

## 已知待办

- 未配置应用图标（`build.mac.icon` / `build.win.icon`）与代码签名/公证
- 未接入自动更新（electron-updater）
- skill / 难度标签、批量校验工具等二期功能未实现
