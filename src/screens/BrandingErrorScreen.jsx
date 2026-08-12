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
        gap: 'var(--space-4)',
        padding: 'var(--space-8)',
        textAlign: 'center',
        background: '#F7F2EA',
        color: '#22180E',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{ fontSize: 'var(--text-display)' }}>😔</div>
      <h1 style={{ fontSize: 'var(--text-title)', fontWeight: 'var(--font-bold)', lineHeight: 'var(--leading-tight)', margin: 0 }}>
        {t('brandingError.heading')}
      </h1>
      <p style={{ fontSize: 'var(--text-body)', fontWeight: 'var(--font-semibold)', opacity: 0.7, maxWidth: 300, lineHeight: 'var(--leading-relaxed)', margin: 0 }}>
        {t('brandingError.body')}
      </p>
      <button
        type="button"
        onClick={reload}
        disabled={isLoading}
        style={{
          marginTop: 'var(--space-2)',
          minHeight: 'var(--control-height)',
          padding: 'var(--space-3) var(--space-8)',
          border: 'none',
          borderRadius: 'var(--radius-pill)',
          background: '#1E4D2B',
          color: '#fff',
          fontSize: 'var(--text-control)',
          fontWeight: 'var(--font-bold)',
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
