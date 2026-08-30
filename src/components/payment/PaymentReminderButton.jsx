/*
|--------------------------------------------------------------------------
| Payment Reminder Button
|--------------------------------------------------------------------------
| The only lever the customer has while they wait for the store. It
| notifies and nothing else — it can never move the payment, so pressing
| it navigates nowhere and changes no status. Only the cooldown moves.
|
| The button's enabled state is the server's `reminder.available`, and
| the cooldown is the server's `reminder.cooldown_seconds` (15 minutes by
| default, but configurable per store — so it is read from every response
| and never hardcoded). It is counted down locally only so the customer
| can watch it come back.
*/
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTelegram } from '../../hooks/useTelegram';
import Button from '../ui/Button';
import styles from './PaymentReminderButton.module.css';

function formatCooldown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

/**
 * @param {{reminder: object|null, onRemind: () => Promise<object>}} props
 */
export default function PaymentReminderButton({ reminder, onRemind }) {
  const { t } = useTranslation();
  const { haptic, notify } = useTelegram();
  const [remaining, setRemaining] = useState(0);
  const [isSending, setIsSending] = useState(false);

  const available = Boolean(reminder?.available);
  const cooldownSeconds = reminder?.cooldownSeconds ?? 0;

  /* Re-seed whenever the server tells us a new cooldown — including the
     one the remind call itself returns. */
  useEffect(() => {
    setRemaining(available ? 0 : cooldownSeconds);
  }, [available, cooldownSeconds]);

  /* One interval for the whole countdown: the tick updates through the
     functional setter, so the dependency is only whether a countdown is
     running at all — not the value, which would rebuild it every second. */
  const isCountingDown = remaining > 0;
  useEffect(() => {
    if (!isCountingDown) return undefined;

    const timer = window.setInterval(() => {
      setRemaining((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isCountingDown]);

  const send = useCallback(async () => {
    if (isSending) return;

    setIsSending(true);
    const result = await onRemind();
    setIsSending(false);

    if (!result?.ok) {
      /* A refusal means the cooldown was still running server-side; the
         disabled state should have prevented it, so say what happened
         rather than failing the screen. */
      notify(result?.message || t('payment.reminder.failed'), 'warning');
      return;
    }

    haptic('medium');
    notify(result.message || t('payment.reminder.sent'), 'success');
  }, [isSending, onRemind, notify, haptic, t]);

  if (!reminder) return null;

  const waiting = !available || remaining > 0;

  return (
    <div className={styles.wrap}>
      <Button full disabled={isSending || waiting} onClick={send}>
        {isSending ? t('payment.reminder.sending') : t('payment.reminder.action')}
      </Button>

      {waiting && remaining > 0 && (
        <p className={styles.cooldown}>
          {t('payment.reminder.cooldown', { time: formatCooldown(remaining) })}
        </p>
      )}

      {reminder.sentCount > 0 && (
        <p className={styles.sentCount}>
          {t('payment.reminder.sentCount', { count: reminder.sentCount })}
        </p>
      )}
    </div>
  );
}
