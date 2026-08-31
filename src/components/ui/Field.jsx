import { useId } from 'react';
import styles from './Field.module.css';

/**
 * Labelled input / textarea with optional validation text.
 *
 * `className` styles the FIELD WRAPPER, not the control — it is how a
 * caller that lays its own form out (a grid with its own gap, say) drops
 * the stacked-form bottom margin.
 *
 * @param {{label: string, multiline?: boolean, rows?: number, error?: string,
 *          hint?: string, className?: string,
 *          inputRef?: React.Ref<HTMLInputElement | HTMLTextAreaElement>}
 *         & React.InputHTMLAttributes<HTMLInputElement>} props
 */
export default function Field({
  label,
  multiline = false,
  rows = 3,
  error = '',
  hint = '',
  className = '',
  inputRef = null,
  ...rest
}) {
  const id = useId();
  const descriptionId = error || hint ? `${id}-description` : undefined;
  const controlProps = {
    ...rest,
    ref: inputRef,
    'aria-invalid': error ? true : rest['aria-invalid'],
    'aria-describedby': rest['aria-describedby'] ?? descriptionId,
  };

  return (
    <div className={[styles.field, className].filter(Boolean).join(' ')}>
      <label htmlFor={id}>{label}</label>
      {multiline ? <textarea id={id} rows={rows} {...controlProps} /> : <input id={id} {...controlProps} />}
      {error ? (
        <p id={descriptionId} className={styles.error}>
          {error}
        </p>
      ) : hint ? (
        <p id={descriptionId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
