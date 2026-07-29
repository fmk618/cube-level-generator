import { create } from 'zustand';
import type { LevelSkillMap, LevelSkillMapEntry } from '@/core/skill-graph/types';
import { exportLevelSkillMapToJSON, importLevelSkillMapFromJSON } from '@/core/skill-graph/utils';

type LevelSkillMapState = {
  levelSkillMap: LevelSkillMap | null;
  savedLevelSkillMap: LevelSkillMap | null;
  isLoaded: boolean;
  isLoading: boolean;
  hasUnsavedChanges: boolean;
  loadError: string | null;

  importMapFromJSON: (json: string) => void;
  importFromDisk: () => Promise<boolean>;
  exportToDisk: () => Promise<string | null>;
  saveMap: () => Promise<string>;
  discardChanges: () => void;

  updateLevelSkillEntry: (levelId: string, entry: LevelSkillMapEntry) => void;
  deleteLevelSkillEntry: (levelId: string) => void;
  getLevelSkillEntry: (levelId: string) => LevelSkillMapEntry | undefined;
  getMappedCount: () => number;
};

const cloneMap = (map: LevelSkillMap): LevelSkillMap => ({
  version: map.version,
  mappings: { ...map.mappings },
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

  importFromDisk: async () => {
    set({ isLoading: true });
    try {
      const result = await window.api.skillGraph.loadDisk();
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
    await window.api.skillGraph.saveRuntime(json);
    applyMap(set, map, cloneMap(map), false);
    return 'saved';
  },

  discardChanges: () => {
    const savedMap = get().savedLevelSkillMap;
    if (!savedMap) return;
    applyMap(set, savedMap, savedMap, false);
  },

  updateLevelSkillEntry: (levelId: string, entry: LevelSkillMapEntry) => {
    const map = get().levelSkillMap;
    if (!map) return;

    const nextMap: LevelSkillMap = {
      version: map.version,
      mappings: { ...map.mappings, [levelId]: entry },
    };

    const savedMap = get().savedLevelSkillMap ?? map;
    applyMap(set, nextMap, savedMap, true);
  },

  deleteLevelSkillEntry: (levelId: string) => {
    const map = get().levelSkillMap;
    if (!map) return;

    const nextMappings = { ...map.mappings };
    delete nextMappings[levelId];

    const nextMap: LevelSkillMap = {
      version: map.version,
      mappings: nextMappings,
    };

    const savedMap = get().savedLevelSkillMap ?? map;
    applyMap(set, nextMap, savedMap, true);
  },

  getLevelSkillEntry: (levelId: string) => {
    const map = get().levelSkillMap;
    return map?.mappings[levelId];
  },

  getMappedCount: () => {
    const map = get().levelSkillMap;
    return map ? Object.keys(map.mappings).length : 0;
  },
}));
