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

/** One skill binding on a level (mode/difficulty are per skill). */
export interface LevelSkillBinding {
  skillId: string;
  cfopStage: SkillStage;
  teachMode: TeachMode;
  formulaDifficulty: number;
}

export interface LevelSkillMapEntry {
  skills: LevelSkillBinding[];
}

export interface LevelSkillMap {
  version: number;
  mappings: Record<string, LevelSkillMapEntry>;
}

export const LEVEL_SKILL_MAP_VERSION = 2;
