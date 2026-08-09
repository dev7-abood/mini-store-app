import { useTranslation } from 'react-i18next';
import {
  progressStateForStep,
  visibleProgressSteps,
} from '../lib/orderStatus';
import styles from './OrderTimeline.module.css';

/**
 * Vertical order-status timeline driven by the API's status.step and
 * status.total_steps values, with value-based fallback for older shapes.
 *
 * @param {{order: object}} props
 */
export default function OrderTimeline({ order }) {
  const { t } = useTranslation();
  const steps = visibleProgressSteps(order);

  return (
    <div className={styles.timeline}>
      {steps.map((step) => {
        const state = progressStateForStep(order, step);
        const className = [
          styles.step,
          styles[state],
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <div
            key={step.id}
            className={className}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
          >
            <div className={styles.dot} aria-hidden="true">
              {state === 'done' ? '✓' : step.icon}
            </div>
            <div className={styles.info}>
              <div className={styles.titleRow}>
                <b>{t(`status.steps.${step.id}.title`)}</b>
                {state === 'current' && <em>{t('status.current')}</em>}
              </div>
              <span>{t(`status.steps.${step.id}.caption`)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
