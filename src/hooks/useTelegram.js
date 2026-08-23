/*
|--------------------------------------------------------------------------
| useTelegram Hook
|--------------------------------------------------------------------------
| Single access point for the Telegram WebApp SDK. Every method is wrapped
| defensively so the app keeps working in a plain browser during
| development (haptics no-op, feedback goes through the shared toasts).
*/
import { useCallback, useEffect, useMemo } from 'react';
import { useToasts } from '../context/ToastContext';

/** @returns {import('telegram-web-app').WebApp | null} */
function getWebApp() {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

export function useTelegram() {
  const tg = getWebApp();
  const { toast } = useToasts();

  /* Initialise once on mount: expand only. The native chrome colors
     are set from tenant branding via setThemeColors() once branding
     resolves — never hardcoded here. */
  useEffect(() => {
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
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

  /** Show app feedback through the shared toast system. */
  const notify = useCallback(
    (message, options = {}) => {
      toast(message, options);
    },
    [toast],
  );

  /**
   * Theme the native Telegram chrome (header + background) from tenant
   * branding. setHeaderColor accepts a hex string on modern clients;
   * older ones only accept 'bg_color'/'secondary_bg_color' keywords, so
   * failures are swallowed.
   *
   * @param {{header: string, background: string}} colors
   */
  const setThemeColors = useCallback(
    ({ header, background }) => {
      try {
        if (header) tg?.setHeaderColor?.(header);
        if (background) tg?.setBackgroundColor?.(background);
        /* Bot API 8+ also lets us color the bottom bar. */
        if (background) tg?.setBottomBarColor?.(background);
      } catch {
        /* older clients — keep default chrome */
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
    () => ({ tg, haptic, notify, sendData, setThemeColors, user, initData: tg?.initData ?? '' }),
    [tg, haptic, notify, sendData, setThemeColors, user],
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
