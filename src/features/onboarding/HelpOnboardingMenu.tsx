import { useEffect, useRef, useState } from 'react';
import { requestOnboardingReplay } from './onboardingReplay';
import './onboarding.css';

export function HelpOnboardingMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="ob-help-menu" ref={ref} data-tour="help-tour-button">
      <button
        type="button"
        className="btn btn-sm ob-help-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        帮助
      </button>
      {open && (
        <div className="ob-help-popover" role="menu">
          <button
            type="button"
            className="ob-help-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              requestOnboardingReplay();
            }}
          >
            新手引导
          </button>
        </div>
      )}
    </div>
  );
}
