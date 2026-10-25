/**
 * Recherche dans la bibliothèque du serveur (GET /library), entièrement côté client.
 *
 * Utilisée par la page Recherche quand le serveur n'a pas le module Indexers (mode « media
 * center ») et par l'onglet « Ma bibliothèque » sinon. Aucun endpoint dédié côté serveur :
 * on filtre la liste déjà chargée par l'accueil (cache client de `getLibrary`).
 *
 * Tolérante : insensible à la casse, aux accents et à la ponctuation (`.`/`_` des noms de
 * fichiers), préfixes de mots (« inter » → « Interstellar ») et une faute de frappe par mot
 * (deux pour les mots longs). Les épisodes sont retrouvés par le nom de leur fichier
 * (« S01E02 », « 1x02 ») et regroupés sous leur série.
 */

/** Champs de GET /library utiles à la recherche (sous-ensemble de `LibraryMedia`). */
export interface LibrarySearchSource {
  info_hash?: string | null;
  name: string;
  download_path?: string | null;
  slug?: string | null;
  category?: string | null;
  tmdb_id?: number | null;
  tmdb_type?: string | null;
  poster_url?: string | null;
  hero_image_url?: string | null;
  release_date?: string | null;
  exists?: boolean;
}

export interface LibrarySearchEpisode {
  /** Code affichable (« S01E02 »), ou `null` si le fichier ne porte pas de numéro reconnu. */
  code: string | null;
  /** Nom du fichier (sans dossier ni extension). */
  label: string;
}

export interface LibrarySearchHit<T extends LibrarySearchSource = LibrarySearchSource> {
  key: string;
  type: 'movie' | 'tv';
  title: string;
  year: number | null;
  /** Entrée représentative (affiche, lien vers la fiche). */
  item: T;
  /** Épisodes dont le nom de fichier correspond (séries, recherche « S01E02 » ou titre d'épisode). */
  episodes: LibrarySearchEpisode[];
  score: number;
}

