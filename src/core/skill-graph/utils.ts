import type { LevelDefinition } from '@/core/levels/types';
import { getLevelGuidanceSummary } from '@/core/levels/guidance';
import type {
  SkillGraphDocument,
  LevelSkillMap,
  LevelSkillMapEntry,
  LevelSkillBinding,
  LevelSkillMapImportResult,
  SkillDefinition,
  SkillStage,
  StageDefinition,
  TeachMode,
} from './types';
import { LEVEL_SKILL_MAP_VERSION } from './types';

export const BUILTIN_STAGES: StageDefinition[] = [
  { id: 'cross', label: '白十字', order: 0 },
  { id: 'f2l', label: '两层', order: 1 },
  { id: 'oll', label: 'OLL', order: 2 },
  { id: 'pll', label: 'PLL', order: 3 },
  { id: 'full', label: '进阶', order: 4 },
];

// 兼容旧代码引用
export const SKILL_STAGES: SkillStage[] = BUILTIN_STAGES.map((s) => s.id);

export const isValidStageId = (value: string): boolean =>
  /^[a-z][a-z0-9_]{0,31}$/.test(value);

export const normalizeStageId = (value: unknown, fallback: SkillStage = 'cross'): SkillStage => {
  if (typeof value !== 'string') return fallback;
  const id = value.trim().toLowerCase();
  return isValidStageId(id) ? id : fallback;
};

export const normalizeStages = (value: unknown): StageDefinition[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  const next: StageDefinition[] = [];
  const seen = new Set<string>();
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const id = normalizeStageId(raw.id, '');
    if (!id || seen.has(id)) continue;
    const label =
      typeof raw.label === 'string' && raw.label.trim()
        ? raw.label.trim().slice(0, 24)
        : id;
    const order =
      typeof raw.order === 'number' && Number.isFinite(raw.order)
        ? Math.round(raw.order)
        : index;
    seen.add(id);
    next.push({ id, label, order });
  }
  if (next.length === 0) return undefined;
  return next.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
};

/** 从旧版 stageLabels 迁移，或回退到内置五段 */
export const stagesFromLegacyLabels = (value: unknown): StageDefinition[] | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  let changed = false;
  const stages = BUILTIN_STAGES.map((stage) => {
    const label = raw[stage.id];
    if (typeof label === 'string' && label.trim() && label.trim() !== stage.label) {
      changed = true;
      return { ...stage, label: label.trim().slice(0, 24) };
    }
    return { ...stage };
  });
  return changed ? stages : undefined;
};

export const resolveStages = (doc?: Pick<SkillGraphDocument, 'stages'> | null): StageDefinition[] => {
  const custom = normalizeStages(doc?.stages);
  if (custom && custom.length > 0) return custom;
  return BUILTIN_STAGES.map((stage) => ({ ...stage }));
};

export const resolveStageLabel = (
  stages: StageDefinition[],
  stageId: SkillStage,
): string => stages.find((stage) => stage.id === stageId)?.label ?? stageId;

export const exportSkillGraphToJSON = (document: SkillGraphDocument): string => {
  return JSON.stringify(document, null, 2);
};

export const isSkillGraphDocumentShape = (value: unknown): value is SkillGraphDocument => {
  if (!value || typeof value !== 'object') return false;
  const doc = value as Record<string, unknown>;
  return Array.isArray(doc.skills);
};

