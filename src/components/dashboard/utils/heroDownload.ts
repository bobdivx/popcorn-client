import { serverApi } from '../../../lib/client/server-api';
import type { ContentItem } from '../../../lib/client/types';
import type { MediaDetailPageProps } from '../../torrents/MediaDetailPage/types';

type Torrent = MediaDetailPageProps['torrent'];

function normalizeSeedCount(t: any): number {
  return Number(t?.seedCount ?? t?.seed_count ?? 0) || 0;
}

function parseGenres(raw: any): string[] | null {
  if (!raw) return null;
  try {
    if (typeof raw === 'string') return JSON.parse(raw);
    if (Array.isArray(raw)) return raw;
  } catch {
    return null;
  }
  return null;
}

function parseQuality(raw: any): any | null {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeVariantToTorrent(variant: any): Torrent {
  const qualityObj = parseQuality(variant.quality);
  const infoHash = variant.info_hash || variant.infoHash || null;
  return {
    id: variant.id || '',
    slug: variant.slug || variant.id || null,
    infoHash,
    name: variant.name || '',
    cleanTitle: variant.clean_title || variant.cleanTitle || null,
    description: variant.description || null,
    category: variant.category || null,
    imageUrl: variant.poster_url || variant.posterUrl || variant.image_url || variant.imageUrl || null,
    heroImageUrl: variant.hero_image_url || variant.heroImageUrl || null,
    trailerKey: variant.trailer_key || variant.trailerKey || null,
    fileSize: Number(variant.file_size ?? variant.fileSize ?? 0) || 0,
    seedCount: Number(variant.seed_count ?? variant.seedCount ?? 0) || 0,
    leechCount: Number(variant.leech_count ?? variant.leechCount ?? 0) || 0,
    _externalLink: variant._externalLink || variant.external_link || null,
    _externalMagnetUri: variant._externalMagnetUri || variant.external_magnet_uri || null,
    _guid: variant._guid || null,
    indexerId: variant.indexer_id || variant.indexerId || null,
    indexerName: variant.indexer_name || variant.indexerName || null,
    language: variant.language || null,
    format: variant.format || variant.source_format || null,
    codec: variant.codec || variant.video_codec || null,
    quality: {
      resolution: variant.resolution || qualityObj?.resolution || null,
      source: variant.source_format || variant.format || qualityObj?.source || null,
      codec: variant.video_codec || variant.codec || qualityObj?.codec || null,
      audio: variant.audio_codec || qualityObj?.audio || null,
      language: variant.language || qualityObj?.language || null,
      full: qualityObj?.full || variant.quality || null,
    },
    synopsis: variant.synopsis || null,
    releaseDate: variant.release_date || variant.releaseDate || null,
    genres: parseGenres(variant.genres),
    voteAverage: variant.vote_average || variant.voteAverage || null,
    runtime: variant.runtime || null,
    tmdbId: variant.tmdb_id || variant.tmdbId || null,
    tmdbType: variant.tmdb_type || variant.tmdbType || null,
    clientState: variant.client_state || variant.clientState || null,
    clientProgress: variant.client_progress || variant.clientProgress || null,
    downloadPath: variant.download_path || variant.downloadPath || null,
  };
}

function pickBestTorrentFromPayload(payload: any): Torrent | null {
  let data = payload?.data;
  if (data && data.success && data.data) data = data.data;

  const torrents =
    payload?.torrents ??
    data?.torrents ??
    data?.variants ??
    data?.items ??
    data;

  if (Array.isArray(torrents) && torrents.length > 0) {
    const best = torrents.slice().sort((a: any, b: any) => normalizeSeedCount(b) - normalizeSeedCount(a))[0];
    return normalizeVariantToTorrent(best);
  }

  if (torrents && typeof torrents === 'object' && (torrents.infoHash || torrents.info_hash || torrents.id)) {
    return normalizeVariantToTorrent(torrents);
  }

  return null;
}

function buildTorrentFromContentItem(item: ContentItem): Torrent | null {
  if (!item.infoHash) return null;
  return {
    id: item.id,
    slug: item.id,
    infoHash: item.infoHash,
    name: item.title,
    cleanTitle: item.title,
    description: item.overview ?? null,
    category: null,
    imageUrl: item.poster ?? null,
    heroImageUrl: item.backdrop ?? null,
    trailerKey: null,
    fileSize: item.fileSize ?? 0,
    seedCount: item.seeds ?? 0,
    leechCount: item.peers ?? 0,
    _externalLink: null,
    _externalMagnetUri: null,
    _guid: null,
    indexerId: null,
    indexerName: null,
    language: null,
    format: null,
    codec: item.codec ?? null,
    quality: item.quality
      ? {
          resolution: item.quality,
          source: null,
          codec: item.codec ?? null,
          audio: null,
          language: null,
          full: item.quality,
        }
      : {
          resolution: null,
          source: null,
          codec: item.codec ?? null,
          audio: null,
          language: null,
          full: null,
        },
    synopsis: item.overview ?? null,
    releaseDate: item.releaseDate ?? null,
    genres: item.genres ?? null,
    voteAverage: item.rating ?? null,
    runtime: null,
    tmdbId: item.tmdbId ?? null,
    tmdbType: item.type,
    clientState: null,
    clientProgress: null,
    downloadPath: null,
  };
}

export async function resolveHeroTorrent(item: ContentItem): Promise<Torrent | null> {
  const fromInfoHash = buildTorrentFromContentItem(item);
  if (fromInfoHash) return fromInfoHash;

  if (item.id && !item.id.startsWith('tmdb-')) {
    const groupRes = await serverApi.getTorrentGroup(item.id);
    if (groupRes.success) {
      const torrent = pickBestTorrentFromPayload(groupRes);
      if (torrent) return torrent;
    }
  }

  if (item.tmdbId) {
    const tmdbRes = await serverApi.getTorrentGroupByTmdbId(item.tmdbId, item.title);
    if (tmdbRes.success) {
      const torrent = pickBestTorrentFromPayload(tmdbRes);
      if (torrent) return torrent;
    }
  }

  if (item.id) {
    const byIdRes = await serverApi.getTorrentById(item.id);
    if (byIdRes.success && byIdRes.data) {
      return normalizeVariantToTorrent(byIdRes.data);
    }
  }

  return null;
}
