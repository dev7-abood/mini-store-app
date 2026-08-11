/*
|--------------------------------------------------------------------------
| Navigation Context
|--------------------------------------------------------------------------
| The Mini App is a linear flow, so navigation is a small screen state
| machine instead of a router — this plays nicer with Telegram's WebView
| and lets us bind the native BackButton to the flow's back map.
*/
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useTelegram, useTelegramBackButton } from '../hooks/useTelegram';

export const SCREENS = Object.freeze({
  SPLASH: 'splash',
  MENU: 'menu',
  CART: 'cart',
  CHECKOUT: 'checkout',
  PHONE: 'phone',
  OTP: 'otp',
  SUCCESS: 'success',
  STATUS: 'status',
});

/** Where the native/in-app back button leads from each screen. */
const BACK_MAP = {
  [SCREENS.CART]: SCREENS.MENU,
  [SCREENS.CHECKOUT]: SCREENS.CART,
  [SCREENS.PHONE]: SCREENS.CHECKOUT,
  [SCREENS.OTP]: SCREENS.PHONE,
};

const NavigationContext = createContext(null);

export function NavigationProvider({ children }) {
  const [screen, setScreen] = useState(SCREENS.SPLASH);
  const { haptic } = useTelegram();

  const navigate = useCallback(
    (next) => {
      setScreen(next);
      window.scrollTo(0, 0);
      haptic();
    },
    [haptic],
  );

  const goBack = useCallback(() => {
    const target = BACK_MAP[screen];
    if (target) navigate(target);
  }, [screen, navigate]);

  /* Show Telegram's native BackButton whenever the screen has a back target. */
  useTelegramBackButton(Boolean(BACK_MAP[screen]), goBack);

  const value = useMemo(
    () => ({ screen, navigate, goBack }),
    [screen, navigate, goBack],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation() {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error('useNavigation must be used inside <NavigationProvider>');
  return ctx;
}
