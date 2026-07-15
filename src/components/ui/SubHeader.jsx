import { useTranslation } from 'react-i18next';
import { useNavigation } from '../../context/NavigationContext';
import styles from './SubHeader.module.css';

/**
 * Sub-screen header with an optional back button (falls back to the
 * navigation back-map) and an optional trailing slot.
 *
 * @param {{title: string, showBack?: boolean, trailing?: React.ReactNode}} props
 */
export default function SubHeader({ title, showBack = true, trailing = null }) {
  const { goBack } = useNavigation();
  const { t } = useTranslation();

  return (
    <div className={styles.head}>
      {showBack && (
        <button type="button" className={styles.back} onClick={goBack} aria-label={t('common.back')}>
          <span>←</span>
        </button>
      )}
      <h1 className={styles.title}>{title}</h1>
      {trailing && <div className={styles.trailing}>{trailing}</div>}
    </div>
  );
}
