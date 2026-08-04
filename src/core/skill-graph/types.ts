// 阶段 ID 允许内置 CFOP 与自定义字符串；导出到 App 时原样写入 cfopStage
export type SkillStage = string;
export type MasteryStandard = 'guided_only' | 'guided_and_one_star' | 'two_stars';
export type TeachMode = 'guided' | 'challenge' | 'demo';

export interface StageDefinition {
  id: SkillStage;
  label: string;
  order: number;
}

export interface SkillDefinition {
  id: string;
  stage: SkillStage;
  displayNameZh: string;
  displayNameEn: string;
  goal: string;
  prerequisites: string[];
  masteryStandard: MasteryStandard;
  order: number;
  draft?: boolean;
}

export interface SkillGraphDocument {
  version: number;
  skills: SkillDefinition[];
  // 可增删改的阶段列表；缺省时使用内置 CFOP 五段
  stages?: StageDefinition[];
}

/** Single primary binding for a level (App v1: one skill per level). */
export interface LevelSkillBinding {
  skillId: string;
  cfopStage: SkillStage;
  teachMode: TeachMode;
  formulaDifficulty: number;
}

/**
 * Internal entry still uses skills[], but first edition enforces length ≤ 1.
 * Length > 1 only appears transiently during import disambiguation candidates
 * (stored separately in the UI store, not in resolved mappings).
 */
export interface LevelSkillMapEntry {
  skills: LevelSkillBinding[];
}

export interface LevelSkillMap {
  version: number;
  mappings: Record<string, LevelSkillMapEntry>;
}

/** App-facing / export version (single skillId per level). */
export const LEVEL_SKILL_MAP_VERSION = 1;

export type LevelSkillMapImportResult = {
  map: LevelSkillMap;
  /** levelId → candidate bindings when legacy v2 had multiple skills */
  ambiguous: Record<string, LevelSkillBinding[]>;
};
