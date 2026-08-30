/*
|--------------------------------------------------------------------------
| Order Context
|--------------------------------------------------------------------------
| Holds the checkout form data (name / address / note / phones), the
| chosen payment method and the confirmed order number, shared across the
| checkout -> OTP -> status flow.
|
| Delivery phone behavior: mirrors the main phone while the user types,
| until the delivery field is edited manually — then it becomes
| independent (ordering for someone else).
*/
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCustomer } from './CustomerContext';
import { formatLocalPhone, toLocalDigits } from '../lib/phone';
import { usePaymentMethods } from './PaymentMethodsContext';

export const PHONE_PREFIX = '+970';

const OrderContext = createContext(null);

/** "+970" + normalized local digits, e.g. +970598304517 */
const toE164 = (value) => `${PHONE_PREFIX}${toLocalDigits(value)}`;

export function OrderProvider({ children }) {
  const { customer } = useCustomer();
  const {
    defaultPaymentMethod,
    findPaymentMethod: findAvailablePaymentMethod,
  } = usePaymentMethods();
  const [details, setDetails] = useState({ name: '', address: '', note: '' });
  const [phone, setPhoneState] = useState('');
  const [deliveryPhone, setDeliveryPhoneState] = useState('');
  const [deliveryEdited, setDeliveryEdited] = useState(false);
  const [orderNumber, setOrderNumber] = useState(null);
  /* Empty until the API answers: the methods a store accepts are its
     own, and there is no local list to guess from. */
  const [paymentMethod, setPaymentMethod] = useState('');
  const prefilled = useRef(false);

  /* Keep the selection valid as methods load or change under it. */
  useEffect(() => {
    setPaymentMethod((current) => (
      findAvailablePaymentMethod(current) ? current : defaultPaymentMethod
    ));
  }, [defaultPaymentMethod, findAvailablePaymentMethod]);

  /* Pre-fill for returning customers: when the launch sync delivers a
     profile, seed any still-empty fields once. Never overwrites what
     the user has already typed, and never runs twice.
     NOTE: name is intentionally NOT seeded from the Telegram username —
     only from a real saved delivery name (customer.name). A @handle is
     not a person's name and shouldn't land on the order silently. */
  useEffect(() => {
    if (customer === null || prefilled.current) return;
    prefilled.current = true;

    setDetails((prev) => ({
      ...prev,
      name: prev.name || customer.name || '',
      address: prev.address || customer.address || '',
    }));

    if (customer.phone) {
      const local = formatLocalPhone(customer.phone.replace(/^\+?970/, ''));
      setPhoneState((prev) => prev || local);
      setDeliveryPhoneState((prev) => prev || local);
    }
  }, [customer]);

  const value = useMemo(
    () => ({
      details,
      phone,
      deliveryPhone,
      deliveryEdited,
      orderNumber,
      /** Merge a partial update into the delivery details. */
      updateDetails: (patch) => setDetails((prev) => ({ ...prev, ...patch })),
      /** Main phone; mirrors into the delivery phone until that's edited. */
      setPhone: (next) => {
        setPhoneState(next);
        if (!deliveryEdited) setDeliveryPhoneState(next);
      },
      /** Delivery contact phone; first manual edit detaches the mirror. */
      setDeliveryPhone: (next) => {
        setDeliveryEdited(true);
        setDeliveryPhoneState(next);
      },
      paymentMethod,
      setPaymentMethod,
      fullPhone: toE164(phone),
      /** Falls back to the main phone when the delivery field is empty. */
      /* Delivery phone: the number the driver calls. Falls back to the
         account phone only when the customer left it blank (they're the
         same person by default), otherwise sends the distinct number. */
      fullDeliveryPhone: toE164(deliveryPhone.trim() ? deliveryPhone : phone),
      /**
       * Record the confirmed order number. The server issues the real
       * one (POST /checkout); the random fallback exists only for the
       * no-backend demo path so the success screen still has something
       * to show.
       *
       * @param {string} [serverOrderNumber]
       * @returns {string}
       */
      confirmOrder: (serverOrderNumber) => {
        const number = serverOrderNumber || `#SF-${Math.floor(1000 + Math.random() * 9000)}`;
        setOrderNumber(number);
        return number;
      },
      resetOrder: () => {
        setDetails({ name: '', address: '', note: '' });
        setPhoneState('');
        setDeliveryPhoneState('');
        setDeliveryEdited(false);
        setOrderNumber(null);
        setPaymentMethod(defaultPaymentMethod);
      },
    }),
    [
      details,
      phone,
      deliveryPhone,
      deliveryEdited,
      orderNumber,
      paymentMethod,
      defaultPaymentMethod,
    ],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrder must be used inside <OrderProvider>');
  return ctx;
}
