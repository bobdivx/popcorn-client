import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';

const require = createRequire(import.meta.url);

function resolvePrefreshEntry(name) {
  const pkg = `@prefresh/${name}`;

  try {
    return require.resolve(pkg);
  } catch {
    // Dépendance transitive : résoudre à côté de @prefresh/vite
    try {
      const vitePkgJson = require.resolve('@prefresh/vite/package.json');
      const scopeDir = dirname(dirname(vitePkgJson));
      const candidate = join(scopeDir, name, 'src', 'index.js');
      if (existsSync(candidate)) return candidate;
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Sous Vite 7 / Astro 6, @prefresh/vite appelle this.resolve('@prefresh/core')
 * qui peut renvoyer null dans le conteneur client → crash HMR sur les .tsx.
 */
export function prefreshResolveFix() {
  const prefreshCore = resolvePrefreshEntry('core');
  const prefreshUtils = resolvePrefreshEntry('utils');

  if (!prefreshCore || !prefreshUtils) {
    return { name: 'prefresh-resolve-fix-noop' };
  }

  return {
    name: 'prefresh-resolve-fix',
    enforce: 'pre',
    apply: 'serve',
    resolveId: {
      filter: { id: /^@prefresh\/(core|utils)$/ },
      handler(id) {
        if (id === '@prefresh/core') return prefreshCore;
        if (id === '@prefresh/utils') return prefreshUtils;
      },
    },
  };
}

export function prefreshResolveAlias() {
  const prefreshCore = resolvePrefreshEntry('core');
  const prefreshUtils = resolvePrefreshEntry('utils');

  if (!prefreshCore || !prefreshUtils) return {};

  return {
    '@prefresh/core': prefreshCore,
    '@prefresh/utils': prefreshUtils,
  };
}
