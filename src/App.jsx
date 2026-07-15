/*
|--------------------------------------------------------------------------
| App Shell
|--------------------------------------------------------------------------
| Renders the active screen from the navigation state machine. Providers
| are composed here: Navigation (screen flow) -> Cart -> Order.
*/
import { NavigationProvider, useNavigation, SCREENS } from './context/NavigationContext';
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

export default function App() {
  return (
    <NavigationProvider>
      <CartProvider>
        <OrderProvider>
          <ActiveScreen />
        </OrderProvider>
      </CartProvider>
    </NavigationProvider>
  );
}
