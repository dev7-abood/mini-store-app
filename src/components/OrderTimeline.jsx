import { useTranslation } from 'react-i18next';
import styles from './OrderTimeline.module.css';

export const ORDER_STEPS = [
  { id: 'received', icon: '🧾' },
  { id: 'preparing', icon: '👨‍🍳' },
  { id: 'onTheWay', icon: '🛵' },
  { id: 'delivered', icon: '🎉' },
];

/**
 * Vertical order-status timeline.
 *
 * @param {{currentStep: number}} props Index of the active step;
 *        values >= ORDER_STEPS.length mark everything as done.
 */
export default function OrderTimeline({ currentStep }) {
  const { t } = useTranslation();

  return (
    <div className={styles.timeline}>
      {ORDER_STEPS.map((step, index) => {
        const isDone = index < currentStep || currentStep >= ORDER_STEPS.length;
        const isNow = index === currentStep && currentStep < ORDER_STEPS.length;

        return (
          <div
            key={step.id}
            className={[styles.step, isDone && styles.done, isNow && styles.now]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={styles.dot}>{step.icon}</div>
            <div className={styles.info}>
              <b>{t(`status.steps.${step.id}.title`)}</b>
              <span>{t(`status.steps.${step.id}.caption`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
