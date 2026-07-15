import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
|--------------------------------------------------------------------------
| Vite Configuration
|--------------------------------------------------------------------------
*/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true, // expose on LAN so you can test via ngrok / Telegram
    port: 3000,
  },
});