export const importSkillGraphFromJSON = (json: string): SkillGraphDocument => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid skill graph format');

    const doc = parsed as SkillGraphDocument & { stageLabels?: unknown };
    if (!Array.isArray(doc.skills)) throw new Error('Missing skills array');
    const stages =
      normalizeStages(doc.stages) ?? stagesFromLegacyLabels(doc.stageLabels);

    return {
      version: doc.version || 1,
      skills: doc.skills.map((skill) => validateSkill(skill)),
      ...(stages ? { stages } : {}),
    };
  } catch (error) {
    throw new Error(`Failed to parse skill graph: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const TEACH_MODES: TeachMode[] = ['guided', 'challenge', 'demo'];

export const TEACH_MODE_OPTIONS: { value: TeachMode; label: string }[] = [
  { value: 'guided', label: 'Guided（引导）' },
  { value: 'challenge', label: 'Challenge（挑战）' },
  { value: 'demo', label: 'Demo（演示）' },
];

export const getTeachModeLabel = (mode: TeachMode | string | undefined): string => {
  const normalized = normalizeTeachMode(mode);
  return TEACH_MODE_OPTIONS.find((option) => option.value === normalized)?.label ?? normalized;
};

export const normalizeTeachMode = (value: unknown): TeachMode =>
  TEACH_MODES.includes(value as TeachMode) ? (value as TeachMode) : 'guided';

export const normalizeDifficulty = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
};

export const normalizeStage = (value: unknown, fallback: SkillStage = 'cross'): SkillStage =>
  normalizeStageId(value, fallback);

export const normalizeBinding = (raw: unknown): LevelSkillBinding | null => {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.skillId !== 'string' || !b.skillId) return null;
  return {
    skillId: b.skillId,
    cfopStage: normalizeStage(b.cfopStage),
    teachMode: normalizeTeachMode(b.teachMode),
    formulaDifficulty: normalizeDifficulty(b.formulaDifficulty),
  };
};

/** Migrate legacy single-skill entry or normalize v2 `skills[]` (may return multiple). */
export const normalizeLevelSkillMapEntry = (raw: unknown): LevelSkillMapEntry | null => {
  if (!raw || typeof raw !== 'object') return null;
  const entry = raw as Record<string, unknown>;

  if (Array.isArray(entry.skills)) {
    const skills: LevelSkillBinding[] = [];
    const seen = new Set<string>();
    for (const item of entry.skills) {
      const binding = normalizeBinding(item);
      if (!binding || seen.has(binding.skillId)) continue;
      seen.add(binding.skillId);
      skills.push(binding);
    }
    if (skills.length === 0) return null;
    return { skills };
  }

  if (typeof entry.skillId === 'string' && entry.skillId) {
    return {
      skills: [
        {
          skillId: entry.skillId,
          cfopStage: normalizeStage(entry.cfopStage),
          teachMode: normalizeTeachMode(entry.teachMode),
          formulaDifficulty: normalizeDifficulty(entry.formulaDifficulty),
        },
      ],
    };
  }

  return null;
};

export const getPrimaryBinding = (entry?: LevelSkillMapEntry | null): LevelSkillBinding | null => {
  if (!entry?.skills?.length) return null;
  return entry.skills[0] ?? null;
};

export const bindingFromSkill = (
  skill: Pick<SkillDefinition, 'id' | 'stage'>,
  teachMode: TeachMode = 'guided',
  formulaDifficulty = 1,
): LevelSkillBinding => ({
  skillId: skill.id,
  cfopStage: skill.stage,
  teachMode: normalizeTeachMode(teachMode),
  formulaDifficulty: normalizeDifficulty(formulaDifficulty),
});

/** Export App v1 contract: { version: 1, map: { [levelId]: flat binding } }. */
export const exportLevelSkillMapToJSON = (map: LevelSkillMap): string => {
  const appMap: Record<string, LevelSkillBinding> = {};
  for (const [levelId, entry] of Object.entries(map.mappings)) {
    const primary = getPrimaryBinding(entry);
    if (!primary) continue;
    appMap[levelId] = {
      skillId: primary.skillId,
      cfopStage: primary.cfopStage,
      teachMode: primary.teachMode,
      formulaDifficulty: primary.formulaDifficulty,
    };
  }
  return JSON.stringify({ version: LEVEL_SKILL_MAP_VERSION, map: appMap }, null, 2);
};

/**
 * Import App v1 (`map`) or legacy desktop v2 (`mappings`).
 * Multi-skill entries are NOT silently reduced — they go into `ambiguous`.
 */
export const importLevelSkillMapFromJSON = (json: string): LevelSkillMapImportResult => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid level skill map format');

    const root = parsed as { version?: number; map?: unknown; mappings?: unknown };
    const source =
      root.map && typeof root.map === 'object'
        ? (root.map as Record<string, unknown>)
        : root.mappings && typeof root.mappings === 'object'
          ? (root.mappings as Record<string, unknown>)
          : null;

    if (!source) throw new Error('Missing map/mappings object');

    const mappings: Record<string, LevelSkillMapEntry> = {};
    const ambiguous: Record<string, LevelSkillBinding[]> = {};

    for (const [levelId, rawEntry] of Object.entries(source)) {
      const normalized = normalizeLevelSkillMapEntry(rawEntry);
      if (!normalized) continue;
      if (normalized.skills.length > 1) {
        ambiguous[levelId] = normalized.skills.map((b) => ({ ...b }));
        continue;
      }
      mappings[levelId] = { skills: [{ ...normalized.skills[0] }] };
    }

    return {
      map: {
        version: LEVEL_SKILL_MAP_VERSION,
        mappings,
      },
      ambiguous,
    };
  } catch (error) {
    throw new Error(`Failed to parse level skill map: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/** Convert cloud/pull multi-row groups into map + ambiguous without silent pick. */
export const splitMultiBindings = (
  mappings: Record<string, LevelSkillMapEntry>,
): LevelSkillMapImportResult => {
  const resolved: Record<string, LevelSkillMapEntry> = {};
  const ambiguous: Record<string, LevelSkillBinding[]> = {};
  for (const [levelId, entry] of Object.entries(mappings)) {
    if (entry.skills.length > 1) {
      ambiguous[levelId] = entry.skills.map((b) => ({ ...b }));
    } else if (entry.skills.length === 1) {
      resolved[levelId] = { skills: [{ ...entry.skills[0] }] };
    }
  }
  return {
    map: { version: LEVEL_SKILL_MAP_VERSION, mappings: resolved },
    ambiguous,
  };
};

const validateSkill = (skill: unknown): SkillDefinition => {
  if (!skill || typeof skill !== 'object') throw new Error('Invalid skill');

  const s = skill as Record<string, unknown>;
  if (typeof s.id !== 'string') throw new Error('Skill must have string id');
  if (typeof s.stage !== 'string' || !isValidStageId(s.stage.trim().toLowerCase())) {
    throw new Error('Invalid stage');
  }
  if (typeof s.displayNameZh !== 'string') throw new Error('Skill must have displayNameZh');
  if (typeof s.displayNameEn !== 'string') throw new Error('Skill must have displayNameEn');
  if (typeof s.goal !== 'string') throw new Error('Skill must have goal');
  if (!Array.isArray(s.prerequisites)) throw new Error('Prerequisites must be array');
  if (!['guided_only', 'guided_and_one_star', 'two_stars'].includes(s.masteryStandard as string)) {
    throw new Error('Invalid masteryStandard');
  }
  if (typeof s.order !== 'number') throw new Error('Order must be number');

  return {
    id: s.id,
    stage: normalizeStageId(s.stage),
    displayNameZh: s.displayNameZh,
    displayNameEn: s.displayNameEn,
    goal: s.goal,
    prerequisites: s.prerequisites as string[],
    masteryStandard: s.masteryStandard as SkillDefinition['masteryStandard'],
    order: s.order,
    draft: s.draft === true,
  };
};

export const validateSkillGraph = (doc: SkillGraphDocument): string[] => {
  const errors: string[] = [];
  const skillIds = new Set<string>();

  for (const skill of doc.skills) {
    if (skillIds.has(skill.id)) {
      errors.push(`Duplicate skill id: ${skill.id}`);
    }
    skillIds.add(skill.id);
  }

  // 先收集全部 id，再校验前置依赖（云端按 stage 排序时 full 会排在 pll 前）
  for (const skill of doc.skills) {
    for (const prereq of skill.prerequisites) {
      if (!skillIds.has(prereq)) {
        errors.push(`Skill ${skill.id} references undefined prerequisite: ${prereq}`);
      }
    }
  }

  return errors;
};

export type PublishCheckIssue = {
  level: 'error' | 'warning';
  code: string;
  message: string;
  levelId?: string;
  skillId?: string;
};

export type RecommendStatus = {
  ok: boolean;
  reasons: string[];
};

export const getLevelRecommendStatus = (
  level: LevelDefinition,
  binding: LevelSkillBinding | null,
  skill: SkillDefinition | undefined,
): RecommendStatus => {
  const reasons: string[] = [];
  if (!binding) {
    reasons.push('未设置主能力标签');
    return { ok: false, reasons };
  }
  if (!skill) {
    reasons.push(`主能力标签不存在：${binding.skillId}`);
    return { ok: false, reasons };
  }
  if (skill.draft) {
    reasons.push('主能力标签为草稿，不能进入推荐');
  }
  if (binding.cfopStage !== skill.stage) {
    reasons.push(`cfopStage（${binding.cfopStage}）与标签 stage（${skill.stage}）不一致`);
  }
  if (binding.formulaDifficulty < 1 || binding.formulaDifficulty > 6) {
    reasons.push('推荐难度必须在 1～6');
  }
  if (binding.teachMode === 'guided' || binding.teachMode === 'demo') {
    const guidance = level.guidanceFormula?.trim();
    if (!guidance) {
      reasons.push('Guided/Demo 关缺少 guidanceFormula');
    } else {
      const summary = getLevelGuidanceSummary({ ...level, guidanceFormula: guidance });
      if (summary.status !== 'ready') {
        reasons.push(summary.message || 'guidanceFormula 不可执行');
      }
    }
  } else {
    const summary = getLevelGuidanceSummary(level);
    if (summary.status === 'missing') {
      reasons.push('缺少可执行公式（rotation 或 guidance）');
    } else if (summary.status === 'invalid') {
      reasons.push(summary.message || '公式不可执行');
    }
  }
  return { ok: reasons.length === 0, reasons };
};

export const validateLevelSkillMapForPublish = (
  map: LevelSkillMap,
  levels: LevelDefinition[],
  skills: SkillDefinition[],
  ambiguousLevelIds: string[] = [],
): PublishCheckIssue[] => {
  const issues: PublishCheckIssue[] = [];
  const levelById = new Map(levels.map((l) => [l.id, l]));
  const skillById = new Map(skills.map((s) => [s.id, s]));
  const mappedLevelIds = new Set(Object.keys(map.mappings));

  for (const levelId of ambiguousLevelIds) {
    issues.push({
      level: 'error',
      code: 'ambiguous_primary',
      message: `关卡 ${levelId} 存在多个能力标签，请先选择主能力标签`,
      levelId,
    });
  }

  for (const [levelId, entry] of Object.entries(map.mappings)) {
    if (entry.skills.length !== 1) {
      issues.push({
        level: 'error',
        code: 'not_single_primary',
        message: `关卡 ${levelId} 必须恰好有一个主能力标签`,
        levelId,
      });
      continue;
    }

    const binding = entry.skills[0];
    const level = levelById.get(levelId);
    if (!level) {
      issues.push({
        level: 'error',
        code: 'orphan_mapping',
        message: `映射引用了不存在的关卡：${levelId}`,
        levelId,
        skillId: binding.skillId,
      });
      continue;
    }

    const skill = skillById.get(binding.skillId);
    const status = getLevelRecommendStatus(level, binding, skill);
    for (const reason of status.reasons) {
      issues.push({
        level: 'error',
        code: 'recommend_blocked',
        message: `「${level.title}」：${reason}`,
        levelId,
        skillId: binding.skillId,
      });
    }
  }

  for (const level of levels) {
    if (mappedLevelIds.has(level.id)) continue;
    issues.push({
      level: 'warning',
      code: 'unmapped_level',
      message: `关卡「${level.title}」尚未配置主能力标签`,
      levelId: level.id,
    });
  }

  return issues;
};
