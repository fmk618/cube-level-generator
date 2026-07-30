import type { LevelFormulaTarget } from '@/core/levels';
import type {
  LevelSkillBinding,
  MasteryStandard,
  SkillDefinition,
  SkillStage,
  TeachMode,
} from '@/core/skill-graph/types';
import { isValidSkillStage } from './aiPrompts';

export type AiSkillProposal = {
  action: 'create' | 'update';
  id: string;
  stage: SkillStage;
  displayNameZh: string;
  displayNameEn: string;
  goal: string;
  prerequisites: string[];
  masteryStandard: MasteryStandard;
  order: number;
  reason?: string;
};

export type AiMappingProposal = {
  levelId: string;
  levelTitle?: string;
  skills: Array<LevelSkillBinding & { reason?: string }>;
};

export type AiLevelProposal = {
  title: string;
  description: string;
  hint?: string;
  rotationFormula: string;
  rotationTarget: LevelFormulaTarget;
  guidanceFormula?: string;
  maxMoves: number;
  reason?: string;
};

export type AiChapterProposal = {
  partName: string;
  title: string;
  description: string;
  capacity: number;
  reason?: string;
  levels?: AiLevelProposal[];
};

const MASTERY_VALUES: MasteryStandard[] = ['guided_only', 'guided_and_one_star', 'two_stars'];
const TEACH_VALUES: TeachMode[] = ['guided', 'challenge', 'demo'];
const FORMULA_TARGETS: LevelFormulaTarget[] = ['f2l', 'oll', 'pll'];

export function extractJsonFromLlmText(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('模型返回为空');

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('未找到 JSON 对象');
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function parseMastery(value: unknown): MasteryStandard {
  if (typeof value === 'string' && MASTERY_VALUES.includes(value as MasteryStandard)) {
    return value as MasteryStandard;
  }
  return 'guided_and_one_star';
}

function parseTeachMode(value: unknown): TeachMode {
  if (typeof value === 'string' && TEACH_VALUES.includes(value as TeachMode)) {
    return value as TeachMode;
  }
  return 'guided';
}

function parseDifficulty(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
}

export function parseSkillProposals(text: string, existingSkills: SkillDefinition[]): AiSkillProposal[] {
  const parsed = extractJsonFromLlmText(text) as { skills?: unknown[] };
  if (!parsed || !Array.isArray(parsed.skills)) {
    throw new Error('响应缺少 skills 数组');
  }

  const existingIds = new Set(existingSkills.map((s) => s.id));
  const results: AiSkillProposal[] = [];

  for (const raw of parsed.skills) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const action = item.action === 'update' ? 'update' : 'create';
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) throw new Error('技能提案缺少 id');

    const stageRaw = typeof item.stage === 'string' ? item.stage : '';
    if (!isValidSkillStage(stageRaw)) throw new Error(`技能 ${id} 的 stage 无效`);

    const displayNameZh = typeof item.displayNameZh === 'string' ? item.displayNameZh.trim() : '';
    const displayNameEn = typeof item.displayNameEn === 'string' ? item.displayNameEn.trim() : '';
    const goal = typeof item.goal === 'string' ? item.goal.trim() : '';
    if (!displayNameZh || !goal) throw new Error(`技能 ${id} 缺少 displayNameZh 或 goal`);

    if (action === 'update' && !existingIds.has(id)) {
      throw new Error(`update 技能 ${id} 不存在于当前技能树`);
    }
    if (action === 'create' && existingIds.has(id)) {
      throw new Error(`create 技能 ${id} 与现有 id 冲突`);
    }

    const prerequisites = Array.isArray(item.prerequisites)
      ? item.prerequisites.filter((p): p is string => typeof p === 'string')
      : [];

    results.push({
      action,
      id,
      stage: stageRaw,
      displayNameZh,
      displayNameEn: displayNameEn || displayNameZh,
      goal,
      prerequisites,
      masteryStandard: parseMastery(item.masteryStandard),
      order: typeof item.order === 'number' ? item.order : Number(item.order) || 1,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
    });

    if (action === 'create') existingIds.add(id);
  }

  if (results.length === 0) throw new Error('未解析到有效技能提案');
  return results;
}

