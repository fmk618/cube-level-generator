import { create } from 'zustand';
import type { SkillGraphDocument, SkillDefinition, StageDefinition } from '@/core/skill-graph/types';
import {
  exportSkillGraphToJSON,
  importSkillGraphFromJSON,
  isSkillGraphDocumentShape,
  isValidStageId,
  normalizeStageId,
  resolveStages,
  validateSkillGraph,
} from '@/core/skill-graph/utils';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';

type SkillGraphState = {
  skillGraph: SkillGraphDocument | null;
  savedSkillGraph: SkillGraphDocument | null;
  skills: SkillDefinition[];
  isLoaded: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  runtimeFilePath: string | null;
  loadError: string | null;

  refreshSkillGraph: (options?: { force?: boolean; persistLocal?: boolean }) => Promise<void>;
  importSkillGraphFromJSON: (json: string) => void;
  importFromDisk: () => Promise<boolean>;
  exportToDisk: () => Promise<string | null>;
  saveSkillGraph: () => Promise<string>;
  /** 仅写本地 runtime，不推远程 */
  saveLocal: (options?: { manageSync?: boolean }) => Promise<string>;
  /** 仅推当前能力标签到 MySQL */
  pushRemote: (options?: { manageSync?: boolean }) => Promise<void>;
  discardChanges: () => void;
  resetToDefault: () => Promise<void>;

  createSkill: (input: Omit<SkillDefinition, 'id'> & { id?: string }) => SkillDefinition;
  updateSkill: (skillId: string, partial: Partial<SkillDefinition>) => SkillDefinition | null;
  addStage: (input: { id: string; label: string }) => StageDefinition;
  updateStage: (stageId: string, partial: { label?: string; order?: number }) => void;
  removeStage: (stageId: string) => void;
  deleteSkill: (skillId: string) => void;
  getSkillsReferencing: (skillId: string) => string[];
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
  ...(doc.stages ? { stages: doc.stages.map((stage) => ({ ...stage })) } : {}),
});

const withSkills = (
  skillGraph: SkillGraphDocument,
  skills: SkillDefinition[],
): SkillGraphDocument => ({
  ...skillGraph,
  skills,
});

const withStages = (
  skillGraph: SkillGraphDocument,
  stages: StageDefinition[],
): SkillGraphDocument => ({
  ...skillGraph,
  stages: stages.map((stage) => ({ ...stage })),
});

