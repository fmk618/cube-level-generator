const replayListeners = new Set<() => void>();

export function requestOnboardingReplay(): void {
  replayListeners.forEach((fn) => fn());
}

export function subscribeOnboardingReplay(listener: () => void): () => void {
  replayListeners.add(listener);
  return () => {
    replayListeners.delete(listener);
  };
}
