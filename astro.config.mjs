import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import path from 'path';
import { fileURLToPath } from 'url';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration pour le développement web avec routes API
// Pour le build Tauri, utiliser astro.config.tauri.mjs (mode static)
// https://astro.build/config
export default defineConfig({
  integrations: [
    preact(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  // Mode server pour permettre les routes API (nécessaire pour /api/v1/*)
  // En mode développement web, on a besoin des routes serveur pour les proxies
  output: 'server',
  logLevel: 'info',
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  vite: {
    plugins: [
      nodePolyfills({
        // Polyfills minimaux pour le client Astro
        // Note: crypto, fs, path sont stubés via alias pour éviter les erreurs dans Tauri
        include: [
          'process',
        ],
        globals: {
          process: true,
        },
        // Exclure les modules qui sont stubés
        exclude: ['crypto', 'fs', 'path'],
      }),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      // Ignorer les modules Tauri en mode dev/web
      // Stubs pour les modules Node.js (utilisés uniquement dans les routes API qui sont exclues du build Tauri)
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@tauri-apps/plugin-dialog': path.resolve(__dirname, 'src/lib/stubs/tauri-dialog.ts'),
        '@tauri-apps/api': path.resolve(__dirname, 'src/lib/stubs/tauri-api.ts'),
        // Stubs pour éviter les erreurs d'import dans Tauri (les routes API sont exclues du build)
        'crypto': path.resolve(__dirname, 'src/lib/stubs/node-crypto.ts'),
        'fs': path.resolve(__dirname, 'src/lib/stubs/node-fs.ts'),
        'path': path.resolve(__dirname, 'src/lib/stubs/node-path.ts'),
      },
    },
    // Exclure explicitement les routes API si elles existent encore
    server: {
      fs: {
        strict: false,
      },
    },
    build: {
      rollupOptions: {
        // Ne pas externaliser fs - utiliser le stub à la place
        external: [],
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      exclude: ['@tauri-apps/plugin-dialog', '@tauri-apps/api'],
      include: [
        'process',
      ],
      esbuildOptions: {
        // S'assurer que les polyfills sont traités correctement
        target: 'es2020',
      },
    },
    define: {
      global: 'globalThis',
      'process.env': '{}',
      'process.browser': 'true',
    },
  },
});