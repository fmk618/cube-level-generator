# Skill 树与关卡映射编辑指南

## 概述

桌面工具现在支持完整的魔方教学 Skill 树编辑与关卡映射分配，直接导出为 App 可用的 JSON 文件。

## 工作流程

### 第一步：编辑 Skill 树

1. **打开桌面工具** → 顶部标签栏点击 **`Skill 树`** 标签
2. 工具会**自动加载 30+ 个 Skill 的默认模版**（不需要手动导入）
3. **查看/编辑 Skill**：
   - 点击任何 skill 行右侧的 **`编辑`** 按钮进入编辑模式
   - 修改内容（中文名、英文名、目标描述、掌握标准等）
   - 点击 **`保存`** 确认

4. **新建 Skill**（可选）：
   - 在 "新建 Skill 所属阶段" 下拉框选择阶段（Cross / F2L / OLL / PLL / Advanced）
   - 点击 **`创建新 Skill`** 按钮
   - 编辑完成后自动添加到列表

5. **删除 Skill**（谨慎使用）：
   - 点击右侧 **`删除`** 按钮
   - **注意**：如果其他 Skill 依赖它作为前置条件，删除会失败

6. **按阶段筛选**：
   - 使用 "筛选阶段" 下拉框快速找到特定阶段的 Skill
   - 选 "全部" 可看完整列表

7. **导出 Skill 树**：
   - 点击右上角 **`导出`** 按钮
   - 选择保存位置，文件名为 `skill_graph_cfop.json`
   - ⚠️ **重要**：导出后要把这个文件**覆盖** App 端的 `data/skills/skill_graph_cfop.json`

### 第二步：分配关卡-Skill 映射

1. **打开关卡映射编辑器** → 顶部标签栏点击 **`关卡映射`** 标签
2. **查看关卡列表**：
   - 显示的是所有 51 个关卡
   - 灰色卡片 = 未分配 Skill
   - 白色卡片 = 已分配 Skill

3. **逐个分配 Skill**（手动模式）：
   - 对于**未分配的关卡**（灰色卡片）：点击下拉框选择 Skill，自动添加映射
   - 对于**已分配的关卡**（白色卡片）：
     - **Skill**：修改分配的 Skill
     - **教学模式**：选择 `guided`（引导）/ `challenge`（挑战）/ `demo`（演示）
     - **难度**：1-6 之间，代表同个 Skill 内的难度梯度
   - 点击 **`清除映射`** 移除分配

4. **快速分配**（批量模式）- **推荐用法**：
   - 在卡片左上的**复选框**中勾选多个关卡
   - 在 "快速分配" 区域选择要分配的 Skill
   - 点击 **`分配给 N 个关卡`** 按钮
   - 可以大幅提高效率（比如一次给 10 个相似关卡都分配 "白十字·单面转动"）

5. **按章节筛选**：
   - 在 "筛选章节" 下拉框选择特定章节
   - 一次只看 1 章的关卡，更容易专注

6. **查看进度**：
   - 顶部显示 `N / 51 已分配`
   - 快速了解完成度

7. **导出关卡映射**：
   - 点击右上角 **`导出`** 按钮
   - 文件名为 `level_skill_map.json`
   - ⚠️ **重要**：导出后要把这个文件**覆盖** App 端的 `data/skills/level_skill_map.json`

## 文件位置参考

| 文件 | 位置（App 端） |
|-----|--------------|
| Skill 树 | `/data/skills/skill_graph_cfop.json` |
| 关卡映射 | `/data/skills/level_skill_map.json` |

## 常见问题

### Q: 编辑完 Skill 后，App 里看不到新的 Skill？
**A**: 确认你导出的 `skill_graph_cfop.json` 是否覆盖到了 App 端的对应文件。可以用文本编辑器打开两个文件对比一下。

### Q: 为什么某个 Skill 删除不了？
**A**: 可能有其他 Skill 依赖它作为前置条件。先把依赖它的 Skill 的前置关系改了，再删除。

### Q: 关卡映射中 "难度" 是什么意思？
**A**: 同一个 Skill 可能会在多个关卡中出现，难度 1-6 用来表示这些关卡中这个 Skill 的学习难度梯度。1 = 最容易，6 = 最难。

### Q: 我想快速给某个 Skill 的所有关卡都分配同样的难度，怎么办？
**A**: 
1. 先在 "快速分配" 中选择这个 Skill，批量分配给所需的关卡
2. 然后在每张卡片中分别调整难度值

### Q: 导出的 JSON 文件可以在哪里找到？
**A**: 点击导出时会弹出系统文件对话框，你自己选择保存位置。建议直接保存到 App 项目的 `data/skills/` 目录下。

## 数据格式说明

### Skill 树格式

```json
{
  "version": 2,
  "skills": [
    {
      "id": "cross.basic_rotation",
      "stage": "cross",
      "displayNameZh": "白十字·单面转动",
      "displayNameEn": "White Cross: Single Face Turn",
      "goal": "学会正确转动魔方的单个面",
      "prerequisites": [],
      "masteryStandard": "guided_and_one_star",
      "order": 1,
      "draft": true
    }
  ]
}
```

- **id**: Skill 的唯一标识符（技术用）
- **stage**: Skill 所属阶段（cross/f2l/oll/pll/full）
- **displayNameZh/En**: 用户看到的中英文名称
- **goal**: 一句话的学习目标
- **prerequisites**: 前置 Skill ID 数组（依赖关系）
- **masteryStandard**: 掌握标准
  - `guided_only`: 仅需引导通过
  - `guided_and_one_star`: 引导通过 + 获得一星
  - `two_stars`: 需要获得两星才算掌握
- **order**: 同阶段内的顺序
- **draft**: 标记为草稿状态

### 关卡映射格式

```json
{
  "version": 1,
  "mappings": {
    "lvl-part1-xxx": {
      "skillId": "cross.basic_rotation",
      "cfopStage": "cross",
      "teachMode": "guided",
      "formulaDifficulty": 1
    }
  }
}
```

- **mappings**: 关卡 ID → 映射关系的对象
- **skillId**: 分配给这个关卡的 Skill ID
- **cfopStage**: Skill 所属的阶段（冗余字段，自动从 Skill 树推导）
- **teachMode**: 教学模式（guided/challenge/demo）
- **formulaDifficulty**: 难度等级 1-6

## 完成后下一步

1. **导出两个 JSON 文件**到 App 的 `data/skills/` 目录
2. **App 直接加载运行**（无需任何额外配置）
3. 完整的 Skill 教学系统现在可用

## 联系方式

如遇到问题或需要修改模版，请随时提出。
