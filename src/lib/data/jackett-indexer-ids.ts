/**
 * Liste des IDs d'indexeurs Jackett (récupérés depuis GitHub).
 * Pour mettre à jour : node scripts/fetch-jackett-indexer-ids.mjs
 */
import payload from './jackett-indexer-ids.json';

const { ids, updatedAt, source } = payload as { ids: string[]; updatedAt: string; source: string };
export const jackettIndexerIds: string[] = ids;
export const jackettIndexerIdsUpdatedAt: string = updatedAt;
export const jackettIndexerIdsSource: string = source;
