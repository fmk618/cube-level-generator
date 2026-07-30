import { create } from 'zustand';
import type { SkillGraphDocument, SkillDefinition } from '@/core/skill-graph/types';
import {
  exportSkillGraphToJSON,
  importSkillGraphFromJSON,
  isSkillGraphDocumentShape,
  validateSkillGraph,
} from '@/core/skill-graph/utils';

type SkillGraphState = {
  skillGraph: SkillGraphDocument | null;
  savedSkillGraph: SkillGraphDocument | null;
  skills: SkillDefinition[];
  isLoaded: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  runtimeFilePath: string | null;
  loadError: string | null;

  refreshSkillGraph: () => Promise<void>;
  importSkillGraphFromJSON: (json: string) => void;
  importFromDisk: () => Promise<boolean>;
  exportToDisk: () => Promise<string | null>;
  saveSkillGraph: () => Promise<string>;
  discardChanges: () => void;
  resetToDefault: () => Promise<void>;

  createSkill: (input: Omit<SkillDefinition, 'id'>) => SkillDefinition;
  updateSkill: (skillId: string, partial: Partial<SkillDefinition>) => SkillDefinition | null;
  deleteSkill: (skillId: string) => void;
  getSkillById: (skillId: string) => SkillDefinition | undefined;
  getSkillsByStage: (stage: SkillDefinition['stage']) => SkillDefinition[];
  applyAiSkillProposals: (
    proposals: Array<{
      action: 'create' | 'update';
      id: string;
      stage: SkillDefinition['stage'];
      displayNameZh: string;
      displayNameEn: string;
      goal: string;
      prerequisites: string[];
      masteryStandard: SkillDefinition['masteryStandard'];
      order: number;
    }>,
  ) => { created: number; updated: number };
};

