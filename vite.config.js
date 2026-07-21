import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

/*
|--------------------------------------------------------------------------
| Vite Configuration
|--------------------------------------------------------------------------
*/
/*
|--------------------------------------------------------------------------
| Root Tenants Registry Plugin
|--------------------------------------------------------------------------
| The source of truth for the tenant registry is `tenants.json` at the
| project root — easy to edit next to package.json without digging into
| public/. This plugin mirrors it into public/tenants.json so Vite still
| serves it at the site root (/tenants.json) at both dev and build time.
*/
function mirrorTenantsRegistry() {
  const rootFile = path.resolve('tenants.json');
  const publicFile = path.resolve('public/tenants.json');

  const copy = () => {
    if (!fs.existsSync(rootFile)) return;
    fs.mkdirSync(path.dirname(publicFile), { recursive: true });
    fs.copyFileSync(rootFile, publicFile);
  };

  return {
    name: 'mirror-tenants-registry',
    buildStart: copy,
    configureServer(server) {
      copy();
      server.watcher.add(rootFile);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) === rootFile) copy();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), mirrorTenantsRegistry()],
  server: {
    host: true, // expose on LAN so you can test via ngrok / Telegram
    port: 3000,
  },
});
