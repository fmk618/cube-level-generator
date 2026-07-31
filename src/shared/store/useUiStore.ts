import { create } from 'zustand';
import type { LevelFormulaTarget } from '@/core/levels';

export type FormulaAdoptionRequest = {
  id: number;
  kind: 'rotation' | 'guidance';
  formula: string;
  target: LevelFormulaTarget;
  autoApply?: boolean;
};

export type CatalogAiMode = 'formula' | 'chapters' | 'levels';

type UiState = {
  selectedLevelId: string | null;
  selectLevel: (levelId: string | null) => void;
  aiTargetChapterId: string | null;
  selectAiTargetChapter: (chapterId: string | null) => void;
  catalogAiMode: CatalogAiMode;
  setCatalogAiMode: (mode: CatalogAiMode) => void;
  aiMapLevelIds: string[];
  setAiMapLevelIds: (levelIds: string[]) => void;
  aiTouchedSkillIds: string[];
  aiTouchedLevelIds: string[];
  markAiTouchedSkills: (skillIds: string[]) => void;
  markAiTouchedLevels: (levelIds: string[]) => void;
  clearAiTouched: () => void;
  formulaAdoptionRequest: FormulaAdoptionRequest | null;
  requestFormulaAdoption: (request: Omit<FormulaAdoptionRequest, 'id'>) => void;
  clearFormulaAdoptionRequest: () => void;
};

let adoptionCounter = 0;

export const useUiStore = create<UiState>()((set) => ({
  selectedLevelId: null,
  selectLevel: (levelId) => set({ selectedLevelId: levelId }),
  aiTargetChapterId: null,
  selectAiTargetChapter: (chapterId) => set({ aiTargetChapterId: chapterId }),
  catalogAiMode: 'formula',
  setCatalogAiMode: (mode) => set({ catalogAiMode: mode }),
  aiMapLevelIds: [],
  setAiMapLevelIds: (levelIds) => set({ aiMapLevelIds: levelIds }),
  aiTouchedSkillIds: [],
  aiTouchedLevelIds: [],
  markAiTouchedSkills: (skillIds) =>
    set((state) => ({
      aiTouchedSkillIds: Array.from(new Set([...state.aiTouchedSkillIds, ...skillIds])),
    })),
  markAiTouchedLevels: (levelIds) =>
    set((state) => ({
      aiTouchedLevelIds: Array.from(new Set([...state.aiTouchedLevelIds, ...levelIds])),
    })),
  clearAiTouched: () => set({ aiTouchedSkillIds: [], aiTouchedLevelIds: [] }),
  formulaAdoptionRequest: null,
  requestFormulaAdoption: (request) => {
    adoptionCounter += 1;
    set({ formulaAdoptionRequest: { ...request, id: adoptionCounter } });
  },
  clearFormulaAdoptionRequest: () => set({ formulaAdoptionRequest: null }),
}));
