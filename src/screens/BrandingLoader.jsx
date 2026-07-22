/*
|--------------------------------------------------------------------------
| Branding Loader
|--------------------------------------------------------------------------
| Loading screen shown while the full branding is fetched. Reads the CSS
| variables (--basil / --saffron) which are ALREADY seeded from the
| registry theme in tenants.json the instant the tenant resolves — so if
| the registry carries colors, this loader is tenant-colored with zero
| network wait. Falls back to the default سفرة palette when the registry
| has no theme.
*/
export default function BrandingLoader() {
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
        gap: 20,
        background:
          'radial-gradient(130% 100% at 50% -10%, ' +
          'color-mix(in srgb, var(--basil, #1E4D2B) 82%, #fff 18%) 0%, ' +
          'var(--basil, #1E4D2B) 55%, ' +
          'color-mix(in srgb, var(--basil, #1E4D2B) 72%, #000 28%) 100%)',
        fontFamily: "'Tajawal', system-ui, sans-serif",
      }}
    >
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)',
          display: 'grid',
          placeItems: 'center',
          animation: 'pb-float 2.6s ease-in-out infinite',
        }}
      >
        <span style={{ fontSize: 40 }}>🍽️</span>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 0.15, 0.3].map((d) => (
          <i
            key={d}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'var(--saffron, #F2A93B)',
              display: 'inline-block',
              animation: `pb-pulse 1s ease-in-out ${d}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
