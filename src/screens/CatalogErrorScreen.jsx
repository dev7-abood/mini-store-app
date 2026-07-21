import { useTranslation } from 'react-i18next';
import { useCatalog } from '../context/CatalogContext';
import Screen from '../components/ui/Screen';
import CenterIllustration from '../components/ui/CenterIllustration';
import FixedCta from '../components/ui/FixedCta';
import Button from '../components/ui/Button';

/**
 * Shown when a tenant backend is configured but /front-data failed or
 * returned no products. Tenant data only — the demo seed is never shown
 * in place of a real restaurant's menu.
 */
export default function CatalogErrorScreen() {
  const { t } = useTranslation();
  const { reload } = useCatalog();

  return (
    <Screen>
      <div style={{ paddingTop: '18vh' }}>
        <CenterIllustration icon="📡" heading={t('catalogError.heading')}>
          {t('catalogError.body')}
        </CenterIllustration>
      </div>
      <FixedCta>
        <Button variant="green" full onClick={reload}>
          {t('catalogError.retry')}
        </Button>
      </FixedCta>
    </Screen>
  );
}
