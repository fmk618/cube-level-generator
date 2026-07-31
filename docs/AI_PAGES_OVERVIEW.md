# AI 三页产品口径（与 App 对齐）

本文描述**目标产品模型**。桌面端 UI 文案与导出契约仍在迁移中，以 [PROJECT_STATUS.md](./PROJECT_STATUS.md) 的「进度看板」为准。

App 侧详细设计可参考：

`LiberCube-App-RN/docs/GAME_AI_TEACHING.md`  
`LiberCube-App-RN/docs/GAME_AI_TEACHING_IMPLEMENTATION.md`（约 §2.4.2 桌面改版）

---

## 1. 三页职责

| 目标名称 | 现状 Tab 名 | 职责 |
|----------|-------------|------|
| **关卡内容** | 关卡编辑 | 唯一产生玩法数据：公式、矩阵、亮度、步数星级、3D |
| **AI 能力标签** | 技能编辑 | 内部能力维度；**不是**独立玩法，不配公式 |
| **AI 推荐配置** | 关卡映射 | 每关指定**一个主能力标签** + teachMode + formulaDifficulty |

原则：

- 推荐对象永远是 **Level**
- Skill 只用于薄弱项判断、成绩聚合、筛选候选关
- Skill **不保存**旋转/指引公式；公式在关卡内容维护

---

## 2. Level ↔ Skill 关系（第一版）

```text
Level 1 → Skill A
Level 2 → Skill A
Level 3 → Skill B
```

- 一个 Level **只绑定一个**主 Skill  
- 一个 Skill **可以关联多个** Level  
- 通关 / 失败 / 星级聚合到该 Skill 的 mastery  
- AI 按 Skill 掌握状态筛 Level，最终打开的仍是 Level + 其上的公式  

综合关示例：完整白十字 → `cross.integrate`  
**不要**同时绑定 `find_edge`、`setup_turn`、`double_turn`。

长期可扩展 `secondarySkillIds`（仅描述，不更新 mastery）。**第一版不做。**

---

## 3. 字段归属

**Skill（能力标签）**

- id、stage、能力定义（goal）、前置能力、掌握聚合规则、筛选顺序、draft

**Level（玩法）**

- guidanceFormula、rotationFormula、起终矩阵、亮度、步数星级等

**推荐配置（存在 map 文件，不写进 LevelDefinition）**

- skillId（主标签）
- cfopStage（**由 Skill.stage 派生**，禁止手改漂移）
- teachMode、formulaDifficulty

---

## 4. App v1 导出契约

导出给 App 的 `level_skill_map.json` 必须是：

```json
{
  "version": 1,
  "map": {
    "level-id": {
      "skillId": "cross.double_turn",
      "cfopStage": "cross",
      "teachMode": "guided",
      "formulaDifficulty": 1
    }
  }
}
```

发布前建议检查：

- 映射引用的 Level / Skill 存在
- cfopStage 与 Skill.stage 一致
- formulaDifficulty ∈ 1～6
- Guided / Demo 有可执行 guidanceFormula
- 无孤儿映射；draft Skill 不进推荐
- 不导出桌面旧版 `skills[]` 多绑结构（除非 App 先升级）

---

## 5. 引导叙事（目标文案）

1. **关卡内容** — 配置真实可玩的公式和状态  
2. **AI 能力标签** — 定义系统判断玩家能力的内部维度  
3. **AI 推荐配置** — 给每关指定一个主能力标签和推荐参数  
4. **发布检查** — 确认候选 Level 能被 App 正确执行  
