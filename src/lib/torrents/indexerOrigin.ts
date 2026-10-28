/**
 * Indexer d'origine d'un torrent ajouté, transmis au serveur par les en-têtes `X-Indexer-*`.
 *
 * Le serveur le relaie au module « ratio » (règles de partage par indexer : ratio minimum,
 * durée de seed). Les en-têtes ne partent que si le serveur annonce la capacité `ratio`
 * (`features.ratio === true`) : un serveur qui ne la connaît pas ne les autorise pas en CORS,
 * et l'ajout du torrent échouerait. Sans indexer connu, aucun en-tête n'est envoyé.
 * Rien n'est envoyé aux trackers : ces valeurs restent entre le client et le serveur.
 */

/** Capacités minimales lues ici (sous-ensemble de `ServerCapabilities`). */
export interface RatioCapabilitiesLike {
  legacy?: boolean;
  features?: Record<string, boolean | undefined> | null;
}

/**
 * Vrai seulement si le serveur annonce explicitement un module ratio actif. Capacités inconnues,
 * serveur ancien ou clé absente : faux (aucun en-tête, comportement historique).
 */
export function serverAcceptsIndexerOrigin(caps: RatioCapabilitiesLike | null | undefined): boolean {
  return !!caps && !caps.legacy && caps.features?.ratio === true;
}

export interface IndexerOrigin {
  indexerId: string;
  indexerName?: string | null;
  /** `minimumratio` Torznab annoncé par l'indexer. */
  minimumRatio?: number | null;
  /** `MinimumSeedTime` Torznab (secondes) annoncé par l'indexer. */
  minimumSeedTime?: number | null;
}

export interface IndexerOriginLike {
  indexerId?: string | number | null;
  indexer_id?: string | number | null;
  indexerName?: string | null;
  indexer_name?: string | null;
  minimumRatio?: number | string | null;
  minimum_ratio?: number | string | null;
  minimumSeedTime?: number | string | null;
  minimum_seed_time?: number | string | null;
}

/** Longueur maximale acceptée par le serveur pour un en-tête `X-Indexer-*`. */
export const MAX_ORIGIN_HEADER_LEN = 200;

/**
 * Valeur d'en-tête sûre : ASCII imprimable uniquement (fetch refuse les autres caractères et le
 * serveur ne lit que l'ASCII visible), espaces normalisés, tronquée à 200 caractères.
 */
function headerValue(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v)
    .replace(/[^\x20-\x7e]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ORIGIN_HEADER_LEN)
    .trim();
  return s.length > 0 ? s : null;
}

function finiteNonNegative(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Origine d'un torrent (variante, résultat d'indexer…) ; `null` sans identifiant d'indexer. */
export function buildIndexerOrigin(t: IndexerOriginLike | null | undefined): IndexerOrigin | null {
  if (!t) return null;
  const id = headerValue(t.indexerId ?? t.indexer_id);
  if (!id) return null;
  const seed = finiteNonNegative(t.minimumSeedTime ?? t.minimum_seed_time);
  return {
    indexerId: id,
    indexerName: headerValue(t.indexerName ?? t.indexer_name),
    minimumRatio: finiteNonNegative(t.minimumRatio ?? t.minimum_ratio),
    minimumSeedTime: seed != null ? Math.floor(seed) : null,
  };
}

/** En-têtes `X-Indexer-*` pour l'ajout d'un torrent (objet vide sans origine). */
export function indexerOriginHeaders(origin: IndexerOrigin | null | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  const id = headerValue(origin?.indexerId);
  if (!origin || !id) return h;
  h['X-Indexer-Id'] = id;
  const name = headerValue(origin.indexerName);
  if (name) h['X-Indexer-Name'] = name;
  const ratio = finiteNonNegative(origin.minimumRatio);
  if (ratio != null) h['X-Indexer-Minimum-Ratio'] = String(ratio);
  const seed = finiteNonNegative(origin.minimumSeedTime);
  if (seed != null) h['X-Indexer-Minimum-Seed-Time'] = String(Math.floor(seed));
  return h;
}
