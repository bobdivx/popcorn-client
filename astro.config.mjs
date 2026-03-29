import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

/** Re-pré-bundle toutes les deps Vite au démarrage (lent) — utile si 504 Outdated Optimize Dep persiste après dev:clean. */
const viteOptimizeForce = process.env.VITE_OPTIMIZE_FORCE === '1';

// https://astro.build/config
export default defineConfig({
  integrations: [
    preact(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  // Mode static pour Tauri (pas de routes serveur, pas d'adapter)
  output: 'static',
  logLevel: 'info',
  // Éviter « Cross-site POST form submissions are forbidden » en dev/preview quand
  // l'origine (ex. localhost:4326) ne correspond pas au site (ex. localhost:8080 derrière nginx).
  security: { checkOrigin: false },
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  vite: {
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    // Pré-bundler les dépendances pour éviter 504 Outdated Optimize Dep
    // (Preact, lucide, qrcode/html5-qrcode, hls.js: player / MediaDetail)
    optimizeDeps: {
      force: viteOptimizeForce,
      include: [
        'preact',
        'preact/hooks',
        'preact/compat',
        'lucide-preact',
        'qrcode',
        'html5-qrcode',
        'hls.js',
      ],
      // Crawler pages + îlots lourds (détail média) pour découvrir la chaîne hls.js avant navigation
      entries: [
        'src/pages/**/*.astro',
        'src/components/setup/**/*.tsx',
        'src/components/torrents/MediaDetailPage/MediaDetailRoute.tsx',
        'src/components/torrents/MediaDetailPage/index.tsx',
        'src/components/discover/DiscoverMediaDetailRoute.tsx',
      ],
    },
    server: {
      host: true, // Écouter sur 0.0.0.0 pour accès via IP (ex. 10.1.0.86:4326), évite "Failed to fetch dynamically imported module"
      allowedHosts: true, // Autoriser tout host (localhost, IP locale, etc.) pour éviter 504 sur les deps quand on accède via IP
      // Précharger les modules SSR (ex. @astrojs/preact) pour éviter
      // "transport invoke timed out after 60000ms" au premier chargement
      warmup: {
        ssrFiles: ['node_modules/@astrojs/preact/server.js'],
      },
    },
    build: {
      rollupOptions: {
        external: [
          // Les plugins Tauri ne sont disponibles que dans l'environnement Tauri
          // Ils doivent être externalisés lors du build statique
          '@tauri-apps/plugin-dialog',
          '@tauri-apps/api',
        ],
      },
    },
  },
});
