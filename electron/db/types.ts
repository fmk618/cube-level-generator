export type CloudChapter = {
  id: string;
  partNumber: number;
  partName: string;
  title: string;
  description?: string;
  capacity: number;
};

export type CloudLevel = {
  id: string;
  chapterId: string;
  order: number;
  title: string;
  description: string;
  startStateMatrix: unknown;
  goalStateMatrix: unknown;
  goalStateMatrices?: unknown;
  brightnessMatrix: unknown;
  maxMoves: number;
  starThresholds: [number, number];
  hint?: string;
  rotationFormula?: string;
  rotationTarget?: string;
  guidanceFormula?: string;
  guidanceFailureThreshold?: number;
  hidden?: boolean;
};

export type CloudCatalogDocument = {
  version: number;
  chapters: CloudChapter[];
  levels: CloudLevel[];
};

export type CloudSkill = {
  id: string;
  stage: string;
  displayNameZh: string;
  displayNameEn: string;
  goal: string;
  prerequisites: string[];
  masteryStandard: string;
  order: number;
  draft?: boolean;
};

export type CloudSkillStage = {
  id: string;
  label: string;
  order: number;
};

export type CloudSkillGraphDocument = {
  version: number;
  skills: CloudSkill[];
  stages?: CloudSkillStage[];
};

export type CloudLevelSkillBinding = {
  skillId: string;
  cfopStage: string;
  teachMode: string;
  formulaDifficulty: number;
};

export type CloudLevelSkillMap = {
  version: number;
  mappings: Record<string, { skills: CloudLevelSkillBinding[] }>;
};

export type DbPingResult = {
  ok: boolean;
  database: string;
  version: string;
  user: string;
  host: string;
  error?: string;
};
