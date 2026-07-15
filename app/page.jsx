'use client';

/*
|--------------------------------------------------------------------------
| Entry Page
|--------------------------------------------------------------------------
| The Mini App is fully client-side (Telegram SDK, haptics, browser state),
| so it's loaded with ssr:false — Next never tries to render it on the
| server, which keeps every `window` access safe.
*/
import dynamic from 'next/dynamic';

const SafraApp = dynamic(() => import('../src/App'), { ssr: false });

export default function Page() {
  return <SafraApp />;
}
