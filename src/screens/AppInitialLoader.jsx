import styles from './AppInitialLoader.module.css';

/** Neutral first-paint loader shown until tenant configuration is ready. */
export default function AppInitialLoader({ exiting = false }) {
  return (
    <div
      className={`${styles.screen} ${exiting ? styles.exiting : ''}`}
      role="status"
      aria-label="Loading"
    >
      <div className={styles.bars} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
