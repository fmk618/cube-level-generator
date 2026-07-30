import { create } from 'zustand';
import type { LevelSkillMap, LevelSkillMapEntry, LevelSkillBinding } from '@/core/skill-graph/types';
import { LEVEL_SKILL_MAP_VERSION } from '@/core/skill-graph/types';
import { exportLevelSkillMapToJSON, importLevelSkillMapFromJSON } from '@/core/skill-graph/utils';

type LevelSkillMapState = {
  levelSkillMap: LevelSkillMap | null;
  savedLevelSkillMap: LevelSkillMap | null;
  isLoaded: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  loadError: string | null;

  importMapFromJSON: (json: string) => void;
  refreshMap: () => Promise<void>;
  importFromDisk: () => Promise<boolean>;
  exportToDisk: () => Promise<string | null>;
  saveMap: () => Promise<string>;
  discardChanges: () => void;

  /** Replace entire entry for a level (must include skills[]). */
  updateLevelSkillEntry: (levelId: string, entry: LevelSkillMapEntry) => void;
  deleteLevelSkillEntry: (levelId: string) => void;
  getLevelSkillEntry: (levelId: string) => LevelSkillMapEntry | undefined;

  addLevelSkillBinding: (levelId: string, binding: LevelSkillBinding) => void;
  updateLevelSkillBinding: (
    levelId: string,
    skillId: string,
    partial: Partial<Omit<LevelSkillBinding, 'skillId'>> & { skillId?: string },
  ) => void;
  removeLevelSkillBinding: (levelId: string, skillId: string) => void;

  getMappedCount: () => number;
  applyAiMappings: (
    entries: Array<{ levelId: string; bindings: LevelSkillBinding[] }>,
    mode: 'merge' | 'replace',
  ) => number;
};

const cloneMap = (map: LevelSkillMap): LevelSkillMap => ({
  version: map.version,
  mappings: Object.fromEntries(
    Object.entries(map.mappings).map(([id, entry]) => [
      id,
      { skills: entry.skills.map((b) => ({ ...b })) },
    ]),
  ),
});

