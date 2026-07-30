import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EVENTS, STATUS, useJoyride } from 'react-joyride';
import { useCatalogStore } from '@/shared/store/useCatalogStore';
import { WelcomeDialog } from './WelcomeDialog';
import { hasFinishedOnboarding, writeOnboardingState } from './onboardingStorage';
import { buildOnboardingSteps, onboardingLocale, onboardingOptions } from './onboardingSteps';
import { subscribeOnboardingReplay } from './onboardingReplay';
import type { EditMode } from './onboardingTypes';
import { waitForTourTarget } from './waitForTourTarget';
import './onboarding.css';

export type OnboardingTourProps = {
  editMode: EditMode;
  setEditMode: (mode: EditMode) => void;
  llmCollapsed: boolean;
  setLlmCollapsed: (collapsed: boolean) => void;
};

export function OnboardingTour({
  setEditMode,
  llmCollapsed,
  setLlmCollapsed,
}: OnboardingTourProps) {
  const catalogLoaded = useCatalogStore((s) => s.isLoaded);
  const [showWelcome, setShowWelcome] = useState(false);
  const startedRef = useRef(false);

  const ensureLlmExpanded = useCallback(() => {
    setLlmCollapsed(false);
  }, [setLlmCollapsed]);

  const steps = useMemo(
    () =>
      buildOnboardingSteps({
        setEditMode,
        ensureLlmExpanded,
      }),
    [setEditMode, ensureLlmExpanded],
  );

  const { controls, on, Tour } = useJoyride({
    steps,
    continuous: true,
    scrollToFirstStep: true,
    locale: onboardingLocale,
    options: onboardingOptions,
  });

  useEffect(() => {
    if (!catalogLoaded) return;
    if (hasFinishedOnboarding()) return;
    if (startedRef.current) return;
    void waitForTourTarget('module-tabs', 4000).then((el) => {
      if (el && !hasFinishedOnboarding()) {
        setShowWelcome(true);
      }
    });
  }, [catalogLoaded]);

  useEffect(() => {
    const offEnd = on(EVENTS.TOUR_END, (data) => {
      if (data.status === STATUS.FINISHED) {
        writeOnboardingState('completed');
      } else if (data.status === STATUS.SKIPPED) {
        writeOnboardingState('skipped');
      }
      startedRef.current = false;
    });

    // Retry briefly before skipping — mode switches can lag one frame.
    const offNotFound = on(EVENTS.TARGET_NOT_FOUND, (data, tourControls) => {
      const raw = typeof data.step?.target === 'string' ? data.step.target : '';
      const match = raw.match(/data-tour="([^"]+)"/);
      const tourId = match?.[1];
      void (async () => {
        if (tourId) {
          const el = await waitForTourTarget(tourId, 2500);
          if (el) {
            tourControls.replay();
            return;
          }
        }
        console.warn('[onboarding] skip missing target', raw || data.step?.id);
        tourControls.next();
      })();
    });

    return () => {
      offEnd();
      offNotFound();
    };
  }, [on]);

  const startTour = useCallback(() => {
    setShowWelcome(false);
    startedRef.current = true;
    setEditMode('catalog');
    if (llmCollapsed) setLlmCollapsed(false);
    window.requestAnimationFrame(() => {
      controls.start(0);
    });
  }, [controls, setEditMode, llmCollapsed, setLlmCollapsed]);

  const skipWelcome = useCallback(() => {
    setShowWelcome(false);
    writeOnboardingState('skipped');
  }, []);

  const replayTour = useCallback(() => {
    setShowWelcome(false);
    startedRef.current = true;
    setEditMode('catalog');
    if (llmCollapsed) setLlmCollapsed(false);
    window.requestAnimationFrame(() => {
      controls.reset(true);
      controls.start(0);
    });
  }, [controls, setEditMode, llmCollapsed, setLlmCollapsed]);

  return (
    <>
      {showWelcome && <WelcomeDialog onStart={startTour} onSkip={skipWelcome} />}
      {Tour}
      <OnboardingReplayBridge onReplay={replayTour} />
    </>
  );
}

function OnboardingReplayBridge({ onReplay }: { onReplay: () => void }) {
  useEffect(() => subscribeOnboardingReplay(onReplay), [onReplay]);
  return null;
}
