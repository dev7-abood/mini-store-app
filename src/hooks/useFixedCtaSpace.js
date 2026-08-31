/*
|--------------------------------------------------------------------------
| useFixedCtaSpace
|--------------------------------------------------------------------------
| Reserve, at the end of a screen's content, exactly as much room as its
| fixed CTA bar occupies — so the last card can always be scrolled clear
| of the buttons instead of sitting under them.
|
| Screens whose bar is a known single button use the `--bottom-cta-space`
| token and do not need this. It is for the bars that are NOT a fixed
| height: a second or third button that appears only in some states (a
| cancellable order, a paid one), a label that wraps in one locale and
| not another, a status line under the buttons.
|
| The ref is a CALLBACK ref on purpose. A screen with a loading branch
| renders no bar at first and the real one later; a ref object plus a
| mount effect would measure null and never look again, whereas a
| callback ref fires on every attach and detach.
*/
import { useCallback, useEffect, useRef, useState } from 'react';

/** Gap left between the end of the content and the bar, in px. */
const BREATHING_ROOM = 16;

/**
 * @param {number} [breathingRoom] px of clearance above the bar
 * @returns {[(node: HTMLElement|null) => void, number]}
 *   the ref to hand `<FixedCta elementRef>`, and the height to reserve —
 *   0 while nothing is measured yet, which the caller reads as "fall back
 *   to the CSS default".
 */
export function useFixedCtaSpace(breathingRoom = BREATHING_ROOM) {
  const [height, setHeight] = useState(0);
  const observerRef = useRef(null);

  const ctaRef = useCallback(
    (node) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      /* The bar unmounted (a branch without one). Nothing to clear. */
      if (!node) {
        setHeight(0);
        return;
      }

      /* The measured height already carries the bar's own safe-area
         padding, so only the breathing room is added here. */
      const measure = () => setHeight(node.getBoundingClientRect().height + breathingRoom);
      measure();

      if (typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      observerRef.current = observer;
    },
    [breathingRoom],
  );

  useEffect(() => () => observerRef.current?.disconnect(), []);

  return [ctaRef, height];
}
