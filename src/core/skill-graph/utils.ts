import type { SkillGraphDocument, LevelSkillMap, SkillDefinition } from './types';

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

export const importLevelSkillMapFromJSON = (json: string): LevelSkillMap => {
  try {
    const parsed = JSON.parse(json) as unknown;
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid level skill map format');

    const map = parsed as LevelSkillMap;
    if (typeof map.mappings !== 'object') throw new Error('Missing mappings object');

    return {
      version: map.version || 1,
      mappings: map.mappings,
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
