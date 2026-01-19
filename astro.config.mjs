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
    // Exclure explicitement les routes API si elles existent encore
    server: {
      fs: {
        strict: false,
      },
      watch: {
        // Limiter le nombre de fichiers surveillés pour éviter "too many open files" sur Windows
        ignored: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.astro/**',
          '**/.git/**',
          '**/src-tauri/gen/**',
          '**/src-tauri/target/**',
          '**/docs-backup-temp/**',
        ],
        // Réduire la fréquence de scan
        interval: 1000,
        // Désactiver la surveillance récursive profonde pour certains dossiers
        usePolling: false,
      },
      // Limiter les connexions concurrentes
      hmr: {
        clientPort: 4326,
      },
    },
    build: {
      // Augmenter la limite des warnings de taille de chunks (HLS.js fait ~522 kB)
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        external: [
          // Les plugins Tauri ne sont disponibles que dans l'environnement Tauri
          // Ils doivent être externalisés lors du build statique
          '@tauri-apps/plugin-dialog',
          '@tauri-apps/api',
        ],
        output: {
          // Séparer HLS.js dans son propre chunk (il est déjà en lazy-load via import dynamique)
          manualChunks(id) {
            // Mettre HLS.js dans un chunk séparé si détecté
            if (id.includes('hls.js') || id.includes('hls')) {
              return 'hls';
            }
            // Séparer node_modules en chunks plus petits
            if (id.includes('node_modules')) {
              // Vendor chunks séparés pour les grandes libs
              if (id.includes('preact') || id.includes('preact-compat')) {
                return 'vendor-preact';
              }
              if (id.includes('lucide')) {
                return 'vendor-icons';
              }
              return 'vendor';
            }
          },
        },
      },
    },
  },
});
