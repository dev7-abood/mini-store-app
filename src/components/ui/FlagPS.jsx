/** Palestinian flag — inline SVG because the 🇵🇸 emoji renders as "PS"
    text on Windows browsers. */
export default function FlagPS({ width = 22 }) {
  return (
    <svg
      viewBox="0 0 24 16"
      width={width}
      height={(width * 16) / 24}
      style={{ borderRadius: 3, flexShrink: 0 }}
      aria-hidden="true"
    >
      <rect width="24" height="16" fill="#FFFFFF" />
      <rect width="24" height="5.33" fill="#000000" />
      <rect y="10.67" width="24" height="5.33" fill="#149954" />
      <path d="M0 0 L9.5 8 L0 16 Z" fill="#E4312B" />
      <rect width="24" height="16" fill="none" stroke="rgba(34,24,14,.12)" strokeWidth="1" />
    </svg>
  );
}
