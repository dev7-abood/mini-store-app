import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMoney } from '../hooks/useMoney';
import { useTelegram } from '../hooks/useTelegram';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import {
  getMockManualPaymentOrder,
  secondsUntilReminder,
  sendMockPaymentReminder,
} from '../lib/manualPaymentMockService';
import {
  manualReceivingInfoForPaymentMethod,
  paymentMethodLabel,
} from '../lib/paymentMethods';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Button from '../components/ui/Button';
import styles from './PaymentPendingScreen.module.css';

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

function copyToClipboard(value) {
  const text = String(value ?? '');
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

function formatCooldown(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes <= 0) return `0:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function MethodMark({ method = {}, label }) {
  if (method.logo) {
    return (
      <span className={styles.methodMark}>
        <img src={method.logo} alt="" />
      </span>
    );
  }

  return (
    <span className={styles.methodMark} aria-hidden="true">
      <span>{method.icon || label.slice(0, 2)}</span>
    </span>
  );
}

function CompactRow({ label, value, valueDir = 'auto', strong = false }) {
  if (!value) return null;

  return (
    <div className={styles.compactRow}>
      <span>{label}</span>
      <b className={strong ? styles.strongValue : ''} dir={valueDir}>
        {value}
      </b>
    </div>
  );
}

function CopyRow({ label, value, copyable = false, valueDir = 'auto', copied, onCopy, t }) {
  if (!value) return null;

  return (
    <div className={classNames(styles.copyRow, copyable ? styles.copyableRow : styles.noCopyRow)}>
      <div>
        <span>{label}</span>
        <b dir={valueDir}>{value}</b>
      </div>
      {copyable && (
        <button
          type="button"
          className={classNames(styles.copyButton, copied && styles.copyDone)}
          onClick={onCopy}
          aria-label={t('paymentPending.copyValue', { label })}
        >
          {copied ? t('paymentPending.copied') : t('paymentPending.copy')}
        </button>
      )}
    </div>
  );
}

export default function PaymentPendingScreen() {
  const { orderNumber } = useParams();
  const { t } = useTranslation();
  const money = useMoney();
  const { haptic, notify } = useTelegram();
  const { findPaymentMethod } = usePaymentMethods();
  const [order, setOrder] = useState(() => getMockManualPaymentOrder(orderNumber));
  const [copiedKey, setCopiedKey] = useState(null);
  const [isSendingReminder, setIsSendingReminder] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(() => secondsUntilReminder(order));

  useEffect(() => {
    setOrder(getMockManualPaymentOrder(orderNumber));
  }, [orderNumber]);

  useEffect(() => {
    const tick = () => setRemainingSeconds(secondsUntilReminder(order));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [order]);

  const orderPaymentMethod = order.paymentMethod ?? {};
  const configuredMethod = findPaymentMethod(orderPaymentMethod.id);
  const configuredReceiver = manualReceivingInfoForPaymentMethod(configuredMethod);
  const paymentMethod = configuredMethod
    ? { ...orderPaymentMethod, ...configuredMethod }
    : orderPaymentMethod;
  const methodLabel = paymentMethodLabel(configuredMethod, t)
    || orderPaymentMethod.name
    || (orderPaymentMethod.nameKey ? t(orderPaymentMethod.nameKey) : '')
    || t('paymentPending.manualPayment');
  const statusLabel = t(`status.paymentValues.${order.verification.status}`);
  const amountText = money(order.totalAmount);
  const customerPayment = {
    fullName: order.customerPayment.fullName ?? order.customerPayment.senderName,
    accountIdentifier:
      order.customerPayment.accountIdentifier
      ?? order.customerPayment.senderPhoneOrAccountNumber,
    transactionNumber: order.customerPayment.transactionNumber,
    paymentNote: order.customerPayment.paymentNote,
  };
  const receiver = configuredMethod?.source === 'api'
    ? configuredReceiver ?? {}
    : configuredReceiver ?? order.receiver ?? {};
  const receiverRows = useMemo(
    () => [
      {
        key: 'receiverName',
        label: t('paymentPending.receiverName'),
        value: receiver.receiverName,
      },
      {
        key: 'accountHolderName',
        label: t('paymentPending.accountHolderName'),
        value: receiver.accountHolderName,
      },
      {
        key: 'walletPhoneNumber',
        label: t('paymentPending.walletPhoneNumber'),
        value: receiver.walletPhoneNumber,
        copyable: true,
        valueDir: 'ltr',
      },
      {
        key: 'accountNumber',
        label: t('paymentPending.accountNumber'),
        value: receiver.accountNumber,
        copyable: true,
        valueDir: 'ltr',
      },
      {
        key: 'bankOrWalletName',
        label: t('paymentInstructions.bankOrWalletName'),
        value: receiver.bankOrWalletName || receiver.bankName,
      },
      {
        key: 'iban',
        label: t('paymentPending.iban'),
        value: receiver.iban,
        copyable: true,
        valueDir: 'ltr',
      },
      {
        key: 'branchName',
        label: t('paymentPending.branchName'),
        value: receiver.branchName,
      },
      {
        key: 'address',
        label: t('checkout.addressLabel'),
        value: receiver.address,
      },
      {
        key: 'additionalInstructions',
        label: t('paymentInstructions.title'),
        value: receiver.additionalInstructions,
      },
      {
        key: 'amount',
        label: t('paymentPending.amount'),
        value: amountText,
        valueDir: 'ltr',
      },
      {
        key: 'reference',
        label: t('paymentPending.reference'),
        value: order.reference,
        valueDir: 'ltr',
      },
    ],
    [amountText, order.reference, receiver, t],
  );

  const copyValue = async (key, value) => {
    try {
      await copyToClipboard(value);
      haptic();
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1300);
    } catch {
      notify(t('paymentPending.copyFailed'));
    }
  };

  const sendReminder = async () => {
    if (remainingSeconds > 0 || isSendingReminder) return;

    setReminderMessage('');
    setIsSendingReminder(true);
    const updated = await sendMockPaymentReminder(order.id);
    setOrder(updated);
    setIsSendingReminder(false);
    setReminderMessage(t('paymentPending.reminderSent'));
    haptic('medium');
  };

  return (
    <Screen>
      <SubHeader
        title={t('paymentPending.title')}
        showBack={false}
        trailing={<span className={styles.statusPill}>{statusLabel}</span>}
      />

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.heroIcon} aria-hidden="true">
            <span />
          </div>
          <div className={styles.heroText}>
            <span>{t('paymentPending.eyebrow')}</span>
            <h2>{t('paymentPending.title')}</h2>
            <p>{t('paymentPending.body')}</p>
          </div>
        </section>

        <section className={styles.progressCard} aria-label={t('paymentPending.progressLabel')}>
          {['created', 'received', 'waiting', 'confirmed'].map((step) => (
            <div
              key={step}
              className={classNames(
                styles.progressStep,
                step === 'created' || step === 'received'
                  ? styles.done
                  : step === 'waiting'
                    ? styles.current
                    : styles.upcoming,
              )}
            >
              <span aria-hidden="true" />
              <b>{t(`paymentPending.steps.${step}`)}</b>
            </div>
          ))}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('paymentPending.orderSummary')}</span>
            <b>{order.orderNumber}</b>
          </div>

          <div className={styles.summaryGrid}>
            <CompactRow label={t('paymentPending.orderNumber')} value={order.orderNumber} valueDir="ltr" />
            <CompactRow label={t('paymentPending.totalAmount')} value={amountText} valueDir="ltr" strong />
            <CompactRow label={t('paymentPending.paymentMethod')} value={methodLabel} />
            <CompactRow label={t('paymentPending.paymentStatus')} value={statusLabel} />
          </div>

          <div className={styles.items}>
            {order.items.map((item) => (
              <div key={item.id} className={styles.itemRow}>
                <div>
                  <b>{item.name}</b>
                  <span>{t('paymentPending.itemQuantity', { count: item.quantity })}</span>
                </div>
                <strong>{money(item.total)}</strong>
              </div>
            ))}
            <div className={styles.totalRow}>
              <span>{t('cart.total')}</span>
              <b>{amountText}</b>
            </div>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.receiverHeader}>
            <MethodMark method={paymentMethod} label={methodLabel} />
            <div>
              <span>{t('paymentPending.paymentTo')}</span>
              <strong>{methodLabel}</strong>
            </div>
          </div>

          <div className={styles.copyRows}>
            {receiverRows.map((row) => (
              <CopyRow
                key={row.key}
                {...row}
                t={t}
                copied={copiedKey === row.key}
                onCopy={() => copyValue(row.key, row.value)}
              />
            ))}
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('paymentPending.howToPay')}</span>
          </div>
          <ol className={styles.instructions}>
            {['openApp', 'transferExact', 'sendToAccount', 'addReference', 'returnHere'].map((step) => (
              <li key={step}>{t(`paymentPending.instructions.${step}`)}</li>
            ))}
          </ol>
          <p className={styles.note}>{t('paymentPending.note')}</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('paymentPending.paymentFrom')}</span>
          </div>
          <div className={styles.summaryGrid}>
            <CompactRow label={t('paymentPending.senderName')} value={customerPayment.fullName} />
            <CompactRow
              label={t('paymentPending.senderPhoneOrAccount')}
              value={customerPayment.accountIdentifier}
              valueDir="ltr"
            />
            <CompactRow
              label={t('paymentPending.transactionNumber')}
              value={customerPayment.transactionNumber}
              valueDir="ltr"
            />
            <CompactRow label={t('paymentPending.paymentNote')} value={customerPayment.paymentNote} />
          </div>
        </section>

        <section className={styles.reminderCard}>
          <Button
            full
            className={styles.reminderButton}
            disabled={isSendingReminder || remainingSeconds > 0}
            onClick={sendReminder}
          >
            {isSendingReminder
              ? t('paymentPending.reminderSending')
              : t('paymentPending.reminderButton')}
          </Button>
          {reminderMessage && <p className={styles.reminderSuccess}>{reminderMessage}</p>}
          {remainingSeconds > 0 && (
            <p className={styles.cooldown}>
              {t('paymentPending.cooldown', { time: formatCooldown(remainingSeconds) })}
            </p>
          )}
        </section>
      </main>
    </Screen>
  );
}
