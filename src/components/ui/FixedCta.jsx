import styles from './FixedCta.module.css';

/** Bottom-pinned CTA area with the soft gradient fade. */
export default function FixedCta({ children }) {
  return <div className={styles.wrap}>{children}</div>;
}
