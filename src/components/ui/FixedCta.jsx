import styles from './FixedCta.module.css';

/**
 * Bottom-pinned CTA area with the soft gradient fade.
 *
 * The bar floats over the page, so whatever a screen puts in it hides
 * that much of the content underneath. Screens whose bar is not a fixed
 * height (a wrapping label, a second button, a status line) pass
 * `elementRef` and reserve the measured height at the end of their
 * content; the rest use the `--bottom-cta-space` token.
 *
 * @param {{children: React.ReactNode,
 *          elementRef?: React.Ref<HTMLDivElement>}} props
 */
export default function FixedCta({ children, elementRef = null }) {
  return (
    <div ref={elementRef} className={styles.wrap}>
      {children}
    </div>
  );
}
