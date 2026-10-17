// Intégration Astro : version store (PUBLIC_DISTRIBUTION=play).
// Après le build, supprime du dossier de sortie les pages torrent / indexers / téléchargements
// (liste alignée sur STORE_BLOCKED_ROUTE_PREFIXES dans src/lib/distribution.ts) et remplace
// /torrents par une redirection vers /media (fiche média de la bibliothèque).
// Sans PUBLIC_DISTRIBUTION=play, cette intégration ne fait rien.
import { existsSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';

export const STORE_BLOCKED_ROUTES = [
  'torrents',
  'downloads',
  'search',
  'discover',
  'demandes',
  'requests',
  'demo',
  'features',
  'installation',
  'disclaimer',
  'settings/indexers',
  'settings/indexer-definitions',
  'settings/library-indexer',
  'settings/sync',
  'settings/librqbit',
  'settings/ratio',
  'settings/uploads',
  'settings/requests-admin',
  'settings/blacklist',
  'settings/discover-sliders',
  'settings/content',
  'settings/downloads',
  'settings/discovery',
  'settings/diagnostics',
  'settings/audit',
];

export function getDistribution() {
  const fromProcess = (process.env.PUBLIC_DISTRIBUTION || '').trim().toLowerCase();
  if (fromProcess) return fromProcess;
  try {
    const env = loadEnv(process.env.NODE_ENV === 'development' ? 'development' : 'production', process.cwd(), 'PUBLIC_');
    return (env.PUBLIC_DISTRIBUTION || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

const REDIRECT_TO_MEDIA = `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><script>location.replace('/media'+location.search+location.hash)</script></head><body></body></html>`;

export function storeDistribution() {
  return {
    name: 'popcornn-store-distribution',
    hooks: {
      'astro:build:done': ({ dir, logger }) => {
        if (getDistribution() !== 'play') return;
        const outDir = fileURLToPath(dir);
        const removed = [];
        for (const route of STORE_BLOCKED_ROUTES) {
          for (const candidate of [join(outDir, route), join(outDir, `${route}.html`)]) {
            if (existsSync(candidate)) {
              rmSync(candidate, { recursive: true, force: true });
              removed.push(candidate.slice(outDir.length));
            }
          }
        }
        mkdirSync(join(outDir, 'torrents'), { recursive: true });
        writeFileSync(join(outDir, 'torrents', 'index.html'), REDIRECT_TO_MEDIA);
        logger.info(`PUBLIC_DISTRIBUTION=play : ${removed.length} routes torrent supprimées du build (${removed.join(', ')})`);
      },
    },
  };
}
