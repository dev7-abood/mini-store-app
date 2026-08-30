/*
|--------------------------------------------------------------------------
| useAppResume
|--------------------------------------------------------------------------
| Run something when the app comes back to the foreground.
|
| This is how a manual payment stays current. It is resolved by a person
| at the store, so `should_poll` is false and a timer is the wrong tool
| entirely — the customer leaves for their banking app, pays, and comes
| back, and THAT is the moment worth re-reading.
|
| Two signals, because neither is reliable alone: `visibilitychange`
| covers the browser and most Telegram clients, and Telegram's own
| `viewportChanged` covers clients that keep the document visible while
| the Mini App is backgrounded.
*/
import { useEffect, useRef } from 'react';

/** Ignore a second resume this close to the last one (double-fired events). */
const DEDUPE_MS = 1000;

/**
 * @param {() => void} onResume
 * @param {boolean} [enabled]
 */
export function useAppResume(onResume, enabled = true) {
  const handler = useRef(onResume);
  handler.current = onResume;

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;

    let lastRun = 0;

    const run = () => {
      if (document.visibilityState === 'hidden') return;

      const now = Date.now();
      if (now - lastRun < DEDUPE_MS) return;
      lastRun = now;
      handler.current?.();
    };

    document.addEventListener('visibilitychange', run);
    window.addEventListener('focus', run);

    const tg = window.Telegram?.WebApp ?? null;
    try {
      tg?.onEvent?.('viewportChanged', run);
    } catch {
      /* older clients may not expose the event bus */
    }

    return () => {
      document.removeEventListener('visibilitychange', run);
      window.removeEventListener('focus', run);
      try {
        tg?.offEvent?.('viewportChanged', run);
      } catch {
        /* nothing to detach */
      }
    };
  }, [enabled]);
}
