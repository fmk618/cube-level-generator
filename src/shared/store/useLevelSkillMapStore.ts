import { create } from 'zustand';
import type {
  LevelSkillMap,
  LevelSkillMapEntry,
  LevelSkillBinding,
  SkillDefinition,
  TeachMode,
} from '@/core/skill-graph/types';
import { LEVEL_SKILL_MAP_VERSION } from '@/core/skill-graph/types';
import {
  bindingFromSkill,
  exportLevelSkillMapToJSON,
  getPrimaryBinding,
  importLevelSkillMapFromJSON,
  normalizeDifficulty,
  normalizeTeachMode,
  splitMultiBindings,
} from '@/core/skill-graph/utils';
import { useCloudSyncStore } from '@/shared/store/useCloudSyncStore';

type LevelSkillMapState = {
  levelSkillMap: LevelSkillMap | null;
  savedLevelSkillMap: LevelSkillMap | null;
  /** levelId → candidates when legacy multi-skill needs a primary pick */
  ambiguous: Record<string, LevelSkillBinding[]>;
  isLoaded: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  loadError: string | null;

  importMapFromJSON: (json: string) => void;
  refreshMap: (options?: { force?: boolean; persistLocal?: boolean }) => Promise<void>;
  importFromDisk: () => Promise<boolean>;
  exportToDisk: () => Promise<string | null>;
  /** Export only when publish checks should gate externally; always writes App v1 JSON. */
  saveMap: () => Promise<string>;
  discardChanges: () => void;

  getPrimary: (levelId: string) => LevelSkillBinding | null;
  setPrimarySkill: (
    levelId: string,
    skill: Pick<SkillDefinition, 'id' | 'stage'>,
    teachMode?: TeachMode,
    formulaDifficulty?: number,
  ) => void;
  updatePrimaryMeta: (
    levelId: string,
    partial: { teachMode?: TeachMode; formulaDifficulty?: number },
  ) => void;
  clearPrimary: (levelId: string) => void;
  batchSetPrimarySkill: (
    levelIds: string[],
    skill: Pick<SkillDefinition, 'id' | 'stage'>,
  ) => void;
  batchSetTeachMode: (levelIds: string[], teachMode: TeachMode) => void;
  batchSetDifficulty: (levelIds: string[], formulaDifficulty: number) => void;

  resolveAmbiguous: (
    levelId: string,
    skillId: string,
    skills: SkillDefinition[],
  ) => void;

  getLevelSkillEntry: (levelId: string) => LevelSkillMapEntry | undefined;
  getMappedCount: () => number;
  getAmbiguousLevelIds: () => string[];

  applyAiMappings: (
    entries: Array<{ levelId: string; binding: LevelSkillBinding | null }>,
  ) => number;

  /** @deprecated use setPrimarySkill — kept for transitional callers */
  updateLevelSkillEntry: (levelId: string, entry: LevelSkillMapEntry) => void;
  deleteLevelSkillEntry: (levelId: string) => void;
};

const cloneMap = (map: LevelSkillMap): LevelSkillMap => ({
  version: map.version,
  mappings: Object.fromEntries(
    Object.entries(map.mappings).map(([id, entry]) => [
      id,
      { skills: entry.skills.slice(0, 1).map((b) => ({ ...b })) },
    ]),
  ),
});

const applyMap = (
  set: typeof useLevelSkillMapStore.setState,
  map: LevelSkillMap,
  savedMap: LevelSkillMap | null,
  hasChanged: boolean,
  ambiguous?: Record<string, LevelSkillBinding[]>,
) => {
  set({
    levelSkillMap: map,
    savedLevelSkillMap: savedMap,
    hasUnsavedChanges: hasChanged,
    loadError: null,
    ...(ambiguous !== undefined ? { ambiguous } : {}),
  });
};

const setLevelEntry = (
  get: () => LevelSkillMapState,
  set: typeof useLevelSkillMapStore.setState,
  levelId: string,
  entry: LevelSkillMapEntry | null,
) => {
  const map = get().levelSkillMap;
  if (!map) return;

  const nextMappings = { ...map.mappings };
  if (!entry || entry.skills.length === 0) {
    delete nextMappings[levelId];
  } else {
    nextMappings[levelId] = { skills: [{ ...entry.skills[0] }] };
  }

  const nextMap: LevelSkillMap = {
    version: LEVEL_SKILL_MAP_VERSION,
    mappings: nextMappings,
  };
  const savedMap = get().savedLevelSkillMap ?? map;
  applyMap(set, nextMap, savedMap, true);
};

