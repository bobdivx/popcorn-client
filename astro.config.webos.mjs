import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';

// Configuration spécifique pour WebOS TV
// Regrouper tous les modules dans un seul chunk pour compatibilité webOS
export default defineConfig({
  integrations: [
    preact({
      compat: true,
    }),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  // Mode static pour WebOS
  output: 'static',
  // Base relative pour file://
  base: './',
  // Désactiver le trailing slash
  trailingSlash: 'never',
  build: {
    assets: '_assets',
    // Inliner tous les CSS
    inlineStylesheets: 'always',
    format: 'file',
  },
  vite: {
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    build: {
      // Désactiver le code-splitting CSS
      cssCodeSplit: false,
      // Target ES2017 pour compatibilité webOS (supporte async/await)
      target: 'es2017',
      // Augmenter la limite
      chunkSizeWarningLimit: 3000,
      rollupOptions: {
        output: {
          // Regrouper tous les modules dans un seul chunk "vendor"
          manualChunks: (id) => {
            // Tout va dans le même chunk
            return 'app';
          },
          // Noms des fichiers sans hash pour cohérence
          assetFileNames: '_assets/[name][extname]',
          chunkFileNames: '_assets/[name].js',
          entryFileNames: '_assets/[name].js',
        },
        external: [
          '@tauri-apps/plugin-dialog',
          '@tauri-apps/api',
          '@tauri-apps/plugin-http',
          '@tauri-apps/plugin-shell',
          '@tauri-apps/plugin-process',
          '@tauri-apps/plugin-os',
          '@tauri-apps/plugin-fs',
        ],
      },
    },
    define: {
      'import.meta.env.WEBOS': 'true',
    },
    server: {
      fs: {
        strict: false,
      },
    },
  },
});
