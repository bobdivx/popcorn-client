/**
 * Récupère la liste de tous les indexeurs Jackett depuis le dépôt GitHub officiel.
 * Écrit le résultat dans src/lib/data/jackett-indexer-ids.json pour usage dans le client
 * (ex: autocomplete "Nom d'indexer Jackett" lors de l'ajout d'un indexer basé sur Jackett).
 *
 * Usage: node scripts/fetch-jackett-indexer-ids.mjs
 * Depuis la racine du projet popcorn-client.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = 'Jackett/Jackett';
const DEFINITIONS_PATH = 'src/Jackett.Common/Definitions';
const OUT_FILE = join(__dirname, '..', 'src', 'lib', 'data', 'jackett-indexer-ids.json');

async function fetchAllIndexerIds() {
  const url = `https://api.github.com/repos/${REPO}/contents/${DEFINITIONS_PATH}`;
  const res = await fetch(url, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  });
  if (!res.ok) {
    throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
  }
  const entries = await res.json();
  const ids = entries
    .filter((e) => e.type === 'file' && e.name.endsWith('.yml') && e.name !== 'schema.json')
    .map((e) => e.name.replace(/\.yml$/, ''))
    .sort((a, b) => a.localeCompare(b, 'en'));

  return ids;
}

async function main() {
  console.log('Récupération des indexeurs Jackett depuis GitHub...');
  const ids = await fetchAllIndexerIds();
  console.log(`${ids.length} indexeur(s) trouvé(s).`);

  const outDir = dirname(OUT_FILE);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  const payload = {
    source: `https://github.com/${REPO}/tree/master/${DEFINITIONS_PATH}`,
    updatedAt: new Date().toISOString(),
    count: ids.length,
    ids,
  };

  writeFileSync(OUT_FILE, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Écrit: ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
