/**
 * The plate logo mark. `variant="light"` uses the cream stroke for dark
 * backgrounds (top bar), the default is the full splash mark.
 */
export default function BrandLogo({ variant = 'full', size = 66 }) {
  if (variant === 'light') {
    return (
      <svg viewBox="0 0 64 64" fill="none" width={size} height={size} aria-hidden="true">
        <circle cx="32" cy="32" r="26" stroke="#FDF9F1" strokeWidth="5" />
        <circle cx="32" cy="32" r="13" fill="#F2A93B" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" fill="none" width={size} height={size} aria-hidden="true">
      <circle cx="32" cy="32" r="28" stroke="#1E4D2B" strokeWidth="4" />
      <circle cx="32" cy="32" r="16" fill="#F2A93B" />
      <path
        d="M32 22c4 4 4 8 0 12s-4 8 0 12"
        stroke="#1E4D2B"
        strokeWidth="3.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
