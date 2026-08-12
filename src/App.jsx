/*
|--------------------------------------------------------------------------
| App Shell
|--------------------------------------------------------------------------
| Renders the active screen from the navigation state machine. Providers
| are composed here: Navigation (screen flow) -> Cart -> Order.
*/
import { useEffect, useRef, useState } from 'react';
import { NavigationProvider, useNavigation, SCREENS } from './context/NavigationContext';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { TenantProvider, useTenant } from './context/TenantContext';
import { CatalogProvider, useCatalog } from './context/CatalogContext';
import { BrandingProvider } from './context/BrandingContext';
import { StoreStatusProvider } from './context/StoreStatusContext';
import { CustomerProvider } from './context/CustomerContext';
import { CartProvider } from './context/CartContext';
import { OrderProvider } from './context/OrderContext';
import { OrderFlowProvider } from './context/OrderFlowContext';
import SplashScreen from './screens/SplashScreen';
import MenuScreen from './screens/MenuScreen';
import CartScreen from './screens/CartScreen';
import CheckoutScreen from './screens/CheckoutScreen';
import PhoneScreen from './screens/PhoneScreen';
import SmartPaymentScreen from './screens/SmartPaymentScreen';
import ManualPaymentScreen from './screens/ManualPaymentScreen';
import OtpScreen from './screens/OtpScreen';
import PaymentPendingScreen from './screens/PaymentPendingScreen';
import SuccessScreen from './screens/SuccessScreen';
import StatusScreen from './screens/StatusScreen';
import OpenFromBotScreen from './screens/OpenFromBotScreen';
import CatalogErrorScreen from './screens/CatalogErrorScreen';
import CatalogEmptyScreen from './screens/CatalogEmptyScreen';
import AppInitialLoader from './screens/AppInitialLoader';
import { orderNumberFromStartParam } from './lib/telegramStartParam';

/** @type {Record<string, React.ComponentType>} */
const SCREEN_COMPONENTS = {
  [SCREENS.SPLASH]: SplashScreen,
  [SCREENS.MENU]: MenuScreen,
  [SCREENS.CART]: CartScreen,
  [SCREENS.CHECKOUT]: CheckoutScreen,
  [SCREENS.PHONE]: PhoneScreen,
  [SCREENS.SMART_PAYMENT]: SmartPaymentScreen,
  [SCREENS.MANUAL_PAYMENT]: ManualPaymentScreen,
  [SCREENS.OTP]: OtpScreen,
  [SCREENS.SUCCESS]: SuccessScreen,
  [SCREENS.STATUS]: StatusScreen,
};

function ActiveScreen() {
  const { screen } = useNavigation();
  const Component = SCREEN_COMPONENTS[screen] ?? MenuScreen;
  return <Component key={screen} />;
}

function TelegramStartParamRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const consumedRef = useRef(false);

  useEffect(() => {
    if (consumedRef.current) return;

    const orderNumber = orderNumberFromStartParam();
    if (!orderNumber) return;

    consumedRef.current = true;
    const orderPath = `/orders/${encodeURIComponent(orderNumber)}`;
    if (location.pathname !== orderPath) {
      navigate(orderPath, { replace: true });
    }
  }, [location.pathname, navigate]);

  return null;
}

function OrderFlowScreens() {
  return (
    <>
      <TelegramStartParamRedirect />
      <Routes>
        <Route path="/orders/:orderNumber/payment/pending" element={<PaymentPendingScreen />} />
        <Route path="/orders/:orderNumber" element={<StatusScreen />} />
        <Route
          path="*"
          element={
            <CatalogProvider>
              <CatalogGate>
                <CartProvider>
                  <ActiveScreen />
                </CartProvider>
              </CatalogGate>
            </CatalogProvider>
          }
        />
      </Routes>
    </>
  );
}

/** Blocks the app shell until tenant configuration is fully initialized. */
function TenantGate({ children }) {
  const { isLoading, isMissing } = useTenant();
  const [showLoader, setShowLoader] = useState(isLoading);
  const [loaderExiting, setLoaderExiting] = useState(false);

  useEffect(() => {
    if (isLoading) {
      setShowLoader(true);
      setLoaderExiting(false);
      return undefined;
    }

    if (!showLoader) return undefined;

    setLoaderExiting(true);
    const timer = setTimeout(() => setShowLoader(false), 300);
    return () => clearTimeout(timer);
  }, [isLoading, showLoader]);

  if (isLoading) return <AppInitialLoader />;

  const content = isMissing ? <OpenFromBotScreen /> : children;
  return (
    <>
      {content}
      {showLoader && <AppInitialLoader exiting={loaderExiting} />}
    </>
  );
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
            <StoreStatusProvider>
              <CustomerProvider>
                <OrderProvider>
                  <OrderFlowProvider>
                    <OrderFlowScreens />
                  </OrderFlowProvider>
                </OrderProvider>
              </CustomerProvider>
            </StoreStatusProvider>
          </BrandingProvider>
        </TenantGate>
      </TenantProvider>
    </NavigationProvider>
  );
}
