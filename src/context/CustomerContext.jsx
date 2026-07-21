/*
|--------------------------------------------------------------------------
| Customer Context
|--------------------------------------------------------------------------
| Syncs the Telegram user as a tenant Customer the moment the tenant is
| resolved (POST /api/v1/telegram/customer). The backend derives the
| identity from verified initData; we only send the bot id so it can
| resolve the branch.
|
| The returned record (phone / address / username / total_orders) is
| kept here so checkout can PRE-FILL for returning customers — they
| never retype their address on the second order.
|
| Fire-and-forget: a sync failure never blocks the app; the customer
| simply types their details as a first-timer would.
*/
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { syncCustomer, hasBackend } from '../api/client';
import { useTenant } from './TenantContext';

const CustomerContext = createContext(null);

export function CustomerProvider({ children }) {
  const tenant = useTenant();
  const [customer, setCustomer] = useState(null);
  const [synced, setSynced] = useState(false);

  /* Launch sync: runs once when the tenant becomes ready. */
  useEffect(() => {
    if (tenant.status !== 'ready' || !hasBackend()) return;

    let cancelled = false;

    (async () => {
      const record = await syncCustomer({ botId: tenant.botId });
      if (cancelled) return;
      if (record) setCustomer(record);
      setSynced(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [tenant.status, tenant.botId]);

  /**
   * Re-sync with profile data (called after checkout completes so the
   * next order pre-fills with the freshest phone/address).
   */
  const updateProfile = useCallback(
    async ({ phone, address }) => {
      const record = await syncCustomer({ botId: tenant.botId, phone, address });
      if (record) setCustomer(record);
      return record;
    },
    [tenant.botId],
  );

  const value = useMemo(
    () => ({ customer, synced, updateProfile }),
    [customer, synced, updateProfile],
  );

  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  const ctx = useContext(CustomerContext);
  if (!ctx) throw new Error('useCustomer must be used inside <CustomerProvider>');
  return ctx;
}
