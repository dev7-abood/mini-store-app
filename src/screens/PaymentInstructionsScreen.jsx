import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBranding } from '../context/BrandingContext';
import { useCart } from '../context/CartContext';
import { useOrder } from '../context/OrderContext';
import { useOrderFlow } from '../context/OrderFlowContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useTelegram } from '../hooks/useTelegram';
import { useMoney } from '../hooks/useMoney';
import {
  findPaymentMethod,
  manualReceivingInfoForMethod,
} from '../lib/paymentMethods';
import { buildOrderMessage } from '../lib/orderMessage';
import { sendOrderToChat } from '../api/telegramBot';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './PaymentInstructionsScreen.module.css';

function classNames(...names) {
  return names.filter(Boolean).join(' ');
}

function optionalTranslation(t, key) {
  if (!key) return '';
  const translated = t(key);
  return translated === key ? '' : translated;
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

function MethodMark({ method, label }) {
  if (method?.logo) {
    return (
      <span className={styles.methodMark}>
        <img src={method.logo} alt="" />
      </span>
    );
  }

  return (
    <span className={styles.methodMark} aria-hidden="true">
      <span>{method?.icon || label.slice(0, 2)}</span>
    </span>
  );
}

function ValueRow({
  label,
  value,
  copyValue,
  required = false,
  valueDir = 'auto',
  copyLabel,
  copied,
  onCopy,
  t,
}) {
  if (!value && !required) return null;

  const missing = !value;
  const displayValue = missing ? t('paymentInstructions.notConfigured') : value;

  return (
    <div className={styles.valueRow}>
      <div className={styles.valueText}>
        <span>{label}</span>
        <b
          className={classNames(missing && styles.missingValue)}
          dir={valueDir}
        >
          {displayValue}
        </b>
      </div>
      {!missing && copyValue && (
        <button
          type="button"
          className={classNames(styles.copyButton, copied && styles.copyButtonDone)}
          onClick={onCopy}
          aria-label={t('paymentInstructions.copyValue', { label: copyLabel || label })}
        >
          {copied ? t('paymentInstructions.copiedShort') : t('paymentInstructions.copy')}
        </button>
      )}
    </div>
  );
}

export default function PaymentInstructionsScreen() {
  const { t } = useTranslation();
  const money = useMoney();
  const { branding } = useBranding();
  const { entries, subtotal, deliveryFee, total } = useCart();
  const {
    details,
    fullPhone,
    fullDeliveryPhone,
    paymentMethod,
    orderNumber: localOrderNumber,
  } = useOrder();
  const { order, submitManualProof, isBusy } = useOrderFlow();
  const { navigate } = useNavigation();
  const { haptic, notify } = useTelegram();
  const [transactionReference, setTransactionReference] = useState('');
  const [receiptFile, setReceiptFile] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const announcedRef = useRef(false);

  const methodId = order?.paymentMethod ?? paymentMethod;
  const method = findPaymentMethod(methodId);
  const methodLabel = order?.paymentMethodLabel || (method ? t(method.labelKey) : t('paymentInstructions.manualPayment'));
  const receivingInfo = manualReceivingInfoForMethod(methodId, order?.paymentReceivingInfo) ?? {};
  const receiverName = receivingInfo.receiverName || branding.name || t('brand.name');
  const bankOrWalletName = receivingInfo.bankOrWalletName || methodLabel;
  const additionalInstructions =
    receivingInfo.additionalInstructions
    || optionalTranslation(t, receivingInfo.additionalInstructionsKey);
  const referenceNumber = order?.orderNumber || localOrderNumber;
  const amountNumber = Number(order?.total || total || 0);
  const amountText = money(amountNumber);

  const rows = useMemo(
    () => [
      {
        key: 'receiver',
        label: t('paymentInstructions.receiverName'),
        value: receiverName,
      },
      {
        key: 'account',
        label: t('paymentInstructions.accountOrPhone'),
        value: receivingInfo.accountNumber,
        required: true,
        copyValue: receivingInfo.accountNumber,
        valueDir: 'ltr',
      },
      {
        key: 'bank',
        label: t('paymentInstructions.bankOrWalletName'),
        value: bankOrWalletName,
      },
      {
        key: 'iban',
        label: t('paymentInstructions.iban'),
        value: receivingInfo.iban,
        copyValue: receivingInfo.iban,
        valueDir: 'ltr',
      },
      {
        key: 'branch',
        label: t('paymentInstructions.branchName'),
        value: receivingInfo.branchName,
      },
      {
        key: 'amount',
        label: t('paymentInstructions.amountToPay'),
        value: amountText,
        copyValue: amountText,
        valueDir: 'ltr',
      },
      {
        key: 'reference',
        label: t('paymentInstructions.referenceNumber'),
        value: referenceNumber,
        copyValue: referenceNumber,
        valueDir: 'ltr',
      },
    ],
    [
      amountText,
      bankOrWalletName,
      receivingInfo.accountNumber,
      receivingInfo.branchName,
      receivingInfo.iban,
      receiverName,
      referenceNumber,
      t,
    ],
  );

  useEffect(() => {
    if (announcedRef.current || !referenceNumber || entries.length === 0) return;

    announcedRef.current = true;
    const message = buildOrderMessage({
      orderNumber: referenceNumber,
      entries,
      subtotal,
      deliveryFee,
      total: amountNumber,
      details,
      phone: fullPhone,
      deliveryPhone: fullDeliveryPhone,
      paymentMethodLabel: methodLabel,
      paymentStatus: t('status.values.awaiting_payment'),
    });
    sendOrderToChat(message);
  }, [
    amountNumber,
    deliveryFee,
    details,
    entries,
    fullDeliveryPhone,
    fullPhone,
    methodLabel,
    referenceNumber,
    subtotal,
    t,
  ]);

  const copyValue = async (key, value) => {
    try {
      await copyToClipboard(value);
      haptic();
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey(null), 1200);
    } catch {
      notify(t('paymentInstructions.copyFailed'));
    }
  };

  const submitProof = async () => {
    if (!transactionReference.trim()) {
      notify(t('paymentInstructions.missingTransaction'));
      return;
    }

    if (!receiptFile) {
      notify(t('paymentInstructions.missingReceipt'));
      return;
    }

    const result = await submitManualProof({
      transactionReference: transactionReference.trim(),
      receiptFile,
    });

    if (!result.ok) {
      notify(result.message || t('paymentInstructions.submitFailed'));
      return;
    }

    haptic('heavy');
    notify(t('paymentInstructions.submitted'));
    navigate(SCREENS.SUCCESS);
  };

  return (
    <Screen>
      <SubHeader
        title={t('paymentInstructions.title')}
        showBack={false}
        trailing={<span className={styles.statusPill}>{t('status.values.awaiting_payment')}</span>}
      />

      <main className={styles.content}>
        <section className={styles.hero}>
          <div className={styles.methodCard}>
            <MethodMark method={method} label={methodLabel} />
            <div>
              <span>{t('paymentInstructions.sendPaymentTo')}</span>
              <strong>{methodLabel}</strong>
            </div>
          </div>
          <p>{t('paymentInstructions.awaitingPaymentNote')}</p>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('paymentInstructions.sendPaymentTo')}</span>
            <b>{bankOrWalletName}</b>
          </div>

          <div className={styles.values}>
            {rows.map((row) => (
              <ValueRow
                key={row.key}
                {...row}
                t={t}
                copied={copiedKey === row.key}
                onCopy={() => copyValue(row.key, row.copyValue)}
              />
            ))}
          </div>

          {additionalInstructions && (
            <p className={styles.instructions}>{additionalInstructions}</p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelTitle}>
            <span>{t('paymentInstructions.afterTransferTitle')}</span>
            <b>{t('paymentInstructions.proofStatus')}</b>
          </div>

          <Field
            label={t('paymentInstructions.transactionReference')}
            placeholder={t('paymentInstructions.transactionReferencePlaceholder')}
            value={transactionReference}
            onChange={(event) => setTransactionReference(event.target.value)}
            autoComplete="off"
          />

          <label className={styles.uploadBox}>
            <input
              className={styles.fileInput}
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
            />
            <span>{receiptFile?.name || t('paymentInstructions.receiptPlaceholder')}</span>
            <small>{t('paymentInstructions.receiptHint')}</small>
          </label>
        </section>
      </main>

      <FixedCta>
        <Button variant="green" full onClick={submitProof} disabled={isBusy}>
          {isBusy ? t('paymentInstructions.submitting') : t('paymentInstructions.submitProof')}
        </Button>
      </FixedCta>
    </Screen>
  );
}
