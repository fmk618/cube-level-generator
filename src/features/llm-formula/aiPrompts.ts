import type { LevelChapterConfig, LevelDefinition } from '@/core/levels';
import type { LevelSkillMap, SkillDefinition, SkillStage } from '@/core/skill-graph/types';

export type AiEditMode = 'catalog' | 'skills' | 'levelSkillMap';

export type LevelSummaryForAi = {
  id: string;
  title: string;
  description: string;
  chapter: string;
  rotationFormula?: string;
  guidanceFormula?: string;
  rotationTarget?: string;
  mappedSkillIds: string[];
};

export type MapScope = 'unmapped' | 'selected' | 'all';

const STAGE_LIST = 'cross | f2l | oll | pll | full';
const MASTERY_LIST = 'guided_only | guided_and_one_star | two_stars';
const TEACH_LIST = 'guided | challenge | demo';

export function buildLevelSummaries(
  levels: LevelDefinition[],
  chapters: LevelChapterConfig[],
  map: LevelSkillMap | null,
): LevelSummaryForAi[] {
  return levels.map((level) => {
    const chapter = chapters.find((c) => c.id === level.chapterId);
    const entry = map?.mappings[level.id];
    return {
      id: level.id,
      title: level.title,
      description: level.description,
      chapter: chapter ? `${chapter.partName} ${chapter.title}` : level.chapterId,
      rotationFormula: level.rotationFormula,
      guidanceFormula: level.guidanceFormula,
      rotationTarget: level.rotationTarget,
      mappedSkillIds: entry?.skills.map((b) => b.skillId) ?? [],
    };
  });
}

export function buildFormulaSystemPrompt(target: string, difficulty: string): string {
  return `你是魔方公式设计助手，服务于 cube-level-generator 关卡编辑工具。
用户会描述一个教学目标（例如某个 skill 点、某类贴纸识别）。你需要给出候选魔方公式（记谱），用于生成关卡的旋转/指引公式。

严格要求：
- 目标类型：${target.toUpperCase()}（f2l=还原前两层部分状态，oll=顶层朝向，pll=顶层排列）
- 难度：${difficulty}
- 记谱只能使用标准 WCA 记号：U D F B L R（可加 ' 或 2），宽转 u d f b l r，切片 M E S，整体旋转 x y z
- 严禁输出中文说明混入公式本体，公式与说明用 " :: " 分隔
- 每行一个候选，格式固定为：<序号>. <公式> :: <一句话说明这个公式训练的技能点>
- 不要输出任何其他文字、前后缀说明或 markdown 代码块`;
}

export function buildSkillSystemPrompt(existingSkills: SkillDefinition[]): string {
  const skillList = existingSkills.map((s) => ({
    id: s.id,
    stage: s.stage,
    displayNameZh: s.displayNameZh,
    goal: s.goal,
    prerequisites: s.prerequisites,
    order: s.order,
  }));

  return `你是 CFOP 魔方教学技能树设计助手，服务于 cube-level-generator。
根据用户描述，为技能编辑页生成或补充技能节点提案。

现有技能（JSON，可引用 id 作为 prerequisites）：
${JSON.stringify(skillList, null, 2)}

输出要求：
- 只输出一个 JSON 对象，不要 markdown 代码块，不要额外说明
- 格式：
{
  "skills": [
    {
      "action": "create",
      "id": "stage.slug_name",
      "stage": "${STAGE_LIST}",
      "displayNameZh": "中文名",
      "displayNameEn": "English Name",
      "goal": "技能目标描述",
      "prerequisites": ["已有技能id"],
      "masteryStandard": "${MASTERY_LIST}",
      "order": 1,
      "reason": "一句话说明为何需要此技能"
    }
  ]
}
- action 只能是 create 或 update；update 时 id 必须已存在于现有技能
- id 格式建议 stage.snake_case，create 时不可与现有 id 重复
- stage 只能是：${STAGE_LIST}
- masteryStandard 只能是：${MASTERY_LIST}
- prerequisites 只能引用现有技能 id 或本次 create 中更早出现的 id
- order 为同 stage 内排序，从 1 递增`;
}

export function buildMappingSystemPrompt(
  skills: SkillDefinition[],
  levelSummaries: LevelSummaryForAi[],
  scope: MapScope,
): string {
  const skillList = skills.map((s) => ({
    id: s.id,
    stage: s.stage,
    displayNameZh: s.displayNameZh,
    goal: s.goal,
  }));

  const scopeHint =
    scope === 'unmapped'
      ? '仅映射尚未分配技能的关卡（mappedSkillIds 为空）'
      : scope === 'selected'
        ? '仅映射用户选中的关卡（见 levelSummaries）'
        : '可映射全部关卡；已有映射的关卡可补充或调整';

  return `你是魔方关卡-技能映射助手，服务于 cube-level-generator。
根据关卡内容与 CFOP 技能树，为关卡分配最合适的技能绑定。

映射范围：${scopeHint}

可用技能（skillId 必须从中选择）：
${JSON.stringify(skillList, null, 2)}

关卡摘要（JSON）：
${JSON.stringify(levelSummaries, null, 2)}

输出要求：
- 只输出一个 JSON 对象，不要 markdown 代码块，不要额外说明
- 格式：
{
  "mappings": [
    {
      "levelId": "关卡id",
      "skills": [
        {
          "skillId": "技能id",
          "cfopStage": "${STAGE_LIST}",
          "teachMode": "${TEACH_LIST}",
          "formulaDifficulty": 1,
          "reason": "一句话说明映射理由"
        }
      ]
    }
  ]
}
- levelId 必须来自关卡摘要
- skillId 必须来自可用技能
- cfopStage 与 skill 的 stage 一致
- teachMode 只能是：${TEACH_LIST}
- formulaDifficulty 为 1-6 整数，入门关偏低、挑战关偏高
- 一关可绑多个技能；无合适技能时可返回空 skills 数组并说明 reason`;
}

export function filterLevelsForMapScope(
  summaries: LevelSummaryForAi[],
  scope: MapScope,
  selectedLevelIds: string[],
): LevelSummaryForAi[] {
  if (scope === 'selected') {
    const selected = new Set(selectedLevelIds);
    return summaries.filter((s) => selected.has(s.id));
  }
  if (scope === 'unmapped') {
    return summaries.filter((s) => s.mappedSkillIds.length === 0);
  }
  return summaries;
}

export function isValidSkillStage(value: string): value is SkillStage {
  return ['cross', 'f2l', 'oll', 'pll', 'full'].includes(value);
}