const generateSkillId = (stage: string): string => {
  return `${stage}.${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
};

const cloneSkillGraph = (doc: SkillGraphDocument): SkillGraphDocument => ({
  version: doc.version,
  skills: doc.skills.map((skill) => ({ ...skill })),
});

const applySkillGraph = (
  set: typeof useSkillGraphStore.setState,
  skillGraph: SkillGraphDocument,
  savedSkillGraph: SkillGraphDocument | null,
  hasChanged: boolean,
) => {
  const skills = [...skillGraph.skills].sort((a, b) => {
    const stageOrder = { cross: 0, f2l: 1, oll: 2, pll: 3, full: 4 };
    const stageDiff =
      (stageOrder[a.stage] ?? 999) - (stageOrder[b.stage] ?? 999);
    if (stageDiff !== 0) return stageDiff;
    return a.order - b.order;
  });

  set({
    skillGraph,
    savedSkillGraph,
    skills,
    hasUnsavedChanges: hasChanged,
    loadError: null,
  });
};

export const useSkillGraphStore = create<SkillGraphState>((set, get) => ({
  skillGraph: null,
  savedSkillGraph: null,
  skills: [],
  isLoaded: false,
  isLoading: false,
  hasUnsavedChanges: false,
  runtimeFilePath: null,
  loadError: null,

  refreshSkillGraph: async () => {
    const state = get();
    if (state.hasUnsavedChanges && state.skillGraph) return;

    set({ isLoading: true, loadError: null });
    try {
      let skillGraph: SkillGraphDocument | null = null;
      let runtimeFilePath: string | null = null;

      try {
        const cloud = await Promise.race([
          window.api.db.pullSkills(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 8000);
          }),
        ]);
        if (cloud && Array.isArray(cloud.skills) && cloud.skills.length > 0) {
          skillGraph = cloud;
        }
      } catch {
        // 云端不可用时回退本地
      }

      if (!skillGraph) {
        const runtime = await window.api.skillGraph.loadRuntime();
        runtimeFilePath = runtime?.filePath ?? null;
        if (runtime?.content) {
          try {
            const parsed = JSON.parse(runtime.content) as unknown;
            if (isSkillGraphDocumentShape(parsed)) {
              skillGraph = importSkillGraphFromJSON(runtime.content);
            }
          } catch {
            skillGraph = null;
            runtimeFilePath = null;
          }
        }
      }

      const usedDefaultFallback = !skillGraph;
      if (!skillGraph) {
        const json = await window.api.skillGraph.loadDefault();
        skillGraph = importSkillGraphFromJSON(json);
        if (usedDefaultFallback) {
          try {
            runtimeFilePath = await window.api.skillGraph.saveRuntime(json);
          } catch {
            // 修复本地损坏文件失败不影响继续使用默认模版
          }
        }
      }

      const errors = validateSkillGraph(skillGraph);
      if (errors.length > 0) {
        set({ isLoading: false, loadError: errors.join('; ') });
        return;
      }
      applySkillGraph(set, skillGraph, cloneSkillGraph(skillGraph), false);
      set({
        isLoaded: true,
        isLoading: false,
        runtimeFilePath,
      });
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  importSkillGraphFromJSON: (json: string) => {
    try {
      const skillGraph = importSkillGraphFromJSON(json);
      const errors = validateSkillGraph(skillGraph);
      if (errors.length > 0) {
        set({ loadError: errors.join('; ') });
        return;
      }
      applySkillGraph(set, skillGraph, null, true);
      set({ isLoaded: true });
    } catch (error) {
      set({
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  importFromDisk: async () => {
    set({ isLoading: true });
    try {
      const result = await window.api.skillGraph.importFromDisk();
      if (!result) return false;
      get().importSkillGraphFromJSON(result.content);
      set({ runtimeFilePath: result.filePath });
      return true;
    } catch (error) {
      set({
        loadError: error instanceof Error ? error.message : String(error),
      });
      return false;
    } finally {
      set({ isLoading: false });
    }
  },

  exportToDisk: async () => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return null;
    const json = exportSkillGraphToJSON(skillGraph);
    return window.api.skillGraph.exportToDisk(json, 'skill_graph_cfop.json');
  },

  saveSkillGraph: async () => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');
    const json = exportSkillGraphToJSON(skillGraph);
    const filePath = await window.api.skillGraph.saveRuntime(json);
    try {
      await window.api.db.pushSkills(skillGraph);
    } catch (error) {
      throw new Error(
        `本地已保存，但云端同步失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    applySkillGraph(set, skillGraph, cloneSkillGraph(skillGraph), false);
    set({ runtimeFilePath: filePath });
    return filePath;
  },

  discardChanges: () => {
    const savedSkillGraph = get().savedSkillGraph;
    if (!savedSkillGraph) return;
    applySkillGraph(set, savedSkillGraph, savedSkillGraph, false);
  },

  resetToDefault: async () => {
    set({ isLoading: true });
    try {
      const json = await window.api.skillGraph.loadDefault();
      const skillGraph = importSkillGraphFromJSON(json);
      applySkillGraph(set, skillGraph, cloneSkillGraph(skillGraph), false);
      set({ isLoaded: true });
    } catch (error) {
      set({
        loadError: error instanceof Error ? error.message : String(error),
      });
    } finally {
      set({ isLoading: false });
    }
  },

  createSkill: (input) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');

    const skillId = generateSkillId(input.stage);
    const newSkill: SkillDefinition = {
      ...input,
      id: skillId,
      draft: true,
    };

    const nextSkillGraph: SkillGraphDocument = {
      version: skillGraph.version,
      skills: [...skillGraph.skills, newSkill],
    };

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);

    return nextSkillGraph.skills.find((skill) => skill.id === skillId)!;
  },

  updateSkill: (skillId, partial) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return null;

    const currentSkill = skillGraph.skills.find((skill) => skill.id === skillId);
    if (!currentSkill) return null;

    const updatedSkill: SkillDefinition = {
      ...currentSkill,
      ...partial,
      id: currentSkill.id,
    };

    const nextSkillGraph: SkillGraphDocument = {
      version: skillGraph.version,
      skills: skillGraph.skills.map((skill) =>
        skill.id === skillId ? updatedSkill : skill,
      ),
    };

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);

    return nextSkillGraph.skills.find((skill) => skill.id === skillId) ?? null;
  },

  deleteSkill: (skillId) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return;

    // Check if any other skill depends on this
    const dependents = skillGraph.skills.filter((skill) =>
      skill.prerequisites.includes(skillId),
    );
    if (dependents.length > 0) {
      throw new Error(
        `Cannot delete skill "${skillId}" - it is required by: ${dependents.map((s) => s.id).join(', ')}`,
      );
    }

    const nextSkillGraph: SkillGraphDocument = {
      version: skillGraph.version,
      skills: skillGraph.skills.filter((skill) => skill.id !== skillId),
    };

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
  },

  getSkillById: (skillId: string) => {
    const skillGraph = get().skillGraph;
    return skillGraph?.skills.find((skill) => skill.id === skillId);
  },

  getSkillsByStage: (stage) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return [];
    return skillGraph.skills.filter((skill) => skill.stage === stage);
  },

  applyAiSkillProposals: (proposals) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');

    let created = 0;
    let updated = 0;
    const skills = skillGraph.skills.map((s) => ({ ...s }));

    for (const proposal of proposals) {
      if (proposal.action === 'update') {
        const idx = skills.findIndex((s) => s.id === proposal.id);
        if (idx < 0) continue;
        skills[idx] = {
          ...skills[idx],
          stage: proposal.stage,
          displayNameZh: proposal.displayNameZh,
          displayNameEn: proposal.displayNameEn,
          goal: proposal.goal,
          prerequisites: [...proposal.prerequisites],
          masteryStandard: proposal.masteryStandard,
          order: proposal.order,
        };
        updated += 1;
      } else {
        if (skills.some((s) => s.id === proposal.id)) continue;
        skills.push({
          id: proposal.id,
          stage: proposal.stage,
          displayNameZh: proposal.displayNameZh,
          displayNameEn: proposal.displayNameEn,
          goal: proposal.goal,
          prerequisites: [...proposal.prerequisites],
          masteryStandard: proposal.masteryStandard,
          order: proposal.order,
          draft: true,
        });
        created += 1;
      }
    }

    const nextSkillGraph: SkillGraphDocument = {
      version: skillGraph.version,
      skills,
    };
    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
    return { created, updated };
  },
}));
