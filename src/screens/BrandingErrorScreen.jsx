import { useTranslation } from 'react-i18next';
import { useBranding } from '../context/BrandingContext';

/*
|--------------------------------------------------------------------------
| Branding Error Screen
|--------------------------------------------------------------------------
| Shown when the branding endpoint fails. Kept intentionally neutral (no
| tenant colors — we don't have them) and offers a retry. This is the
| "sorry, we have an issue" state requested.
*/
export default function BrandingErrorScreen() {
  const { t } = useTranslation();
  const { reload, isLoading } = useBranding();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 18,
        padding: 32,
        textAlign: 'center',
        background: '#F7F2EA',
        color: '#22180E',
        fontFamily: "'Tajawal', system-ui, sans-serif",
      }}
    >
      <div style={{ fontSize: 56 }}>😔</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
        {t('brandingError.heading')}
      </h1>
      <p style={{ fontSize: 15, opacity: 0.7, maxWidth: 300, lineHeight: 1.6, margin: 0 }}>
        {t('brandingError.body')}
      </p>
      <button
        type="button"
        onClick={reload}
        disabled={isLoading}
        style={{
          marginTop: 8,
          padding: '12px 32px',
          border: 'none',
          borderRadius: 999,
          background: '#1E4D2B',
          color: '#fff',
          fontSize: 15,
          fontWeight: 700,
          cursor: 'pointer',
          opacity: isLoading ? 0.6 : 1,
          fontFamily: 'inherit',
        }}
      >
        {isLoading ? t('brandingError.retrying') : t('brandingError.retry')}
      </button>
    </div>
  );
}
