import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  type OnboardingState,
  type OnboardingStatus,
} from './onboardingTypes';

export function readOnboardingState(): OnboardingState | null {
  try {
    const raw = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingState;
    if (parsed?.version !== ONBOARDING_VERSION) return null;
    if (parsed.status !== 'completed' && parsed.status !== 'skipped') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hasFinishedOnboarding(): boolean {
  return readOnboardingState() !== null;
}

export function writeOnboardingState(status: OnboardingStatus): void {
  const state: OnboardingState = {
    version: ONBOARDING_VERSION,
    status,
    completedAt: new Date().toISOString(),
  };
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state));
}

export function clearOnboardingState(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
