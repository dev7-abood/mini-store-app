import { useId } from 'react';
import styles from './Field.module.css';

/**
 * Labelled input / textarea.
 *
 * @param {{label: string, multiline?: boolean, rows?: number,
 *          error?: string, hint?: string}
 *         & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export default function Field({
  label,
  multiline = false,
  rows = 3,
  error = '',
  hint = '',
  ...rest
}) {
  const id = useId();
  const descriptionId = error || hint ? `${id}-description` : undefined;
  const fieldProps = {
    ...rest,
    id,
    'aria-invalid': error ? true : rest['aria-invalid'],
    'aria-describedby': rest['aria-describedby'] ?? descriptionId,
  };

  return (
    <div className={styles.field}>
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea rows={rows} {...fieldProps} /> : <input {...fieldProps} />}
      {error ? (
        <p id={descriptionId} className={styles.errorText}>
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className={styles.hintText}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
