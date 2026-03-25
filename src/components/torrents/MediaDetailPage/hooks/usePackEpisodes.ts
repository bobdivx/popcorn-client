import { useMemo } from 'preact/hooks';
import type { TorrentFile } from './useVideoFiles';
import type { TorrentListFileEntry } from '../../../../lib/client/server-api/media';

export type PackEpisodeKey =
  | { kind: 'file'; path: string }
  | { kind: 'preview'; index: number };

export interface PackEpisodeItem {
  key: PackEpisodeKey;
  season: number;
  episode: number;
  /** Libellé principal (streaming). */
  title: string;
  /** Sous-texte discret (souvent nom de fichier). */
  subtitle: string | null;
  /** Nom/chemin source (utile pour vignettes). */
  sourcePathOrName: string;
}

export interface PackEpisodesModel {
  seasons: number[];
  episodesBySeason: Map<number, PackEpisodeItem[]>;
}

function parseSeasonEpisodeFromName(name: string): { season: number; episode: number } | null {
  const m = name.match(/[Ss](\d{1,2})[.\s-]*[Ee](\d{1,2})|(\d{1,2})[xX](\d{1,2})/);
  if (!m) return null;
  const s = parseInt(m[1] ?? m[3] ?? '1', 10);
  const e = parseInt(m[2] ?? m[4] ?? '1', 10);
  if (Number.isNaN(s) || Number.isNaN(e)) return null;
  return { season: s, episode: e };
}

function fileBaseName(p: string): string {
  const norm = (p || '').replace(/\\/g, '/');
  const last = norm.split('/').pop() ?? norm;
  return last;
}

function buildStreamingTitle(season: number, episode: number): { title: string; subtitle: string } {
  // Netflix-like: titre simple + sous-texte S·E
  return {
    title: `Épisode ${episode}`,
    subtitle: `Saison ${season} · Épisode ${episode}`,
  };
}

export function usePackEpisodes(params: {
  packPreviewFiles: TorrentListFileEntry[] | null;
  videoFiles: TorrentFile[];
}): PackEpisodesModel | null {
  const { packPreviewFiles, videoFiles } = params;

  return useMemo(() => {
    const parsed: Array<
      | { kind: 'file'; season: number; episode: number; path: string; name: string }
      | { kind: 'preview'; season: number; episode: number; index: number; name: string }
    > = [];

    if (videoFiles && videoFiles.length > 1) {
      for (const f of videoFiles) {
        const name = f.name || f.path || '';
        const se = parseSeasonEpisodeFromName(name);
        if (!se) continue;
        parsed.push({
          kind: 'file',
          season: se.season,
          episode: se.episode,
          path: f.path,
          name: fileBaseName(name),
        });
      }
    } else if (packPreviewFiles && packPreviewFiles.length > 1) {
      for (let i = 0; i < packPreviewFiles.length; i++) {
        const entry = packPreviewFiles[i];
        const name = entry?.name || '';
        const se = parseSeasonEpisodeFromName(name);
        if (!se) continue;
        parsed.push({
          kind: 'preview',
          season: se.season,
          episode: se.episode,
          index: i,
          name: fileBaseName(name),
        });
      }
    }

    if (parsed.length === 0) return null;

    const bySeason = new Map<number, PackEpisodeItem[]>();
    for (const p of parsed) {
      const { title, subtitle } = buildStreamingTitle(p.season, p.episode);
      const item: PackEpisodeItem =
        p.kind === 'file'
          ? {
              key: { kind: 'file', path: p.path },
              season: p.season,
              episode: p.episode,
              title,
              subtitle: p.name || subtitle,
              sourcePathOrName: p.path || p.name,
            }
          : {
              key: { kind: 'preview', index: p.index },
              season: p.season,
              episode: p.episode,
              title,
              subtitle: p.name || subtitle,
              sourcePathOrName: p.name,
            };

      const list = bySeason.get(item.season) ?? [];
      list.push(item);
      bySeason.set(item.season, list);
    }

    for (const list of bySeason.values()) {
      list.sort((a, b) => a.episode - b.episode);
    }
    const seasons = Array.from(bySeason.keys()).sort((a, b) => a - b);

    return { seasons, episodesBySeason: bySeason };
  }, [packPreviewFiles, videoFiles]);
}

