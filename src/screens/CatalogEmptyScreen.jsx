import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import { useBranding } from '../context/BrandingContext';
import Screen from '../components/ui/Screen';
import CenterIllustration from '../components/ui/CenterIllustration';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';

/*
|--------------------------------------------------------------------------
| Catalog Empty Screen
|--------------------------------------------------------------------------
| Shown when /front-data succeeds but the merchant has no products yet.
| Deliberately warm rather than alarming — nothing is broken, the menu
| just isn't published. Offers a refresh so the customer can check again
| without relaunching the app.
*/
export default function CatalogEmptyScreen() {
  const { t } = useTranslation();
  const { reload, isLoading } = useCatalog();
  const { branding } = useBranding();

  return (
    <Screen>
      <div style={{ paddingTop: '16vh' }}>
        <CenterIllustration icon="🍽️" heading={t('catalogEmpty.heading', { name: branding.name })}>
          {t('catalogEmpty.body')}
        </CenterIllustration>
      </div>
      <FixedCta>
        <Button variant="green" full onClick={reload} disabled={isLoading}>
          {isLoading ? t('catalogEmpty.refreshing') : t('catalogEmpty.refresh')}
        </Button>
      </FixedCta>
    </Screen>
  );
}
