import { useTranslation } from 'react-i18next';
import { useStoreStatus } from '../context/StoreStatusContext';
import styles from './StoreStatus.module.css';

function statusKind({ isLoading, isError, isOpen, canCheckout }) {
  if (isLoading) return 'checking';
  if (isError) return 'unknown';
  if (isOpen === null) return canCheckout ? 'unknown' : 'closed';
  if (isOpen === false && canCheckout) return 'preorder';
  return canCheckout ? 'open' : 'closed';
}

function statusLabel(t, kind) {
  if (kind === 'checking') return t('storeStatus.checking');
  if (kind === 'unknown') return t('storeStatus.unavailable');
  if (kind === 'preorder') return t('storeStatus.preorder');
  if (kind === 'closed') return t('storeStatus.closed');
  return t('storeStatus.open');
}

export function StoreStatusPill() {
  const { t } = useTranslation();
  const storeStatus = useStoreStatus();
  const kind = statusKind(storeStatus);

  return (
    <span className={`${styles.pill} ${styles[kind]}`} aria-live="polite">
      <span className={styles.dot} />
      {statusLabel(t, kind)}
    </span>
  );
}

export function StoreStatusNotice() {
  const { t } = useTranslation();
  const {
    canCheckout,
    isChecking,
    isOpen,
    refresh,
  } = useStoreStatus();

  if (canCheckout || isOpen !== false) return null;

  return (
    <aside className={styles.notice} role="status">
      <span className={styles.noticeIcon}>!</span>
      <div>
        <b>{t('storeStatus.closed')}</b>
        <p>{t('storeStatus.closedFallback')}</p>
        <button
          type="button"
          className={styles.noticeAction}
          onClick={() => refresh()}
          disabled={isChecking}
        >
          {isChecking ? t('storeStatus.checking') : t('storeStatus.checkAgain')}
        </button>
      </div>
    </aside>
  );
}
