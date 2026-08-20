/**
 * ABR type Netflix pour un HLS live-transcodé : démarrer en 720p,
 * passer en 1080p seulement quand ce rung a assez d’avance sur la tête de lecture.
 */

export function playlistDurationSeconds(manifest: string): number {
  let total = 0;
  for (const line of manifest.split(/\r?\n/)) {
    if (!line.startsWith('#EXTINF:')) continue;
    const raw = line.slice('#EXTINF:'.length).split(',')[0];
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) total += n;
  }
  return total;
}

export function armHlsQualityLadder(
  hls: { levels?: Array<{ url?: string; uri?: string }>; autoLevelCapping: number; startLevel: number; loadLevel: number; nextLevel: number },
  video: { currentTime: number },
): () => void {
  let stopped = false;
  let timer: number | null = null;

  const highUrl = (): string | null => {
    const level = hls.levels?.[1];
    if (!level) return null;
    return level.url || level.uri || null;
  };

  const pinToLow = () => {
    hls.startLevel = 0;
    hls.autoLevelCapping = 0;
    hls.loadLevel = 0;
  };

  const tryPromote = async () => {
    if (stopped) return;
    const url = highUrl();
    if (!url) {
      schedule();
      return;
    }
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) {
        schedule();
        return;
      }
      const text = await res.text();
      const readyFor = playlistDurationSeconds(text);
      const need = Math.max(12, (video.currentTime || 0) + 10);
      if (readyFor >= need) {
        hls.autoLevelCapping = -1;
        hls.nextLevel = 1;
        return;
      }
    } catch {
      /* retry */
    }
    schedule();
  };

  const schedule = () => {
    if (stopped) return;
    timer = window.setTimeout(() => {
      void tryPromote();
    }, 2000);
  };

  pinToLow();
  schedule();

  return () => {
    stopped = true;
    if (timer != null) window.clearTimeout(timer);
  };
}

export function pinHlsToLowestLevel(hls: {
  levels?: unknown[];
  autoLevelCapping: number;
  currentLevel: number;
  startLevel: number;
}): boolean {
  if (!hls.levels || hls.levels.length < 2) return false;
  hls.autoLevelCapping = 0;
  hls.startLevel = 0;
  hls.currentLevel = 0;
  return true;
}
