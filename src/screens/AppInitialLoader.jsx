import styles from './AppInitialLoader.module.css';

/** Neutral first-paint loader shown until tenant configuration is ready. */
export default function AppInitialLoader() {
  return (
    <div className={styles.screen} role="status" aria-label="Loading">
      <div className={styles.loader} aria-hidden="true">
        <span className={styles.ring} />
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
