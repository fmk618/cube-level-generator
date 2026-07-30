export type SkillStage = 'cross' | 'f2l' | 'oll' | 'pll' | 'full';
export type MasteryStandard = 'guided_only' | 'guided_and_one_star' | 'two_stars';

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

export interface LevelSkillMapEntry {
  skillId?: string;
  cfopStage?: SkillStage;
  teachMode: 'guided' | 'challenge' | 'demo';
  formulaDifficulty: number;
}

export interface LevelSkillMap {
  version: number;
  mappings: Record<string, LevelSkillMapEntry>;
}
