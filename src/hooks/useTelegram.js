/*
|--------------------------------------------------------------------------
| useTelegram Hook
|--------------------------------------------------------------------------
| Single access point for the Telegram WebApp SDK. Every method is wrapped
| defensively so the app keeps working in a plain browser during
| development (haptics no-op, alerts fall back to window.alert, etc).
*/
import { useCallback, useEffect, useMemo } from 'react';

/** @returns {import('telegram-web-app').WebApp | null} */
function getWebApp() {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function useTelegram() {
  const tg = getWebApp();

  /* Initialise once on mount: expand + theme the native chrome. */
  useEffect(() => {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      tg.setHeaderColor('#143520');
      tg.setBackgroundColor('#F7F2EA');
    } catch {
      /* older clients may not support every method */
    }
  }, [tg]);

  /** @param {'light'|'medium'|'heavy'|'rigid'|'soft'} [style] */
  const haptic = useCallback(
    (style = 'light') => {
      try {
        tg?.HapticFeedback?.impactOccurred(style);
      } catch {
        /* noop outside Telegram */
      }
    },
    [tg],
  );

  /** Show a native Telegram alert, falling back to window.alert. */
  const notify = useCallback(
    (message) => {
      try {
        if (tg?.showAlert) tg.showAlert(message);
        else window.alert(message);
      } catch {
        window.alert(message);
      }
    },
    [tg],
  );

  /** Send a JSON payload back to the bot (Nutgram `onWebAppData`). */
  const sendData = useCallback(
    (payload) => {
      try {
        tg?.sendData?.(JSON.stringify(payload));
      } catch {
        /* noop outside Telegram */
      }
    },
    [tg],
  );

  /** Telegram user from initDataUnsafe (null outside Telegram).
      NOTE: unverified on the client — always re-validate initData
      server-side before trusting it. */
  const user = tg?.initDataUnsafe?.user ?? null;

  return useMemo(
    () => ({ tg, haptic, notify, sendData, user, initData: tg?.initData ?? '' }),
    [tg, haptic, notify, sendData, user],
  );
}

/**
 * Bind Telegram's native BackButton to an in-app handler while the
 * component using this hook is mounted (and `enabled` is true).
 *
 * @param {boolean} enabled
 * @param {() => void} onBack
 */
export function useTelegramBackButton(enabled, onBack) {
  useEffect(() => {
    const tg = getWebApp();
    if (!tg?.BackButton) return undefined;

    if (!enabled) {
      tg.BackButton.hide();
      return undefined;
    }

    tg.BackButton.show();
    tg.BackButton.onClick(onBack);

    return () => {
      tg.BackButton.offClick(onBack);
      tg.BackButton.hide();
    };
  }, [enabled, onBack]);
}