const applyMap = (
  set: typeof useLevelSkillMapStore.setState,
  map: LevelSkillMap,
  savedMap: LevelSkillMap | null,
  hasChanged: boolean,
) => {
  set({
    levelSkillMap: map,
    savedLevelSkillMap: savedMap,
    hasUnsavedChanges: hasChanged,
    loadError: null,
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
    nextMappings[levelId] = { skills: entry.skills.map((b) => ({ ...b })) };
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
  isLoaded: false,
  isLoading: false,
  hasUnsavedChanges: false,
  loadError: null,

  importMapFromJSON: (json: string) => {
    try {
      const map = importLevelSkillMapFromJSON(json);
      applyMap(set, map, null, true);
      set({ isLoaded: true });
    } catch (error) {
      set({
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  refreshMap: async () => {
    const state = get();
    if (state.hasUnsavedChanges && state.levelSkillMap) return;

    set({ isLoading: true, loadError: null });
    try {
      let map: LevelSkillMap | null = null;
      try {
        map = await Promise.race([
          window.api.db.pullLevelSkillMap(),
          new Promise<null>((resolve) => {
            window.setTimeout(() => resolve(null), 8000);
          }),
        ]);
      } catch {
        // 云端不可用时回退本地
      }

      if (!map) {
        const runtime = await window.api.levelSkillMap.loadRuntime();
        if (runtime?.content) {
          map = importLevelSkillMapFromJSON(runtime.content);
        }
      }

      if (!map) {
        map = { version: LEVEL_SKILL_MAP_VERSION, mappings: {} };
      }

      applyMap(set, map, cloneMap(map), false);
      set({ isLoaded: true, isLoading: false });
    } catch (error) {
      set({
        isLoading: false,
        loadError: error instanceof Error ? error.message : String(error),
      });
    }
  },

  importFromDisk: async () => {
    set({ isLoading: true });
    try {
      const result = await window.api.skillGraph.importFromDisk();
      if (!result) return false;
      get().importMapFromJSON(result.content);
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
    const map = get().levelSkillMap;
    if (!map) return null;
    const json = exportLevelSkillMapToJSON(map);
    return window.api.skillGraph.exportToDisk(json, 'level_skill_map.json');
  },

  saveMap: async () => {
    const map = get().levelSkillMap;
    if (!map) throw new Error('Level skill map not loaded');
    const json = exportLevelSkillMapToJSON(map);
    await window.api.levelSkillMap.saveRuntime(json);
    try {
      await window.api.db.pushLevelSkillMap(map);
    } catch (error) {
      throw new Error(
        `本地已保存，但云端同步失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    applyMap(set, map, cloneMap(map), false);
    return 'saved';
  },

  discardChanges: () => {
    const savedMap = get().savedLevelSkillMap;
    if (!savedMap) return;
    applyMap(set, cloneMap(savedMap), savedMap, false);
  },

  updateLevelSkillEntry: (levelId: string, entry: LevelSkillMapEntry) => {
    setLevelEntry(get, set, levelId, entry);
  },

  deleteLevelSkillEntry: (levelId: string) => {
    setLevelEntry(get, set, levelId, null);
  },

  getLevelSkillEntry: (levelId: string) => {
    const map = get().levelSkillMap;
    return map?.mappings[levelId];
  },

  addLevelSkillBinding: (levelId, binding) => {
    const map = get().levelSkillMap;
    if (!map) return;
    const current = map.mappings[levelId];
    const skills = current ? [...current.skills] : [];
    const idx = skills.findIndex((b) => b.skillId === binding.skillId);
    if (idx >= 0) {
      skills[idx] = { ...binding };
    } else {
      skills.push({ ...binding });
    }
    setLevelEntry(get, set, levelId, { skills });
  },

  updateLevelSkillBinding: (levelId, skillId, partial) => {
    const map = get().levelSkillMap;
    if (!map) return;
    const current = map.mappings[levelId];
    if (!current) return;

    const nextSkillId = partial.skillId ?? skillId;
    const skills = current.skills.map((b) => ({ ...b }));
    const idx = skills.findIndex((b) => b.skillId === skillId);
    if (idx < 0) return;

    // Changing skillId to one that already exists: replace that slot and drop duplicate.
    if (nextSkillId !== skillId) {
      const dup = skills.findIndex((b, i) => i !== idx && b.skillId === nextSkillId);
      if (dup >= 0) skills.splice(dup, 1);
    }

    const at = skills.findIndex((b) => b.skillId === skillId);
    if (at < 0) return;
    skills[at] = {
      ...skills[at],
      ...partial,
      skillId: nextSkillId,
    };
    setLevelEntry(get, set, levelId, { skills });
  },

  removeLevelSkillBinding: (levelId, skillId) => {
    const map = get().levelSkillMap;
    if (!map) return;
    const current = map.mappings[levelId];
    if (!current) return;
    const skills = current.skills.filter((b) => b.skillId !== skillId);
    setLevelEntry(get, set, levelId, skills.length ? { skills } : null);
  },

  getMappedCount: () => {
    const map = get().levelSkillMap;
    if (!map) return 0;
    return Object.values(map.mappings).filter((e) => e.skills.length > 0).length;
  },

  applyAiMappings: (entries, mode) => {
    const map = get().levelSkillMap;
    if (!map) throw new Error('Level skill map not loaded');

    const nextMappings = { ...map.mappings };
    let applied = 0;

    for (const entry of entries) {
      const bindings = entry.bindings.map((b) => ({ ...b }));
      if (bindings.length === 0) {
        if (mode === 'replace') delete nextMappings[entry.levelId];
        continue;
      }

      if (mode === 'replace') {
        nextMappings[entry.levelId] = { skills: bindings };
      } else {
        const current = nextMappings[entry.levelId];
        const merged = current ? [...current.skills] : [];
        for (const binding of bindings) {
          const idx = merged.findIndex((b) => b.skillId === binding.skillId);
          if (idx >= 0) merged[idx] = binding;
          else merged.push(binding);
        }
        nextMappings[entry.levelId] = { skills: merged };
      }
      applied += 1;
    }

    const nextMap: LevelSkillMap = {
      version: LEVEL_SKILL_MAP_VERSION,
      mappings: nextMappings,
    };
    const savedMap = get().savedLevelSkillMap ?? map;
    applyMap(set, nextMap, savedMap, true);
    return applied;
  },
}));
