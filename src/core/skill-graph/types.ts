export type SkillStage = 'cross' | 'f2l' | 'oll' | 'pll' | 'full';
export type MasteryStandard = 'guided_only' | 'guided_and_one_star' | 'two_stars';
export type TeachMode = 'guided' | 'challenge' | 'demo';

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
