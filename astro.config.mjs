import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import path from 'path';
import { fileURLToPath } from 'url';
import { nodePolyfills } from 'vite-plugin-node-polyfills';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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
    plugins: [
      nodePolyfills({
        // Inclure explicitement tous les polyfills nécessaires pour webtorrent
        include: [
          'events',
          'buffer',
          'util',
          'stream',
          'crypto',
          'process',
          'path',
          'os',
          'url',
          'string_decoder',
          'punycode',
          'querystring',
        ],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        // Utiliser protocolImports pour inclure automatiquement d'autres polyfills
        protocolImports: true,
      }),
    ],
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      // Ignorer les modules Tauri en mode dev/web
      alias: {
        '@tauri-apps/plugin-dialog': path.resolve(__dirname, 'src/lib/stubs/tauri-dialog.ts'),
        '@tauri-apps/api': path.resolve(__dirname, 'src/lib/stubs/tauri-api.ts'),
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
        // Ne pas externaliser - utiliser les alias à la place
      },
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
    optimizeDeps: {
      exclude: ['@tauri-apps/plugin-dialog', '@tauri-apps/api'],
      include: [
        'events',
        'buffer',
        'util',
        'stream',
        'crypto',
        'string_decoder',
        'readable-stream',
        'process',
      ],
      esbuildOptions: {
        // S'assurer que les polyfills sont traités correctement
        target: 'es2020',
      },
    },
    define: {
      global: 'globalThis',
      'process.env': {},
    },
  },
});