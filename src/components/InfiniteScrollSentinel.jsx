import { useEffect, useRef } from 'react';

/*
|--------------------------------------------------------------------------
| Infinite Scroll Sentinel
|--------------------------------------------------------------------------
| An invisible element pinned to the end of the list. When it scrolls
| into view (rootMargin extends the trigger point 300px above the
| viewport bottom so the fetch starts before the user hits the end),
| onIntersect fires. Consumers guard against double-fires themselves —
| CatalogContext.loadMore is idempotent.
*/

/**
 * @param {{onIntersect: () => void, enabled?: boolean,
 *          rootMargin?: string}} props
 */
export default function InfiniteScrollSentinel({
  onIntersect,
  enabled = true,
  rootMargin = '0px 0px 300px 0px',
}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onIntersect();
      },
      { rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, onIntersect, rootMargin]);

  return <div ref={ref} aria-hidden="true" style={{ height: 1, width: '100%' }} />;
}
