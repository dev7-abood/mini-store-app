/*
|--------------------------------------------------------------------------
| App Shell
|--------------------------------------------------------------------------
| Renders the active screen from the navigation state machine. Providers
| are composed here: Navigation (screen flow) -> Cart -> Order.
*/
import { NavigationProvider, useNavigation, SCREENS } from './context/NavigationContext';
import { TenantProvider, useTenant } from './context/TenantContext';
import { CatalogProvider, useCatalog } from './context/CatalogContext';
import { BrandingProvider, useBranding } from './context/BrandingContext';
import { CustomerProvider } from './context/CustomerContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import { OrderFlowProvider } from './context/OrderFlowContext';
import SplashScreen from './screens/SplashScreen';
import MenuScreen from './screens/MenuScreen';
import CartScreen from './screens/CartScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import PhoneScreen from './screens/PhoneScreen';
import OtpScreen from './screens/OtpScreen';
import SuccessScreen from './screens/SuccessScreen';
import StatusScreen from './screens/StatusScreen';
import OpenFromBotScreen from './screens/OpenFromBotScreen';
import CatalogErrorScreen from './screens/CatalogErrorScreen';
import CatalogEmptyScreen from './screens/CatalogEmptyScreen';
import BrandingLoader from './screens/BrandingLoader';
import BrandingErrorScreen from './screens/BrandingErrorScreen';

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

/**
 * Holds the app on a neutral loader until the tenant BRANDING has
 * resolved, so no screen ever paints in default (green) colors and
 * then recolors. On branding failure, shows the "sorry" screen.
 */
function BrandingGate({ children }) {
  const { isLoading, isError } = useBranding();
  if (isError) return <BrandingErrorScreen />;
  if (isLoading) return <BrandingLoader />;
  return children;
}

/**
 * Blocks the flow when the catalog can't be shown:
 *   error — the request failed (retry)
 *   empty — the request succeeded but the merchant has no products yet
 */
function CatalogGate({ children }) {
  const { isError, isEmpty } = useCatalog();
  if (isError) return <CatalogErrorScreen />;
  if (isEmpty) return <CatalogEmptyScreen />;
  return children;
}

export default function App() {
  return (
    <NavigationProvider>
      <TenantProvider>
        <TenantGate>
          <BrandingProvider>
            <BrandingGate>
              <CustomerProvider>
                <CatalogProvider>
                  <CatalogGate>
                    <CartProvider>
                      <OrderProvider>
                        <OrderFlowProvider>
                          <ActiveScreen />
                        </OrderFlowProvider>
                      </OrderProvider>
                    </CartProvider>
                  </CatalogGate>
                </CatalogProvider>
              </CustomerProvider>
            </BrandingGate>
          </BrandingProvider>
        </TenantGate>
      </TenantProvider>
    </NavigationProvider>
  );
}
