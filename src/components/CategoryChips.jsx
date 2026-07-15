import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CATEGORIES } from '../data/menu';
import Photo from './ui/Photo';
import styles from './CategoryChips.module.css';

/**
 * Horizontal category selector with desktop mouse support:
 * vertical wheel scrolls the strip horizontally, and the strip can be
 * dragged with the mouse (drag is distinguished from a plain click so
 * chips stay tappable).
 *
 * @param {{activeId: string, onPick: (id: string) => void}} props
 */
export default function CategoryChips({ activeId, onPick }) {
  const { t } = useTranslation();
  const stripRef = useRef(null);
  const dragRef = useRef({ isDown: false, startX: 0, startScroll: 0, moved: false });
  const [dragging, setDragging] = useState(false);

  /* Wheel: translate vertical scroll into horizontal movement.
     Attached natively because React wheel listeners are passive. */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;

    const onWheel = (e) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollBy({ left: e.deltaY > 0 ? 90 : -90, behavior: 'smooth' });
      }
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* Mouse drag-to-scroll; window listeners so the drag survives leaving
     the strip mid-gesture. */
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;

    const onMove = (e) => {
      const drag = dragRef.current;
      if (!drag.isDown) return;
      const dx = e.clientX - drag.startX;
      if (Math.abs(dx) > 6 && !drag.moved) {
        drag.moved = true;
        setDragging(true);
      }
      if (drag.moved) el.scrollLeft = drag.startScroll - dx;
    };

    const onUp = () => {
      dragRef.current.isDown = false;
      /* Defer so the click suppressed by pointer-events resolves first. */
      setTimeout(() => setDragging(false), 0);
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  const onPointerDown = (e) => {
    if (e.pointerType !== 'mouse') return;
    dragRef.current = {
      isDown: true,
      moved: false,
      startX: e.clientX,
      startScroll: stripRef.current.scrollLeft,
    };
  };

  return (
    <nav
      ref={stripRef}
      className={`${styles.chips} ${dragging ? styles.dragging : ''}`}
      onPointerDown={onPointerDown}
    >
      {CATEGORIES.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`${styles.chip} ${category.id === activeId ? styles.on : ''}`}
          onClick={() => onPick(category.id)}
        >
          <Photo
            className={styles.thumb}
            src={category.image}
            fallback={category.fallback}
            tint={category.tint}
            fallbackSize="16px"
          />
          {t(`categories.${category.id}`)}
        </button>
      ))}
    </nav>
  );
}
