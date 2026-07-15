/*
|--------------------------------------------------------------------------
| Next.js Configuration
|--------------------------------------------------------------------------
| - turbopack.root pins the workspace root to this project (silences the
|   "multiple lockfiles" warning when a stray lockfile exists elsewhere).
| - The rewrite proxies /backend/* to the Laravel API using the
|   server-side API_BASE_URL variable, so the backend URL needs no public
|   prefix and the browser only talks to same-origin paths.
*/
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    root: projectRoot,
  },
  async rewrites() {
    const base = process.env.API_BASE_URL;
    if (!base) return [];
    return [{ source: '/backend/:path*', destination: `${base.replace(/\/$/, '')}/:path*` }];
  },
};

export default nextConfig;