const applySkillGraph = (
  set: typeof useSkillGraphStore.setState,
  skillGraph: SkillGraphDocument,
  savedSkillGraph: SkillGraphDocument | null,
  hasChanged: boolean,
) => {
  const stageOrder = new Map(
    resolveStages(skillGraph).map((stage) => [stage.id, stage.order] as const),
  );
  const skills = [...skillGraph.skills].sort((a, b) => {
    const stageDiff =
      (stageOrder.get(a.stage) ?? 999) - (stageOrder.get(b.stage) ?? 999);
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

  refreshSkillGraph: async (options) => {
    const force = options?.force === true;
    const persistLocal = options?.persistLocal === true;
    const state = get();
    if (!force && state.hasUnsavedChanges && state.skillGraph) return;
    // 若已在加载但超过卡住阈值，允许强制重入
    if (!force && state.isLoading && state.skillGraph) return;

    set({ isLoading: true, loadError: null });
    try {
      let skillGraph: SkillGraphDocument | null = null;
      let runtimeFilePath: string | null = null;
      let fromCloud = false;

      // 强制拉取：云端优先；平时仍本地优先避免启动被 MySQL 卡住
      if (force) {
        type PullOutcome =
          | { status: 'data'; cloud: NonNullable<Awaited<ReturnType<typeof window.api.db.pullSkills>>> }
          | { status: 'empty' }
          | { status: 'timeout' }
          | { status: 'error'; error: Error };

        let settled = false;
        const outcome = await Promise.race([
          window.api.db.pullSkills()
            .then((cloud): PullOutcome => {
              settled = true;
              if (cloud && Array.isArray(cloud.skills) && cloud.skills.length > 0) {
                return { status: 'data', cloud };
              }
              return { status: 'empty' };
            })
            .catch((error: unknown): PullOutcome => {
              settled = true;
              return {
                status: 'error',
                error: error instanceof Error ? error : new Error(String(error)),
              };
            }),
          new Promise<PullOutcome>((resolve) => {
            window.setTimeout(() => {
              if (!settled) resolve({ status: 'timeout' });
            }, 30_000);
          }),
        ]);

        if (outcome.status === 'data') {
          const cloud = outcome.cloud;
          const cloudErrors = validateSkillGraph(cloud);
          if (cloudErrors.length > 0) {
            throw new Error(cloudErrors.join('; '));
          }
          if (!cloud.stages || cloud.stages.length === 0) {
            throw new Error(
              '云端能力标签缺少阶段定义（skill_stages 为空）。请在源电脑重新「保存到本地」同步阶段后再拉取',
            );
          }
          skillGraph = cloud;
          fromCloud = true;
        } else if (persistLocal) {
          if (outcome.status === 'error') throw outcome.error;
          if (outcome.status === 'timeout') {
            throw new Error('拉取能力标签超时（30 秒）。请检查网络与数据库连接后重试');
          }
          throw new Error(
            '云端暂无能力标签数据。请先在源电脑打开「AI 能力标签」并保存同步到云端后再拉取',
          );
        }
      }

      if (!skillGraph) {
        try {
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
        } catch {
          // 本地 runtime 不可读时回退默认
        }
      }

      if (!skillGraph) {
        const json = await window.api.skillGraph.loadDefault();
        skillGraph = importSkillGraphFromJSON(json);
        void window.api.skillGraph.saveRuntime(json).then((path) => {
          if (!get().runtimeFilePath) {
            set({ runtimeFilePath: path });
          }
        }).catch(() => undefined);
      }

      const errors = validateSkillGraph(skillGraph);
      if (errors.length > 0) {
        set({ isLoading: false, loadError: errors.join('; ') });
        return;
      }

      if (persistLocal && fromCloud) {
        runtimeFilePath = await window.api.skillGraph.saveRuntime(exportSkillGraphToJSON(skillGraph));
      }

      if (!force && get().hasUnsavedChanges) {
        set({ isLoading: false });
        return;
      }

      applySkillGraph(set, skillGraph, cloneSkillGraph(skillGraph), false);
      set({
        isLoaded: true,
        isLoading: false,
        runtimeFilePath: runtimeFilePath ?? get().runtimeFilePath,
      });

      // 非强制：云端后台拉取，有数据且本地无未保存改动时再覆盖
      if (!force) {
        void (async () => {
          try {
            const cloud = await Promise.race([
              window.api.db.pullSkills(),
              new Promise<null>((resolve) => {
                window.setTimeout(() => resolve(null), 5000);
              }),
            ]);
            if (!cloud || !Array.isArray(cloud.skills) || cloud.skills.length === 0) return;
            if (get().hasUnsavedChanges) return;
            const cloudErrors = validateSkillGraph(cloud);
            if (cloudErrors.length > 0) return;
            // 旧云端数据可能没有 stages：勿用空阶段覆盖本机已有自定义阶段
            const current = get().skillGraph;
            const merged: SkillGraphDocument = {
              ...cloud,
              stages:
                cloud.stages && cloud.stages.length > 0
                  ? cloud.stages
                  : current?.stages,
            };
            applySkillGraph(set, merged, cloneSkillGraph(merged), false);
          } catch {
            // 云端失败不影响已展示的本地技能树
          }
        })();
      }
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : String(error),
      });
      throw error;
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
      const message = error instanceof Error ? error.message : String(error);
      set({
        loadError: message,
      });
      throw new Error(message);
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
      const message = error instanceof Error ? error.message : String(error);
      set({
        loadError: message,
      });
      throw new Error(message);
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

  saveSkillGraph: async () => get().saveLocal(),

  saveLocal: async (options) => {
    const manageSync = options?.manageSync !== false;
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');
    const sync = useCloudSyncStore.getState();
    if (manageSync) sync.beginLocal('正在保存能力标签到本地…');
    const json = exportSkillGraphToJSON(skillGraph);
    const filePath = await window.api.skillGraph.saveRuntime(json);
    applySkillGraph(set, skillGraph, cloneSkillGraph(skillGraph), false);
    set({ runtimeFilePath: filePath });
    const snapshot = {
      ...skillGraph,
      stages: resolveStages(skillGraph),
    };
    if (manageSync) {
      sync.finishOk(
        `能力标签已保存到本地（未推远程；${snapshot.stages.length} 个阶段 / ${snapshot.skills.length} 个标签）`,
      );
    }
    return filePath;
  },

  pushRemote: async (options) => {
    const manageSync = options?.manageSync !== false;
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');
    const sync = useCloudSyncStore.getState();
    const snapshot = {
      ...skillGraph,
      stages: resolveStages(skillGraph),
    };
    if (manageSync) sync.markCloud('正在上传能力标签到云端…', 70);
    try {
      await window.api.db.pushSkills(snapshot);
      if (manageSync) {
        sync.finishOk(
          `能力标签已推送到远程（${snapshot.stages.length} 个阶段 / ${snapshot.skills.length} 个标签）`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (manageSync) sync.finishError(message, '能力标签远程推送失败');
      throw new Error(`能力标签远程推送失败：${message}`);
    }
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

    const skillId = (input.id?.trim() || generateSkillId(input.stage)).trim();
    if (!skillId) throw new Error('标签 ID 不能为空');
    if (skillGraph.skills.some((s) => s.id === skillId)) {
      throw new Error(`标签 ID 已存在：${skillId}`);
    }

    const { id: _ignored, ...rest } = input;
    const newSkill: SkillDefinition = {
      ...rest,
      id: skillId,
      draft: input.draft ?? true,
    };

    const nextSkillGraph = withSkills(skillGraph, [...skillGraph.skills, newSkill]);

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);

    return nextSkillGraph.skills.find((skill) => skill.id === skillId)!;
  },

  updateSkill: (skillId, partial) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return null;

    const currentSkill = skillGraph.skills.find((skill) => skill.id === skillId);
    if (!currentSkill) return null;

    if (partial.id && partial.id !== skillId) {
      throw new Error('已创建的标签 ID 不可修改');
    }

    const updatedSkill: SkillDefinition = {
      ...currentSkill,
      ...partial,
      id: currentSkill.id,
    };

    const nextSkillGraph = withSkills(
      skillGraph,
      skillGraph.skills.map((skill) => (skill.id === skillId ? updatedSkill : skill)),
    );

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);

    return nextSkillGraph.skills.find((skill) => skill.id === skillId) ?? null;
  },

  addStage: (input) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) throw new Error('Skill graph not loaded');

    const id = normalizeStageId(input.id, '');
    if (!id || !isValidStageId(id)) {
      throw new Error('阶段 ID 需为小写字母开头，仅含 a-z / 0-9 / _，最长 32');
    }
    const label = input.label.trim();
    if (!label) throw new Error('阶段显示名不能为空');

    const stages = resolveStages(skillGraph);
    if (stages.some((stage) => stage.id === id)) {
      throw new Error(`阶段 ID 已存在：${id}`);
    }

    const nextStage: StageDefinition = {
      id,
      label: label.slice(0, 24),
      order: Math.max(0, ...stages.map((stage) => stage.order)) + 1,
    };
    const nextSkillGraph = withStages(skillGraph, [...stages, nextStage]);
    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
    return nextStage;
  },

  updateStage: (stageId, partial) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return;

    const stages = resolveStages(skillGraph);
    if (!stages.some((stage) => stage.id === stageId)) {
      throw new Error(`找不到阶段：${stageId}`);
    }

    const nextStages = stages.map((stage) => {
      if (stage.id !== stageId) return stage;
      return {
        ...stage,
        label:
          typeof partial.label === 'string' && partial.label.trim()
            ? partial.label.trim().slice(0, 24)
            : stage.label,
        order:
          typeof partial.order === 'number' && Number.isFinite(partial.order)
            ? Math.round(partial.order)
            : stage.order,
      };
    });

    const nextSkillGraph = withStages(skillGraph, nextStages);
    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
  },

  removeStage: (stageId) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return;

    const stages = resolveStages(skillGraph);
    if (stages.length <= 1) {
      throw new Error('至少保留一个阶段');
    }
    if (!stages.some((stage) => stage.id === stageId)) {
      throw new Error(`找不到阶段：${stageId}`);
    }
    const usedBy = skillGraph.skills.filter((skill) => skill.stage === stageId);
    if (usedBy.length > 0) {
      throw new Error(`无法删除：仍有 ${usedBy.length} 个能力标签使用该阶段`);
    }

    const nextSkillGraph = withStages(
      skillGraph,
      stages.filter((stage) => stage.id !== stageId),
    );
    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
  },

  deleteSkill: (skillId) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return;

    const dependents = skillGraph.skills.filter((skill) =>
      skill.prerequisites.includes(skillId),
    );
    if (dependents.length > 0) {
      throw new Error(
        `无法删除「${skillId}」— 仍被前置依赖：${dependents.map((s) => s.id).join(', ')}`,
      );
    }

    const nextSkillGraph = withSkills(
      skillGraph,
      skillGraph.skills.filter((skill) => skill.id !== skillId),
    );

    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
  },

  getSkillsReferencing: (skillId) => {
    const skillGraph = get().skillGraph;
    if (!skillGraph) return [];
    return skillGraph.skills
      .filter((skill) => skill.prerequisites.includes(skillId))
      .map((skill) => skill.id);
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

    const nextSkillGraph = withSkills(skillGraph, skills);
    const savedSkillGraph = get().savedSkillGraph ?? skillGraph;
    applySkillGraph(set, nextSkillGraph, savedSkillGraph, true);
    return { created, updated };
  },
}));
