import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

// Configuration spécifique pour Tauri - mode static uniquement
// Cette config est utilisée uniquement pour le build Tauri
// Les routes API sont déplacées hors de src/pages avant le build
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
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  vite: {
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    // Pré-bundler les dépendances pour éviter 504 Outdated Optimize Dep
    // (Preact, qrcode/html5-qrcode: setup wizard, hls.js: player)
    optimizeDeps: {
      include: [
        'preact',
        'preact/hooks',
        'preact/compat',
        'qrcode',
        'html5-qrcode',
        'hls.js',
      ],
      // Faire crawler les pages et le wizard setup pour découvrir qrcode au démarrage (évite 504 au premier chargement depuis une autre machine)
      entries: ['src/pages/**/*.astro', 'src/components/setup/**/*.tsx'],
    },
    server: {
      host: true, // Écouter sur 0.0.0.0 pour accès via IP (ex. 10.1.0.86:4326), évite "Failed to fetch dynamically imported module"
      allowedHosts: true, // Autoriser tout host (localhost, IP locale, etc.) pour éviter 504 sur les deps quand on accède via IP
      fs: {
        strict: false,
      },
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