/** Minuscules, sans accents, ponctuation → espaces. */
export function normalizeSearchText(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function words(s: string): string[] {
  const n = normalizeSearchText(s);
  return n ? n.split(' ') : [];
}

/** Distance d'édition bornée (retourne `max + 1` dès qu'elle est dépassée). */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Score d'un mot de la requête contre un mot du titre (0 = pas de correspondance). */
function tokenScore(token: string, word: string): number {
  if (word === token) return 4;
  if (word.startsWith(token)) return 3;
  if (token.length >= 3 && word.includes(token)) return 2;
  if (token.length >= 4 && !/^\d+$/.test(token)) {
    const max = token.length >= 8 ? 2 : 1;
    // Faute de frappe sur le mot entier, ou sur le début d'un mot plus long (saisie en cours).
    if (editDistance(token, word, max) <= max) return 1;
    if (word.length > token.length && editDistance(token, word.slice(0, token.length), max) <= max) return 1;
  }
  return 0;
}

/** Score d'une requête (mots normalisés) contre un texte ; 0 si un mot de la requête manque. */
function matchScore(queryTokens: string[], haystack: string[]): number {
  if (queryTokens.length === 0 || haystack.length === 0) return 0;
  let total = 0;
  for (const token of queryTokens) {
    let best = 0;
    for (const w of haystack) {
      const s = tokenScore(token, w);
      if (s > best) best = s;
      if (best === 4) break;
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}

const EPISODE_RE = /(?:^|[^a-z0-9])s(\d{1,2})[ ._-]?e(\d{1,3})(?![0-9])|(?:^|[^0-9])(\d{1,2})x(\d{2,3})(?![0-9])/i;

/** « S01E02 » depuis un nom de fichier, ou `null`. */
export function episodeCode(fileName: string): string | null {
  const m = EPISODE_RE.exec(fileName || '');
  if (!m) return null;
  const season = Number(m[1] ?? m[3]);
  const episode = Number(m[2] ?? m[4]);
  if (!Number.isFinite(season) || !Number.isFinite(episode)) return null;
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

/** Requête de type « s1e2 », « S01E02 » ou « 1x02 » → code normalisé. */
function queryEpisodeCode(query: string): string | null {
  const compact = (query || '').trim();
  const m = /^s(\d{1,2})\s*e(\d{1,3})$|^(\d{1,2})x(\d{2,3})$/i.exec(compact.replace(/\s+/g, ''));
  if (!m) return null;
  return `S${String(Number(m[1] ?? m[3])).padStart(2, '0')}E${String(Number(m[2] ?? m[4])).padStart(2, '0')}`;
}

function baseName(path: string | null | undefined): string {
  const p = (path || '').replace(/[\\/]+$/, '');
  const last = p.split(/[\\/]/).pop() || '';
  return last.replace(/\.[a-z0-9]{2,4}$/i, '');
}

export function librarySourceType(item: LibrarySearchSource): 'movie' | 'tv' {
  const c = (item.category || '').toUpperCase();
  const t = (item.tmdb_type || '').toLowerCase();
  return c === 'SERIES' || t === 'tv' || t === 'series' ? 'tv' : 'movie';
}

function yearOf(item: LibrarySearchSource): number | null {
  const y = Number((item.release_date || '').slice(0, 4));
  return Number.isFinite(y) && y > 1800 ? y : null;
}

/**
 * Recherche `query` dans la bibliothèque. Les titres (films, séries) passent avant les épisodes
 * trouvés seulement par le nom de fichier ; à score égal, ordre alphabétique.
 */
export function searchLibrary<T extends LibrarySearchSource>(
  items: readonly T[],
  query: string,
  options: { type?: 'all' | 'movie' | 'tv'; limit?: number } = {},
): LibrarySearchHit<T>[] {
  const tokens = words(query);
  if (tokens.length === 0) return [];
  const wantedCode = queryEpisodeCode(query);
  const typeFilter = options.type ?? 'all';
  const groups = new Map<string, LibrarySearchHit<T>>();

  for (const item of items) {
    if (!item || item.exists === false || !item.name) continue;
    const type = librarySourceType(item);
    if (typeFilter !== 'all' && type !== typeFilter) continue;
    const title = item.name;
    const year = yearOf(item);
    const titleWords = words(title);
    const slugWords = item.slug ? words(item.slug) : [];
    const file = baseName(item.download_path);
    const code = type === 'tv' ? episodeCode(file) || episodeCode(title) : null;

    let score = matchScore(tokens, year ? [...titleWords, String(year)] : titleWords) * 10;
    if (score === 0 && slugWords.length) score = matchScore(tokens, slugWords) * 8;
    if (score > 0) {
      const nq = normalizeSearchText(query);
      const nt = normalizeSearchText(title);
      if (nt === nq) score += 50;
      else if (nt.startsWith(nq)) score += 20;
    }

    // Épisodes : code « S01E02 » demandé, ou mots trouvés dans le nom du fichier.
    let episodeHit = false;
    if (type === 'tv' && file) {
      if (wantedCode && code === wantedCode) episodeHit = true;
      else if (score === 0) {
        const fileScore = matchScore(tokens, words(file));
        if (fileScore > 0) {
          score = fileScore * 5;
          episodeHit = true;
        }
      } else if (code && tokens.some((t) => t.toUpperCase() === code)) {
        episodeHit = true;
      }
      if (wantedCode && code === wantedCode && score === 0) score = 15;
    }
    if (score === 0) continue;

    const key = item.tmdb_id ? `${type}:${item.tmdb_id}` : `${type}:${normalizeSearchText(title)}`;
    const existing = groups.get(key);
    const episode = episodeHit ? { code, label: file || title } : null;
    if (!existing) {
      groups.set(key, { key, type, title, year, item, episodes: episode ? [episode] : [], score });
      continue;
    }
    if (score > existing.score) existing.score = score;
    if (!existing.item.poster_url && item.poster_url) existing.item = item;
    // Titre de la série plutôt que celui d'un fichier d'épisode.
    if (episodeCode(existing.title) && !episodeCode(title)) existing.title = title;
    if (existing.year == null && year != null) existing.year = year;
    if (episode && !existing.episodes.some((e) => e.label === episode.label)) existing.episodes.push(episode);
  }

  const out = Array.from(groups.values());
  for (const hit of out) {
    hit.episodes.sort((a, b) => (a.code || a.label).localeCompare(b.code || b.label));
  }
  out.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return typeof options.limit === 'number' ? out.slice(0, options.limit) : out;
}
