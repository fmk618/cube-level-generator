import { create } from 'zustand';
import type { LevelFormulaTarget } from '@/core/levels';

export type FormulaAdoptionRequest = {
  id: number;
  kind: 'rotation' | 'guidance';
  formula: string;
  target: LevelFormulaTarget;
};

type UiState = {
  selectedLevelId: string | null;
  selectLevel: (levelId: string | null) => void;
  aiMapLevelIds: string[];
  setAiMapLevelIds: (levelIds: string[]) => void;
  formulaAdoptionRequest: FormulaAdoptionRequest | null;
  requestFormulaAdoption: (request: Omit<FormulaAdoptionRequest, 'id'>) => void;
  clearFormulaAdoptionRequest: () => void;
};

let adoptionCounter = 0;

export const useUiStore = create<UiState>()((set) => ({
  selectedLevelId: null,
  selectLevel: (levelId) => set({ selectedLevelId: levelId }),
  aiMapLevelIds: [],
  setAiMapLevelIds: (levelIds) => set({ aiMapLevelIds: levelIds }),
  formulaAdoptionRequest: null,
  requestFormulaAdoption: (request) => {
    adoptionCounter += 1;
    set({ formulaAdoptionRequest: { ...request, id: adoptionCounter } });
  },
  clearFormulaAdoptionRequest: () => set({ formulaAdoptionRequest: null }),
}));
