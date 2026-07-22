/*
|--------------------------------------------------------------------------
| Branding Loader
|--------------------------------------------------------------------------
| Neutral, un-branded loading screen shown ONLY while the tenant theme is
| being fetched — matches the static pre-boot loader in index.html so the
| transition is seamless. Once branding is ready the real SplashScreen
| (in tenant colors) takes over. This is what prevents the green flash:
| we never render a themed screen until we HAVE the theme.
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
          'radial-gradient(130% 100% at 50% -10%, #2a5c3a 0%, #1E4D2B 55%, #143520 100%)',
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
              background: '#F2A93B',
              display: 'inline-block',
              animation: `pb-pulse 1s ease-in-out ${d}s infinite`,
            }}
          />
        ))}
      </div>
    </div>
  );
}
