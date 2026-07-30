export const ONBOARDING_STORAGE_KEY = 'onboarding.basic.v1';
export const ONBOARDING_VERSION = 1;

export type OnboardingStatus = 'completed' | 'skipped';

export type OnboardingState = {
  version: number;
  status: OnboardingStatus;
  completedAt: string;
};

export type EditMode = 'catalog' | 'skills' | 'levelSkillMap';

export type OnboardingTourContext = {
  setEditMode: (mode: EditMode) => void;
  ensureLlmExpanded: () => void;
};
