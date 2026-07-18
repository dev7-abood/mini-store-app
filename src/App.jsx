/*
|--------------------------------------------------------------------------
| App Shell
|--------------------------------------------------------------------------
| Renders the active screen from the navigation state machine. Providers
| are composed here: Navigation (screen flow) -> Cart -> Order.
*/
import { NavigationProvider, useNavigation, SCREENS } from './context/NavigationContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { CatalogProvider } from './context/CatalogContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import SplashScreen from './screens/SplashScreen';
import MenuScreen from './screens/MenuScreen';
import CartScreen from './screens/CartScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import PhoneScreen from './screens/PhoneScreen';
import OtpScreen from './screens/OtpScreen';
import SuccessScreen from './screens/SuccessScreen';
import StatusScreen from './screens/StatusScreen';
import OpenFromBotScreen from './screens/OpenFromBotScreen';

/** @type {Record<string, React.ComponentType>} */
const SCREEN_COMPONENTS = {
  [SCREENS.SPLASH]: SplashScreen,
  [SCREENS.MENU]: MenuScreen,
  [SCREENS.CART]: CartScreen,
  [SCREENS.CHECKOUT]: CheckoutScreen,
  [SCREENS.PHONE]: PhoneScreen,
  [SCREENS.OTP]: OtpScreen,
  [SCREENS.SUCCESS]: SuccessScreen,
  [SCREENS.STATUS]: StatusScreen,
};

function ActiveScreen() {
  const { screen } = useNavigation();
  const Component = SCREEN_COMPONENTS[screen] ?? MenuScreen;
  return <Component key={screen} />;
}

/** Blocks the whole flow when no tenant could be resolved in Telegram. */
function TenantGate({ children }) {
  const { isMissing } = useTenant();
  if (isMissing) return <OpenFromBotScreen />;
  return children;
}

export default function App() {
  return (
    <NavigationProvider>
      <TenantProvider>
        <TenantGate>
          <CatalogProvider>
            <CartProvider>
              <OrderProvider>
                <ActiveScreen />
              </OrderProvider>
            </CartProvider>
          </CatalogProvider>
        </TenantGate>
      </TenantProvider>
    </NavigationProvider>
  );
}
