# 架构与改代码索引

面向后续修改：知道数据从哪来、状态在哪、UI 在哪。

---

## 1. 目录一览

```text
cube-level-generator/
├── src/
│   ├── App.tsx                 # 三 Tab + 布局 + 启动 refresh
│   ├── core/
│   │   ├── levels/             # 关卡类型、目录规范化、公式派生、引导校验
│   │   └── skill-graph/        # 技能树 + 映射类型、import/export、校验
│   ├── features/
│   │   ├── catalog/            # 左侧章节/关卡列表
│   │   ├── editor/             # 关卡内容编辑器
│   │   ├── skill-graph/        # 技能页 + 映射页
│   │   ├── llm-formula/        # AI 助手、prompt、解析
│   │   ├── preview-3d/         # Three.js 预览
│   │   └── onboarding/         # 欢迎框 + Joyride 步骤
│   └── shared/
│       ├── store/              # Zustand：catalog / skillGraph / levelSkillMap / ui
│       └── ui/                 # SelectDropdown 等
├── electron/
│   ├── main.ts / preload.ts
│   └── db/                     # MySQL pool、schema、repository、writeLock
├── docs/                       # 本目录
└── README.md
```

---

## 2. 运行时数据流

```text
本地 runtime JSON  ←→  Zustand store  ←→  UI
        ↑                    ↑
        └──── Electron IPC ──┴──→ MySQL（可选）
```

| 数据 | Store | 本地文件（概念） | 云端表 |
|------|-------|------------------|--------|
| 章节+关卡 | `useCatalogStore` | levels catalog runtime | `chapters`, `levels` |
| 技能树 | `useSkillGraphStore` | skill_graph runtime | `skills` |
| 关卡映射 | `useLevelSkillMapStore` | `level_skill_map.runtime.json` | `level_skill_bindings` |
| UI 选中/AI 目标 | `useUiStore` | 仅内存 | — |

启动：`App.tsx` 并行 `refreshCatalog` / `refreshSkillGraph` / `refreshMap`。  
技能：本地优先，云端后台，避免卡住。

---

## 3. 核心类型（改字段从这里开始）

### 关卡玩法 — `src/core/levels/types.ts`

`LevelDefinition`：id、chapterId、order、title、description、  
`startStateMatrix` / `goalStateMatrix` / 可选 `goalStateMatrices`（多目标态，任一匹配即过关）/ `brightnessMatrix`、  
`maxMoves`、`starThresholds`、`hint`、  
`rotationFormula` / `rotationTarget`、`guidanceFormula`、`hidden` 等。

**不含** teachMode / skillId（目前在映射里）。

### 技能 — `src/core/skill-graph/types.ts`

`SkillDefinition`：id、stage、displayNameZh/En、goal、prerequisites、  
masteryStandard、order、draft?

### 映射（桌面 / App 对齐 v1）

导出与本地 runtime 均为：

```json
{ "version": 1, "map": { "levelId": { "skillId", "cfopStage", "teachMode", "formulaDifficulty" } } }
```

内存里仍用 `mappings[levelId].skills`，但**长度强制 ≤ 1**（主标签）。  
旧 v2 多 `skills[]` 导入时进入 `ambiguous` 消歧，不静默取第一个。

导入导出：`src/core/skill-graph/utils.ts`  
发布检查：`validateLevelSkillMapForPublish` / `getLevelRecommendStatus`。

---

## 4. AI 助手怎么接到编辑器

1. `LlmPanel` 调 `window.api.dashscope.generate`
2. 解析：`aiParsers.ts`；提示词：`aiPrompts.ts`
3. 落地：
   - 公式 → `useUiStore.requestFormulaAdoption` → `EditorPanel` 监听并写入
   - 技能 → `useSkillGraphStore.applyAiSkillProposals`
   - 映射 → `useLevelSkillMapStore.applyAiMappings`
   - 章节/关卡 → `useCatalogStore.applyAiChapterProposals` / `applyAiLevelProposals`

关卡页 AI 子模式状态：`useUiStore.catalogAiMode` = `formula | chapters | levels`。

---

## 5. Electron / 数据库

- 配置示例：`electron/db/db.config.example.json`（真实 `db.config.json` 已 gitignore）
- Schema：`schema.sql` / `schema.ts`（启动 `ensureSchema`）
- 读写：`repository.ts`；并发：`writeLock.ts`
- 映射行：`row_uuid` + `sync_uuid` 批次 upsert，避免全表 DELETE

改云端字段时：先改 schema，再改 repository 的 push/pull，再确认前端 store 形状一致。

---

## 6. 常见修改场景

### 给关卡加一个玩法字段

1. `src/core/levels/types.ts` + normalize/import
2. `useCatalogStore` 的 update / 导出
3. `EditorPanel` 表单
4. 若需上云：`electron/db/schema*` + `repository`

### 改映射「一关只能一个 Skill」

1. `types` / `utils` 导出改 v1；导入消歧
2. `useLevelSkillMapStore`：`setPrimary` / 禁止多 binding
3. 重做 `LevelSkillMapPanel` UI
4. `repository` 每关至多一行
5. `LlmPanel` 映射提案改为单标签

### 改 Tab 显示名

- 用户可见文案：`App.tsx`、`onboardingSteps.ts`、`WelcomeDialog.tsx`、各 Panel 标题
- 可不改 `editMode` 枚举值（`catalog | skills | levelSkillMap`），降低连锁成本

### 改 AI 提示词或解析

- 只动 `src/features/llm-formula/aiPrompts.ts` / `aiParsers.ts`
- 应用逻辑在对应 store，勿把业务塞进 Panel 过深

---

## 7. 命令

```bash
npm run dev      # Vite + Electron
npm run lint     # oxlint
npm run build:web
npm run build:mac / build:win
```

类型检查：`npx tsc --noEmit`
