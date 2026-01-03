import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import tailwind from '@astrojs/tailwind';
import vercel from '@astrojs/vercel/serverless';

// https://astro.build/config
export default defineConfig({
  integrations: [
    preact(),
    tailwind({
      applyBaseStyles: false,
    }),
  ],
  output: 'server',
  adapter: vercel(),
  logLevel: 'warn',
  build: {
    inlineStylesheets: 'auto',
    assets: '_assets',
  },
  server: {
    port: 4321,
    host: true,
  },
  vite: {
    resolve: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    },
    ssr: {
      noExternal: ['@libsql/client'],
      external: ['bcryptjs'],
    },
  },
});
