import Script from 'next/script';
import './globals.css';

export const metadata = {
  title: 'سفرة — اطلب أكلك',
  description: 'أكل طازة يوصلك بسرعة',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }) {
  return (
    /* suppressHydrationWarning: the Telegram SDK sets --tg-viewport-* CSS
       vars on <html>, and browser extensions add attributes to <body>,
       both before React hydrates. Attribute-only suppression, one level
       deep — safe and intended for exactly this case. */
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap"
        />
      </head>
      <body suppressHydrationWarning>
        {/* Telegram Mini App SDK — must be present before the app boots */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
