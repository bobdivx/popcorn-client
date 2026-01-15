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
