import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Stamped into the bundle so the running app can say which build it is — the
// only reliable way to tell a real bug from a stale service-worker cache.
const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ');

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  plugins: [
    react(),
    /**
     * Kirukals installs as an app and runs with no network at all: the scripts,
     * the accounts and the community board are already local, so precaching the
     * build is the whole job. Only Google sign-in needs the internet — nothing
     * else in the app cares.
     */
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'],
      manifest: {
        name: 'Kirukals — screenplay editor',
        short_name: 'Kirukals',
        description:
          'Write screenplays with industry-standard formatting, page-accurate breaks and Final Draft or Fountain export. Works offline.',
        theme_color: '#0f1115',
        background_color: '#0f1115',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff,woff2}'],
        // Any address inside the app resolves to the shell, so reloading while
        // offline does not land on a browser error page.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
