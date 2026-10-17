// Intégration Astro : version store (PUBLIC_DISTRIBUTION=play).
// Après le build, supprime du dossier de sortie les pages torrent / indexers / téléchargements
// (liste alignée sur STORE_BLOCKED_ROUTE_PREFIXES dans src/lib/distribution.ts) et remplace
// /torrents par une redirection vers /media (fiche média de la bibliothèque).
// Sans PUBLIC_DISTRIBUTION=play, cette intégration ne fait rien.
import { existsSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
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
    // `astro build --mode <mode>` charge aussi .env.<mode> (ex. .env.play pour un test local).
    const argv = process.argv;
    const modeIdx = argv.indexOf('--mode');
    const mode =
      modeIdx >= 0 && argv[modeIdx + 1]
        ? argv[modeIdx + 1]
        : process.env.NODE_ENV === 'development'
          ? 'development'
          : 'production';
    const env = loadEnv(mode, process.cwd(), 'PUBLIC_');
    return (env.PUBLIC_DISTRIBUTION || '').trim().toLowerCase();
  } catch {
    return '';
  }
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/**
 * Supprime les chunks JS qui ne sont plus référencés par aucune page restante (code des pages
 * torrent / indexers / téléchargements supprimées). Conservateur : un chunk est gardé dès que son
 * nom de fichier apparaît dans une page HTML ou dans un chunk déjà atteint (imports statiques,
 * import() dynamiques, listes de preload Vite).
 */
function pruneUnreachableChunks(outDir) {
  const files = walk(outDir);
  const html = files.filter((f) => f.endsWith('.html'));
  const chunks = files.filter((f) => /\.m?js$/.test(f));
  const reached = new Set();
  let frontier = html.map((f) => readFileSync(f, 'utf8'));
  while (frontier.length) {
    const text = frontier.join('\n');
    const next = [];
    for (const chunk of chunks) {
      if (reached.has(chunk)) continue;
      if (text.includes(basename(chunk))) {
        reached.add(chunk);
        next.push(readFileSync(chunk, 'utf8'));
      }
    }
    frontier = next;
  }
  const removed = [];
  for (const chunk of chunks) {
    if (!reached.has(chunk) && chunk.includes(`${join(outDir, '_assets')}`)) {
      rmSync(chunk, { force: true });
      removed.push(basename(chunk));
    }
  }
  return removed;
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
        const prunedChunks = pruneUnreachableChunks(outDir);
        logger.info(
          `PUBLIC_DISTRIBUTION=play : ${prunedChunks.length} chunks JS orphelins supprimés (${prunedChunks.join(', ')})`
        );
      },
    },
  };
}
