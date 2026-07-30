import type {
  SkillGraphDocument,
  LevelSkillMap,
  LevelSkillMapEntry,
  LevelSkillBinding,
  SkillDefinition,
  SkillStage,
  TeachMode,
} from './types';
import { LEVEL_SKILL_MAP_VERSION } from './types';

export const exportSkillGraphToJSON = (document: SkillGraphDocument): string => {
  return JSON.stringify(document, null, 2);
};

export const importSkillGraphFromJSON = (json: string): SkillGraphDocument => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid skill graph format');

    const doc = parsed as SkillGraphDocument;
    if (!Array.isArray(doc.skills)) throw new Error('Missing skills array');

    return {
      version: doc.version || 1,
      skills: doc.skills.map((skill) => validateSkill(skill)),
    };
  } catch (error) {
    throw new Error(`Failed to parse skill graph: ${error instanceof Error ? error.message : String(error)}`);
  }
};

export const exportLevelSkillMapToJSON = (map: LevelSkillMap): string => {
  return JSON.stringify(map, null, 2);
};

const STAGES: SkillStage[] = ['cross', 'f2l', 'oll', 'pll', 'full'];
const TEACH_MODES: TeachMode[] = ['guided', 'challenge', 'demo'];

const normalizeTeachMode = (value: unknown): TeachMode =>
  TEACH_MODES.includes(value as TeachMode) ? (value as TeachMode) : 'guided';

const normalizeDifficulty = (value: unknown): number => {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(6, Math.max(1, Math.round(n)));
};

const normalizeStage = (value: unknown, fallback: SkillStage = 'cross'): SkillStage =>
  STAGES.includes(value as SkillStage) ? (value as SkillStage) : fallback;

const normalizeBinding = (raw: unknown): LevelSkillBinding | null => {
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

/** Migrate legacy single-skill entry or normalize v2 `skills[]`. */
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

  // Legacy: top-level skillId + teachMode / difficulty
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

export const importLevelSkillMapFromJSON = (json: string): LevelSkillMap => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid level skill map format');

    const map = parsed as { version?: number; mappings?: unknown };
    if (!map.mappings || typeof map.mappings !== 'object') throw new Error('Missing mappings object');

    const mappings: Record<string, LevelSkillMapEntry> = {};
    for (const [levelId, rawEntry] of Object.entries(map.mappings as Record<string, unknown>)) {
      const normalized = normalizeLevelSkillMapEntry(rawEntry);
      if (normalized) mappings[levelId] = normalized;
    }

    return {
      version: LEVEL_SKILL_MAP_VERSION,
      mappings,
    };
  } catch (error) {
    throw new Error(`Failed to parse level skill map: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const validateSkill = (skill: unknown): SkillDefinition => {
  if (!skill || typeof skill !== 'object') throw new Error('Invalid skill');

  const s = skill as Record<string, unknown>;
  if (typeof s.id !== 'string') throw new Error('Skill must have string id');
  if (!['cross', 'f2l', 'oll', 'pll', 'full'].includes(s.stage as string)) throw new Error('Invalid stage');
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
    stage: s.stage as SkillDefinition['stage'],
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

    for (const prereq of skill.prerequisites) {
      if (!skillIds.has(prereq)) {
        errors.push(`Skill ${skill.id} references undefined prerequisite: ${prereq}`);
      }
    }
  }

  return errors;
};