export const useLevelSkillMapStore = create<LevelSkillMapState>((set, get) => ({
  levelSkillMap: null,
  savedLevelSkillMap: null,
  ambiguous: {},
  isLoaded: false,
  isLoading: false,
  hasUnsavedChanges: false,
  loadError: null,

  importMapFromJSON: (json: string) => {
    try {
      const { map, ambiguous } = importLevelSkillMapFromJSON(json);
      applyMap(set, map, null, true, ambiguous);
      set({ isLoaded: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({
        loadError: message,
      });
      throw new Error(message);
    }
  },

  refreshMap: async (options) => {
    const force = options?.force === true;
    const persistLocal = options?.persistLocal === true;
    const state = get();
    if (!force && state.hasUnsavedChanges && state.levelSkillMap) return;

    set({ isLoading: true, loadError: null });
    try {
      let raw: LevelSkillMap | null = null;
      try {
        raw = await Promise.race([
          window.api.db.pullLevelSkillMap(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 8000);
          }),
        ]);
      } catch {
        // 云端不可用时回退本地
      }

      let map: LevelSkillMap;
      let ambiguous: Record<string, LevelSkillBinding[]> = {};
      let fromCloud = false;

      if (raw) {
        const split = splitMultiBindings(raw.mappings);
        map = split.map;
        ambiguous = split.ambiguous;
        fromCloud = true;
      } else {
        if (force && persistLocal) {
          throw new Error('无法从云端拉取推荐配置，请检查网络与数据库连接');
        }
        const runtime = await window.api.levelSkillMap.loadRuntime();
        if (runtime?.content) {
          const imported = importLevelSkillMapFromJSON(runtime.content);
          map = imported.map;
          ambiguous = imported.ambiguous;
        } else {
          map = { version: LEVEL_SKILL_MAP_VERSION, mappings: {} };
        }
      }

      if (persistLocal && fromCloud) {
        await window.api.levelSkillMap.saveRuntime(exportLevelSkillMapToJSON(map));
      }

      if (!force && get().hasUnsavedChanges) {
        set({ isLoading: false });
        return;
      }

      applyMap(set, map, cloneMap(map), false, ambiguous);
      set({ isLoaded: true, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },

  importFromDisk: async () => {
    set({ isLoading: true });
    try {
      const result = await window.api.levelSkillMap.importFromDisk();
      if (!result) return false;
      get().importMapFromJSON(result.content);
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
    const map = get().levelSkillMap;
    if (!map) return null;
    if (Object.keys(get().ambiguous).length > 0) {
      throw new Error('仍有关卡待选择主能力标签，无法导出');
    }
    const json = exportLevelSkillMapToJSON(map);
    return window.api.levelSkillMap.exportToDisk(json, 'level_skill_map.json');
  },

  saveMap: async () => {
    const map = get().levelSkillMap;
    if (!map) throw new Error('Level skill map not loaded');
    if (Object.keys(get().ambiguous).length > 0) {
      throw new Error('仍有关卡待选择主能力标签，无法保存');
    }
    const sync = useCloudSyncStore.getState();
    sync.beginLocal('正在保存推荐配置到本地…');
    const json = exportLevelSkillMapToJSON(map);
    await window.api.levelSkillMap.saveRuntime(json);
    applyMap(set, map, cloneMap(map), false);
    sync.markCloud('本地已保存，正在同步云端…', 45);

    const snapshot = map;
    void (async () => {
      try {
        sync.setProgress(70, '正在上传推荐配置到云端…');
        await window.api.db.pushLevelSkillMap(snapshot);
        sync.finishOk('推荐配置已保存并同步到云端');
      } catch (error) {
        sync.finishError(error instanceof Error ? error.message : String(error));
      }
    })();

    return 'saved';
  },

  discardChanges: () => {
    const savedMap = get().savedLevelSkillMap;
    if (!savedMap) return;
    applyMap(set, cloneMap(savedMap), savedMap, false);
  },

  getPrimary: (levelId) => getPrimaryBinding(get().levelSkillMap?.mappings[levelId]),

  setPrimarySkill: (levelId, skill, teachMode, formulaDifficulty) => {
    const current = get().getPrimary(levelId);
    setLevelEntry(get, set, levelId, {
      skills: [
        bindingFromSkill(
          skill,
          teachMode ?? current?.teachMode ?? 'guided',
          formulaDifficulty ?? current?.formulaDifficulty ?? 1,
        ),
      ],
    });
    const nextAmbiguous = { ...get().ambiguous };
    delete nextAmbiguous[levelId];
    set({ ambiguous: nextAmbiguous });
  },

  updatePrimaryMeta: (levelId, partial) => {
    const current = get().getPrimary(levelId);
    if (!current) return;
    setLevelEntry(get, set, levelId, {
      skills: [
        {
          ...current,
          teachMode: partial.teachMode !== undefined ? normalizeTeachMode(partial.teachMode) : current.teachMode,
          formulaDifficulty:
            partial.formulaDifficulty !== undefined
              ? normalizeDifficulty(partial.formulaDifficulty)
              : current.formulaDifficulty,
        },
      ],
    });
  },

  clearPrimary: (levelId) => {
    setLevelEntry(get, set, levelId, null);
  },

  batchSetPrimarySkill: (levelIds, skill) => {
    for (const levelId of levelIds) {
      const current = get().getPrimary(levelId);
      get().setPrimarySkill(
        levelId,
        skill,
        current?.teachMode ?? 'guided',
        current?.formulaDifficulty ?? 1,
      );
    }
  },

  batchSetTeachMode: (levelIds, teachMode) => {
    for (const levelId of levelIds) {
      if (!get().getPrimary(levelId)) continue;
      get().updatePrimaryMeta(levelId, { teachMode });
    }
  },

  batchSetDifficulty: (levelIds, formulaDifficulty) => {
    for (const levelId of levelIds) {
      if (!get().getPrimary(levelId)) continue;
      get().updatePrimaryMeta(levelId, { formulaDifficulty });
    }
  },

  resolveAmbiguous: (levelId, skillId, skills) => {
    const candidates = get().ambiguous[levelId];
    if (!candidates?.length) return;
    const picked = candidates.find((b) => b.skillId === skillId);
    if (!picked) return;
    const skill = skills.find((s) => s.id === skillId);
    setLevelEntry(get, set, levelId, {
      skills: [
        {
          skillId: picked.skillId,
          cfopStage: skill?.stage ?? picked.cfopStage,
          teachMode: picked.teachMode,
          formulaDifficulty: picked.formulaDifficulty,
        },
      ],
    });
    const nextAmbiguous = { ...get().ambiguous };
    delete nextAmbiguous[levelId];
    set({ ambiguous: nextAmbiguous });
  },

  getLevelSkillEntry: (levelId: string) => get().levelSkillMap?.mappings[levelId],

  getMappedCount: () => {
    const map = get().levelSkillMap;
    if (!map) return 0;
    return Object.values(map.mappings).filter((e) => e.skills.length > 0).length;
  },

  getAmbiguousLevelIds: () => Object.keys(get().ambiguous),

  applyAiMappings: (entries) => {
    const map = get().levelSkillMap;
    if (!map) throw new Error('Level skill map not loaded');

    const nextMappings = { ...map.mappings };
    let applied = 0;

    for (const entry of entries) {
      if (!entry.binding) {
        delete nextMappings[entry.levelId];
        applied += 1;
        continue;
      }
      nextMappings[entry.levelId] = { skills: [{ ...entry.binding }] };
      applied += 1;
    }

    const nextAmbiguous = { ...get().ambiguous };
    for (const entry of entries) {
      delete nextAmbiguous[entry.levelId];
    }

    const nextMap: LevelSkillMap = {
      version: LEVEL_SKILL_MAP_VERSION,
      mappings: nextMappings,
    };
    const savedMap = get().savedLevelSkillMap ?? map;
    applyMap(set, nextMap, savedMap, true, nextAmbiguous);
    return applied;
  },

  updateLevelSkillEntry: (levelId, entry) => {
    setLevelEntry(get, set, levelId, entry);
  },

  deleteLevelSkillEntry: (levelId) => {
    setLevelEntry(get, set, levelId, null);
  },
}));
