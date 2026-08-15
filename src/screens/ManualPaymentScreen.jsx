import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useOrder } from '../context/OrderContext';
import { useCart } from '../context/CartContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { usePaymentMethods } from '../context/PaymentMethodsContext';
import { useTelegram } from '../hooks/useTelegram';
import { createMockManualPaymentOrder } from '../lib/manualPaymentMockService';
import {
  manualReceivingInfoForPaymentMethod,
  paymentMethodLabel,
} from '../lib/paymentMethods';
import { validateManualPaymentDetails } from '../lib/paymentDetailsValidation';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import Field from '../components/ui/Field';
import PaymentMethodHeader from '../components/payment/PaymentMethodHeader';
import { StoreStatusNotice } from '../components/StoreStatus';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './ManualPaymentScreen.module.css';

function InfoRow({ label, value }) {
  if (!value) return null;

  return (
    <div className={styles.infoRow}>
      <span>{label}</span>
      <b dir="auto">{value}</b>
    </div>
  );
}

export default function ManualPaymentScreen() {
  const { t } = useTranslation();
  const routeNavigate = useNavigate();
  const nameRef = useRef(null);
  const accountRef = useRef(null);
  const addressRef = useRef(null);
  const {
    details,
    updateDetails,
    paymentMethod,
    manualPaymentSender,
    updateManualPaymentSender,
    confirmOrder,
  } = useOrder();
  const { entries, total } = useCart();
  const { canCheckout } = useStoreStatus();
  const { findPaymentMethod } = usePaymentMethods();
  const { notify } = useTelegram();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touched, setTouched] = useState({
    fullName: false,
    accountIdentifier: false,
    address: false,
  });

  const method = findPaymentMethod(paymentMethod);
  const methodLabel = paymentMethodLabel(method, t) || t('payment.types.manual');
  const receiver = manualReceivingInfoForPaymentMethod(method);
  const validation = validateManualPaymentDetails(
    { ...manualPaymentSender, address: details.address },
    t,
  );
  const visibleErrors = {
    fullName: touched.fullName ? validation.errors.fullName : '',
    accountIdentifier: touched.accountIdentifier ? validation.errors.accountIdentifier : '',
    address: touched.address ? validation.errors.address : '',
  };

  const submit = () => {
    if (!canCheckout) {
      notify(t('storeStatus.closedFallback'));
      return;
    }

    if (!method || method.type !== 'manual') return;

    setTouched({ fullName: true, accountIdentifier: true, address: true });

    if (!validation.isValid) {
      notify(t('manualPayment.invalid'));
      if (validation.errors.fullName) {
        nameRef.current?.focus();
      } else if (validation.errors.accountIdentifier) {
        accountRef.current?.focus();
      } else {
        addressRef.current?.focus();
      }
      return;
    }

    setIsSubmitting(true);
    const order = createMockManualPaymentOrder({
      entries,
      total,
      paymentMethodId: method.id,
      paymentMethod: method,
      manualPaymentSender: validation.value,
      address: validation.value.address,
    });
    confirmOrder(order.orderNumber);
    routeNavigate(`/orders/${encodeURIComponent(order.id)}/payment/pending`);
  };

  return (
    <Screen>
      <SubHeader title={t('manualPayment.title')} />
      <div className={styles.pad}>
        <section className={styles.paymentPanel} aria-labelledby="manual-payment-heading">
          <PaymentMethodHeader
            method={method}
            label={methodLabel}
            kicker={t('manualPayment.kicker')}
            headingId="manual-payment-heading"
            variant="manual"
          />

          <p className={styles.body}>{t('manualPayment.body')}</p>

          {receiver && (
            <div className={styles.receiverBox} aria-label={t('manualPayment.receiverDetails')}>
              <InfoRow label={t('paymentPending.receiverName')} value={receiver.receiverName} />
              <InfoRow
                label={t('paymentPending.accountHolderName')}
                value={receiver.accountHolderName}
              />
              <InfoRow
                label={t('paymentPending.walletPhoneNumber')}
                value={receiver.walletPhoneNumber}
              />
              <InfoRow
                label={t('paymentPending.accountNumber')}
                value={receiver.accountNumber}
              />
              <InfoRow
                label={t('paymentInstructions.bankOrWalletName')}
                value={receiver.bankOrWalletName || receiver.bankName}
              />
              <InfoRow label={t('paymentPending.iban')} value={receiver.iban} />
              <InfoRow label={t('paymentPending.branchName')} value={receiver.branchName} />
              <InfoRow label={t('checkout.addressLabel')} value={receiver.address} />
              <InfoRow
                label={t('paymentInstructions.title')}
                value={receiver.additionalInstructions}
              />
            </div>
          )}

          <div className={styles.fields}>
            <Field
              inputRef={nameRef}
              label={t('manualPayment.fullName')}
              placeholder={t('manualPayment.fullNamePlaceholder')}
              value={manualPaymentSender.fullName}
              onChange={(event) => updateManualPaymentSender({ fullName: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, fullName: true }))}
              autoComplete="name"
              enterKeyHint="next"
              error={visibleErrors.fullName}
              required
            />

            <Field
              inputRef={accountRef}
              label={t('manualPayment.accountIdentifier')}
              placeholder={t('manualPayment.accountPlaceholder')}
              value={manualPaymentSender.accountIdentifier}
              onChange={(event) => updateManualPaymentSender({ accountIdentifier: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, accountIdentifier: true }))}
              inputMode="text"
              autoComplete="off"
              dir="ltr"
              enterKeyHint="next"
              error={visibleErrors.accountIdentifier}
              required
            />

            <Field
              inputRef={addressRef}
              multiline
              rows={3}
              label={t('manualPayment.address')}
              placeholder={t('manualPayment.addressPlaceholder')}
              value={details.address}
              onChange={(event) => updateDetails({ address: event.target.value })}
              onBlur={() => setTouched((prev) => ({ ...prev, address: true }))}
              autoComplete="street-address"
              enterKeyHint="done"
              error={visibleErrors.address}
              required
            />
          </div>
        </section>
      </div>
      <StoreStatusNotice />
      <FixedCta>
        <Button variant="green" full onClick={submit} disabled={isSubmitting || !canCheckout || !method}>
          {isSubmitting
            ? t('manualPayment.sending')
            : canCheckout
              ? t('checkout.continue')
              : t('storeStatus.closedCheckout')}
        </Button>
      </FixedCta>
    </Screen>
  );
}
