import { useId } from 'react';
import styles from './Field.module.css';

/**
 * Labelled input / textarea.
 *
 * @param {{label: string, multiline?: boolean, rows?: number}
 *         & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export default function Field({ label, multiline = false, rows = 3, ...rest }) {
  const id = useId();

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea id={id} rows={rows} {...rest} /> : <input id={id} {...rest} />}
    </div>
  );
}
