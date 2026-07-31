# 项目现状与进度

> 更新日期：2026-07-30  
> 仓库：`cube-level-generator`（Electron + React 桌面关卡生产工具）  
> 对齐对象：LiberCube App RN 的技能推荐 / `level_skill_map.json`

---

## 1. 这个项目是干什么的

给魔方教学 App 生产三份数据：

1. **关卡目录**（章节 + 关卡玩法：公式、起终矩阵、亮度、步数星级）
2. **技能 / 能力标签树**（CFOP stage、目标、掌握标准、前置）
3. **关卡 ↔ 技能映射**（教学模式、推荐难度）

可选：通义千问（DashScope）在右侧 AI 助手里生成公式 / 章节 / 关卡 / 技能 / 映射提案，人工审核后再应用。

保存时写本地 runtime JSON，并尽量同步到宝塔 MySQL，方便多端共享。

---

## 2. 当前 UI（已上线行为）

顶部三个 Tab（代码里 `editMode`）：

| Tab 文案 | `editMode` | 主要面板 |
|----------|------------|----------|
| 关卡内容 | `catalog` | `CatalogPanel` + `EditorPanel` |
| AI 能力标签 | `skills` | `SkillGraphPanel` |
| AI 推荐配置 | `levelSkillMap` | `LevelSkillMapPanel` |

右侧：`LlmPanel`（AI 助手），随 Tab 切换能力。

### 关卡内容页

- 章节 / 关卡 CRUD、上下移排序、复制、隐藏、搜索
- 旋转公式 / 指引公式、起终矩阵、亮度、步数星级、提示
- 3D 预览、公式可达性校验
- 基础信息内只读 **AI 推荐配置**摘要 +「前往 AI 推荐配置」
- AI 子模式：**改公式 | 生成章节 | 生成关卡**

### AI 能力标签页

- 顶部说明：非玩法、无公式
- 可编辑：标签 ID（新建）、Stage、内部名、能力定义、聚合规则、前置、筛选顺序、草稿/启用
- 展示引用关卡数与列表；被引用时禁止删除
- AI：生成能力标签提案

### AI 推荐配置页

- **一关一个主能力标签**（App v1）
- 教学模式、推荐难度、推荐状态 / 不可推荐原因
- 批量设主标签 / 模式 / 难度（替换式）
- 发布检查 → 通过后「导出给 App」（`version:1` + `map`）
- 旧 v2 多标签导入进入消歧，不静默取第一个

### 基础设施

- Electron + Vite；MySQL：`chapters` / `levels` / `skills` / `level_skill_bindings` / `app_meta`
- 写入串行锁 + `sync_uuid` 批次 upsert
- 映射独立 runtime：`level_skill_map.runtime.json`（保存/导出为 App v1）
- 新手引导（Joyride）；API Key 本机加密存储

---

## 3. 与 App 的契约（第一版）

导出：

```json
{ "version": 1, "map": { "level-id": { "skillId", "cfopStage", "teachMode", "formulaDifficulty" } } }
```

关系：一 Level → 一主 Skill；一 Skill → 多 Level。综合关用独立综合 Skill。

---

## 4. 进度看板

### 已完成（可日常使用）

- [x] 三页编辑器 + 3D 预览 + 公式校验
- [x] 云端 MySQL 同步与死锁相关修复
- [x] AI：公式 / 能力标签 / 推荐配置提案
- [x] AI：按章节生成关卡、生成章节（含可选初始关）
- [x] AI 应用后高亮、公式一键写入编辑器
- [x] 章节 / 关卡列表外露上下移排序
- [x] 本 `docs/` 进度与架构说明
- [x] Tab 改名为：关卡内容 / AI 能力标签 / AI 推荐配置
- [x] 映射改为**一关一主 Skill**；导出强制 App v1 `map`
- [x] 导入旧桌面 v2 多标签时消歧（禁止静默取第一个）
- [x] 发布检查（Level/Skill 存在、Stage 一致、难度 1–6、Guided/Demo 有 guidance 等）
- [x] 关卡内容页只读「AI 推荐配置」摘要 + 跳转
- [x] 能力标签页补齐 id / stage / 前置 / order / draft / 引用列表
- [x] 推荐配置页去掉「一关多技能」；批量改为替换式
- [x] AI 助手改为单主标签口径
- [x] 云端 push 每关至多一行；pull 多行进入消歧

### 后续可选

- [ ] `QUICK_START.md` 全文改成新三页口径
- [ ] 长期：`secondarySkillIds`（仅描述，不更新 mastery）
- [ ] App 侧若升级多标签规则，再放开导出 `skills[]`

---

## 5. 改功能时从哪下手

见 [ARCHITECTURE.md](./ARCHITECTURE.md)。最短路径：

| 想改… | 先打开 |
|--------|--------|
| 关卡字段 / 公式派生 | `src/core/levels/` |
| 技能或映射类型 / 导入导出 | `src/core/skill-graph/` |
| 左侧目录 UI | `src/features/catalog/CatalogPanel.tsx` |
| 中间编辑器 | `src/features/editor/EditorPanel.tsx` |
| 技能页 | `src/features/skill-graph/SkillGraphPanel.tsx` |
| 映射页 | `src/features/skill-graph/LevelSkillMapPanel.tsx` |
| AI 助手 | `src/features/llm-formula/` |
| 状态 | `src/shared/store/` |
| MySQL | `electron/db/` |

---

## 6. 本地最近相关提交（便于对照）

以 `git log` 为准，近期主题大致包括：

- AI 工作台（技能提案、映射自动填写）
- AI 应用反馈 / 公式写入编辑器
- 技能加载本地优先
- 云端 sync_uuid upsert、Deadlock 修复
- AI 映射 UI 分段控件

未提交改动请用 `git status` 自行确认；本文不代替 git。
