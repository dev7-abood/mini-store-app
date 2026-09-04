import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useStoreStatus } from '../context/StoreStatusContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useMoney } from '../hooks/useMoney';
import { useBusinessTypeConfig } from '../hooks/useBusinessTypeConfig';
import { useCheckoutAmountLimit } from '../hooks/useCheckoutAmountLimit';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import CartItem from '../components/CartItem';
import CartProductGroup from '../components/CartProductGroup';
import { StoreStatusNotice } from '../components/StoreStatus';
import CheckoutAmountNotice from '../components/CheckoutAmountNotice';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CartScreen.module.css';

/** Cart review screen with totals and checkout entry point. */
export default function CartScreen() {
  const { t } = useTranslation();
  const money = useMoney();
  /* All server-computed and already rounded; null means the backend
     hasn't priced the cart yet, and the row is skipped. */
  const { groupedEntries, count, subtotal, discountTotal, deliveryFee, total } = useCart();
  const { canCheckout } = useStoreStatus();
  const { navigate } = useNavigation();
  const { icons } = useBusinessTypeConfig();
  /* The earliest screen that can say it: a total outside the accepted
     range is caught here, before a method is even chosen. */
  const amountLimit = useCheckoutAmountLimit();

  const isEmpty = count === 0;

  return (
    <Screen>
      <SubHeader title={t('cart.title')} />
      <div className={styles.pad}>
        {isEmpty ? (
          <CenterIllustration icon={icons.cart}>{t('cart.empty')}</CenterIllustration>
        ) : (
          <>
            {groupedEntries.map((group) =>
              /* A plain product always has exactly one line with no
                 price option — keep its existing single-row rendering. */
              group.lines.length === 1 && !group.lines[0].priceOption ? (
                <CartItem
                  key={group.product.id}
                  product={group.product}
                  qty={group.lines[0].qty}
                  lineTotal={group.lines[0].lineTotal}
                />
              ) : (
                <CartProductGroup key={group.product.id} product={group.product} lines={group.lines} />
              ),
            )}
            <div className={styles.totals}>
              {subtotal !== null && (
                <div className={styles.row}>
                  <span>{t('cart.subtotal')}</span>
                  <span>{money(subtotal)}</span>
                </div>
              )}
              {discountTotal > 0 && (
                <div className={styles.row}>
                  <span>{t('cart.discount')}</span>
                  <span>{money(discountTotal)}</span>
                </div>
              )}
              {deliveryFee !== null && (
                <div className={styles.row}>
                  <span>{t('cart.delivery')}</span>
                  <span>{money(deliveryFee)}</span>
                </div>
              )}
              {total !== null && (
                <div className={`${styles.row} ${styles.grand}`}>
                  <span>{t('cart.total')}</span>
                  <span>{money(total)}</span>
                </div>
              )}
            </div>
            <CheckoutAmountNotice limit={amountLimit} />
          </>
        )}
      </div>
      {!isEmpty && <StoreStatusNotice />}
      {!isEmpty && (
        <FixedCta>
          <Button
            variant="green"
            full
            disabled={!canCheckout || amountLimit.isBlocked}
            onClick={() => navigate(SCREENS.CHECKOUT)}
          >
            {canCheckout ? t('cart.checkout') : t('storeStatus.closedCheckout')}
          </Button>
        </FixedCta>
      )}
    </Screen>
  );
}
