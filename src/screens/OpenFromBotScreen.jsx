import { useTranslation } from 'react-i18next';
import styles from './OpenFromBotScreen.module.css';

/**
 * Shown when the app runs inside Telegram but no tenant context could
 * be resolved (no deep link, nothing in CloudStorage). No requests are
 * made in this state — the user must launch through the restaurant's
 * bot link so the deep-link payload identifies the tenant.
 */
export default function OpenFromBotScreen() {
  const { t } = useTranslation();

  return (
    <section className={styles.inner}>
      <div className={styles.ring}>🤖</div>
      <h2>{t('openFromBot.heading')}</h2>
      <p>{t('openFromBot.body')}</p>
    </section>
  );
}
