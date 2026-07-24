/*
|--------------------------------------------------------------------------
| Order Context
|--------------------------------------------------------------------------
| Holds the checkout form data (name / address / note / phones) and the
| confirmed order number, shared across the checkout -> OTP -> status flow.
|
| Delivery phone behavior: mirrors the main phone while the user types,
| until the delivery field is edited manually — then it becomes
| independent (ordering for someone else).
*/
import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCustomer } from './CustomerContext';
import { formatLocalPhone } from '../lib/phone';

export const PHONE_PREFIX = '+970';

const OrderContext = createContext(null);

/** "+970" + digits only, e.g. +970598304517 */
const toE164 = (value) => `${PHONE_PREFIX}${String(value).replace(/\D/g, '')}`;

export function OrderProvider({ children }) {
  const { customer } = useCustomer();
  const [details, setDetails] = useState({ name: '', address: '', note: '' });
  const [phone, setPhoneState] = useState('');
  const [deliveryPhone, setDeliveryPhoneState] = useState('');
  const [deliveryEdited, setDeliveryEdited] = useState(false);
  const [orderNumber, setOrderNumber] = useState(null);
  const prefilled = useRef(false);

  /* Pre-fill for returning customers: when the launch sync delivers a
     profile, seed any still-empty fields once. Never overwrites what
     the user has already typed, and never runs twice. */
  useEffect(() => {
    if (customer === null || prefilled.current) return;
    prefilled.current = true;

    setDetails((prev) => ({
      ...prev,
      name: prev.name || customer.username || '',
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
      fullPhone: toE164(phone),
      /** Falls back to the main phone when the delivery field is empty. */
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
      },
    }),
    [details, phone, deliveryPhone, deliveryEdited, orderNumber],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrder must be used inside <OrderProvider>');
  return ctx;
}
