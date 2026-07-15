import styles from './Screen.module.css';

/** Full-height screen wrapper with the shared fade-in transition. */
export default function Screen({ children }) {
  return <section className={styles.screen}>{children}</section>;
}
