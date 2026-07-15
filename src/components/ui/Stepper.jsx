import styles from './Stepper.module.css';

/**
 * Quantity stepper.
 *
 * @param {{value: number, onChange: (delta: number) => void, mini?: boolean}} props
 */
export default function Stepper({ value, onChange, mini = false }) {
  return (
    <div className={`${styles.stepper} ${mini ? styles.mini : ''}`}>
      <button type="button" onClick={() => onChange(-1)} aria-label="-">−</button>
      <b>{value}</b>
      <button type="button" onClick={() => onChange(1)} aria-label="+">+</button>
    </div>
  );
}
