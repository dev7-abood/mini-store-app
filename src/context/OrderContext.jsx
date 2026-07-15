/*
|--------------------------------------------------------------------------
| Order Context
|--------------------------------------------------------------------------
| Holds the checkout form data (name / address / note / phone) and the
| confirmed order number, shared across the checkout -> OTP -> status flow.
*/
import { createContext, useContext, useMemo, useState } from 'react';

export const PHONE_PREFIX = '+970';

const OrderContext = createContext(null);

export function OrderProvider({ children }) {
  const [details, setDetails] = useState({ name: '', address: '', note: '' });
  const [phone, setPhone] = useState('');
  const [orderNumber, setOrderNumber] = useState(null);

  const value = useMemo(
    () => ({
      details,
      phone,
      orderNumber,
      /** Merge a partial update into the delivery details. */
      updateDetails: (patch) => setDetails((prev) => ({ ...prev, ...patch })),
      setPhone,
      /** Digits-only phone in E.164, e.g. +970599000000 */
      fullPhone: `${PHONE_PREFIX}${phone.replace(/\D/g, '')}`,
      confirmOrder: () => {
        const number = `#SF-${Math.floor(1000 + Math.random() * 9000)}`;
        setOrderNumber(number);
        return number;
      },
      resetOrder: () => {
        setDetails({ name: '', address: '', note: '' });
        setPhone('');
        setOrderNumber(null);
      },
    }),
    [details, phone, orderNumber],
  );

  return <OrderContext.Provider value={value}>{children}</OrderContext.Provider>;
}

export function useOrder() {
  const ctx = useContext(OrderContext);
  if (!ctx) throw new Error('useOrder must be used inside <OrderProvider>');
  return ctx;
}
