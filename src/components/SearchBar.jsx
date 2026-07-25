import { useTranslation } from 'react-i18next';
import styles from './SearchBar.module.css';

/*
|--------------------------------------------------------------------------
| Search Bar
|--------------------------------------------------------------------------
| Controlled input with a clear button. Uses type="search" so mobile
| keyboards show a search key, and enterKeyHint dismisses the keyboard
| instead of submitting anything (results are live).
*/

/**
 * @param {{value: string, onChange: (value: string) => void,
 *          onClear: () => void}} props
 */
export default function SearchBar({ value, onChange, onClear }) {
  const { t } = useTranslation();

  return (
    <div className={styles.wrap}>
      <span className={styles.icon} aria-hidden="true">🔍</span>

      <input
        type="search"
        className={styles.input}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.placeholder')}
        enterKeyHint="search"
        autoComplete="off"
        /* Keep native clear buttons off — we render our own so it sits
           on the correct side in RTL. */
        style={{ appearance: 'none' }}
      />

      {value.length > 0 && (
        <button
          type="button"
          className={styles.clear}
          onClick={onClear}
          aria-label={t('search.clear')}
        >
          ✕
        </button>
      )}
    </div>
  );
}
