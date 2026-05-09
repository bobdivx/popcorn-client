import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    restoreMocks: true,
    clearMocks: true,
    mockReset: true,
    /** Les specs Playwright (`tests/*.spec.ts`) passent par `npm run test:e2e`, pas Vitest */
    include: ['src/**/*.test.ts'],
  },
});

