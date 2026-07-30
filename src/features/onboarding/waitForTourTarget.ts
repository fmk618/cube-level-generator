export function tourSelector(tourId: string): string {
  return `[data-tour="${tourId}"]`;
}

export function queryTourTarget(tourId: string): HTMLElement | null {
  return document.querySelector(tourSelector(tourId));
}

/** Wait until a data-tour target exists in the DOM (MutationObserver + poll). */
export function waitForTourTarget(
  tourId: string,
  timeoutMs = 3000,
): Promise<HTMLElement | null> {
  const existing = queryTourTarget(tourId);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const finish = (el: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearInterval(pollId);
      window.clearTimeout(timeoutId);
      resolve(el);
    };

    const check = () => {
      const el = queryTourTarget(tourId);
      if (el) finish(el);
    };

    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    const pollId = window.setInterval(check, 100);
    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
  });
}
