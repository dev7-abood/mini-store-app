import { useTranslation } from 'react-i18next';
import { useCart } from '../context/CartContext';
import { useNavigation, SCREENS } from '../context/NavigationContext';
import { useMoney } from '../hooks/useMoney';
import Screen from '../components/ui/Screen';
import SubHeader from '../components/ui/SubHeader';
import CenterIllustration from '../components/ui/CenterIllustration';
import CartItem from '../components/CartItem';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';
import styles from './CartScreen.module.css';

/** Cart review screen with totals and checkout entry point. */
export default function CartScreen() {
  const { t } = useTranslation();
  const money = useMoney();
  const { entries, count, subtotal, deliveryFee, total } = useCart();
  const { navigate } = useNavigation();

  const isEmpty = count === 0;

  return (
    <Screen>
      <SubHeader title={t('cart.title')} />
      <div className={styles.pad}>
        {isEmpty ? (
          <CenterIllustration icon="🛒">{t('cart.empty')}</CenterIllustration>
        ) : (
          <>
            {entries.map(({ product, qty }) => (
              <CartItem key={product.id} product={product} qty={qty} />
            ))}
            <div className={styles.totals}>
              <div className={styles.row}>
                <span>{t('cart.subtotal')}</span>
                <span>{money(subtotal)}</span>
              </div>
              <div className={styles.row}>
                <span>{t('cart.delivery')}</span>
                <span>{money(deliveryFee)}</span>
              </div>
              <div className={`${styles.row} ${styles.grand}`}>
                <span>{t('cart.total')}</span>
                <span>{money(total)}</span>
              </div>
            </div>
          </>
        )}
      </div>
      {!isEmpty && (
        <FixedCta>
          <Button variant="green" full onClick={() => navigate(SCREENS.CHECKOUT)}>
            {t('cart.checkout')}
          </Button>
        </FixedCta>
      )}
    </Screen>
  );
}