export function parseMappingProposals(
  text: string,
  validLevelIds: Set<string>,
  validSkillIds: Set<string>,
): AiMappingProposal[] {
  const parsed = extractJsonFromLlmText(text) as { mappings?: unknown[] };
  if (!parsed || !Array.isArray(parsed.mappings)) {
    throw new Error('响应缺少 mappings 数组');
  }

  const results: AiMappingProposal[] = [];

  for (const raw of parsed.mappings) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const levelId = typeof item.levelId === 'string' ? item.levelId.trim() : '';
    if (!levelId || !validLevelIds.has(levelId)) {
      throw new Error(`无效 levelId: ${levelId || '(空)'}`);
    }

    const skillsRaw = Array.isArray(item.skills) ? item.skills : [];
    const skills: AiMappingProposal['skills'] = [];

    for (const s of skillsRaw) {
      if (!s || typeof s !== 'object') continue;
      const binding = s as Record<string, unknown>;
      const skillId = typeof binding.skillId === 'string' ? binding.skillId.trim() : '';
      if (!skillId || !validSkillIds.has(skillId)) {
        throw new Error(`关卡 ${levelId} 引用了无效 skillId: ${skillId || '(空)'}`);
      }

      const cfopStageRaw = typeof binding.cfopStage === 'string' ? binding.cfopStage : '';
      if (!isValidSkillStage(cfopStageRaw)) {
        throw new Error(`关卡 ${levelId} 的 cfopStage 无效`);
      }

      skills.push({
        skillId,
        cfopStage: cfopStageRaw,
        teachMode: parseTeachMode(binding.teachMode),
        formulaDifficulty: parseDifficulty(binding.formulaDifficulty),
        reason: typeof binding.reason === 'string' ? binding.reason : undefined,
      });
    }

    results.push({ levelId, skills });
  }

  if (results.length === 0) throw new Error('未解析到有效映射提案');
  return results;
}

function parseLevelProposalItem(raw: unknown): AiLevelProposal | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const title = typeof item.title === 'string' ? item.title.trim() : '';
  const description = typeof item.description === 'string' ? item.description.trim() : '';
  const rotationFormula = typeof item.rotationFormula === 'string' ? item.rotationFormula.trim() : '';
  if (!title || !description || !rotationFormula) {
    throw new Error('关卡提案缺少 title / description / rotationFormula');
  }

  const targetRaw = typeof item.rotationTarget === 'string' ? item.rotationTarget.trim().toLowerCase() : 'f2l';
  const rotationTarget = FORMULA_TARGETS.includes(targetRaw as LevelFormulaTarget)
    ? (targetRaw as LevelFormulaTarget)
    : 'f2l';

  const maxMovesRaw = typeof item.maxMoves === 'number' ? item.maxMoves : Number(item.maxMoves);
  const maxMoves = Number.isFinite(maxMovesRaw) ? Math.min(40, Math.max(3, Math.round(maxMovesRaw))) : 8;

  return {
    title,
    description,
    hint: typeof item.hint === 'string' ? item.hint.trim() : undefined,
    rotationFormula,
    rotationTarget,
    guidanceFormula:
      typeof item.guidanceFormula === 'string' && item.guidanceFormula.trim()
        ? item.guidanceFormula.trim()
        : rotationFormula,
    maxMoves,
    reason: typeof item.reason === 'string' ? item.reason : undefined,
  };
}

export function parseLevelProposals(text: string): AiLevelProposal[] {
  const parsed = extractJsonFromLlmText(text) as { levels?: unknown[] };
  if (!parsed || !Array.isArray(parsed.levels)) {
    throw new Error('响应缺少 levels 数组');
  }

  const results: AiLevelProposal[] = [];
  for (const raw of parsed.levels) {
    const item = parseLevelProposalItem(raw);
    if (item) results.push(item);
  }

  if (results.length === 0) throw new Error('未解析到有效关卡提案');
  return results;
}

export function parseChapterProposals(text: string): AiChapterProposal[] {
  const parsed = extractJsonFromLlmText(text) as { chapters?: unknown[] };
  if (!parsed || !Array.isArray(parsed.chapters)) {
    throw new Error('响应缺少 chapters 数组');
  }

  const results: AiChapterProposal[] = [];
  for (const raw of parsed.chapters) {
    if (!raw || typeof raw !== 'object') continue;
    const item = raw as Record<string, unknown>;
    const partName = typeof item.partName === 'string' ? item.partName.trim() : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const description = typeof item.description === 'string' ? item.description.trim() : '';
    if (!partName || !title) {
      throw new Error('章节提案缺少 partName / title');
    }

    const capacityRaw = typeof item.capacity === 'number' ? item.capacity : Number(item.capacity);
    const capacity = Number.isFinite(capacityRaw) ? Math.min(20, Math.max(1, Math.round(capacityRaw))) : 6;

    let levels: AiLevelProposal[] | undefined;
    if (Array.isArray(item.levels) && item.levels.length > 0) {
      levels = [];
      for (const levelRaw of item.levels.slice(0, capacity)) {
        const level = parseLevelProposalItem(levelRaw);
        if (level) levels.push(level);
      }
    }

    results.push({
      partName,
      title,
      description: description || title,
      capacity,
      reason: typeof item.reason === 'string' ? item.reason : undefined,
      levels,
    });
  }

  if (results.length === 0) throw new Error('未解析到有效章节提案');
  return results;
}
