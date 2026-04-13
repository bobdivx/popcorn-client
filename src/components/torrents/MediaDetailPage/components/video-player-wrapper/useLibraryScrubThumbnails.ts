import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { serverApi } from '../../../../../lib/client/server-api';
import type { ScrubThumbnailsMeta } from '../../../../streaming/player-shared/types/scrubThumbnails';
import { normalizeScrubPath, scrubPathBaseName } from './scrubPathUtils';
import { shouldForceRegenerateScrub } from './scrubRegenPolicy';
import { mergeScrubMeta, metaFromApiPayload } from './scrubMetaMerge';

export interface UseLibraryScrubThumbnailsParams {
  visible: boolean;
  streamBackendUrl?: string | null;
  infoHash: string;
  hlsFilePath: string | null | undefined;
}

export function useLibraryScrubThumbnails({
  visible,
  streamBackendUrl,
  infoHash,
  hlsFilePath,
}: UseLibraryScrubThumbnailsParams) {
  const [scrubThumbnails, setScrubThumbnails] = useState<ScrubThumbnailsMeta | null>(null);
  const [scrubThumbnailsLoading, setScrubThumbnailsLoading] = useState(false);
  const scrubRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubThumbnailsRef = useRef(scrubThumbnails);
  const scrubMetaRef = useRef<{ localMediaId: string; torrentRel?: string } | null>(null);
  const scrubRegenInFlightRef = useRef(false);
  const scrubAutoRegenDoneRef = useRef(false);
  const [playerDurationHint, setPlayerDurationHint] = useState<number | null>(null);
  const playerDurationHintRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      scrubRetryTimeoutRef.current && clearTimeout(scrubRetryTimeoutRef.current);
      scrubRetryTimeoutRef.current = null;
    };
  }, []);

  useEffect(() => {
    scrubThumbnailsRef.current = scrubThumbnails;
  }, [scrubThumbnails]);

  useEffect(() => {
    setPlayerDurationHint(null);
    playerDurationHintRef.current = null;
    scrubMetaRef.current = null;
    scrubAutoRegenDoneRef.current = false;
  }, [infoHash, hlsFilePath]);

  useEffect(() => {
    if (!visible) {
      setScrubThumbnails(null);
      setScrubThumbnailsLoading(false);
      return;
    }
    if (streamBackendUrl?.trim()) {
      setScrubThumbnails(null);
      setScrubThumbnailsLoading(false);
      return;
    }

    const localIdFromInfoHash =
      typeof infoHash === 'string' && infoHash.startsWith('local_')
        ? infoHash.slice('local_'.length).trim()
        : '';
    if (!hlsFilePath || typeof hlsFilePath !== 'string') {
      if (!localIdFromInfoHash) {
        setScrubThumbnails(null);
        return;
      }
    }

    let cancelled = false;
    scrubRetryTimeoutRef.current && clearTimeout(scrubRetryTimeoutRef.current);
    scrubRetryTimeoutRef.current = null;

    const targetPath = hlsFilePath ? normalizeScrubPath(hlsFilePath) : '';
    const targetBase = hlsFilePath ? scrubPathBaseName(hlsFilePath) : '';
    const torrentRelForScrub =
      typeof hlsFilePath === 'string' && hlsFilePath.trim() ? hlsFilePath.trim() : undefined;

    const durationHintForApi = (): number | undefined => {
      const h = playerDurationHintRef.current;
      return typeof h === 'number' && h >= 60 ? h : undefined;
    };

    const run = async () => {
      try {
        let localMediaId = localIdFromInfoHash;
        if (!localMediaId && typeof infoHash === 'string' && infoHash.length >= 12 && !infoHash.startsWith('local_')) {
          try {
            const lm = await serverApi.findLocalMediaByInfoHash(infoHash);
            if ((lm as any)?.success && (lm as any)?.data?.id) {
              localMediaId = String((lm as any).data.id).trim();
            }
          } catch {
            // ignore
          }
        }
        if (!localMediaId) {
          const libraryMedia = await serverApi.getLibraryMedia();
          if ((libraryMedia as any)?.success) {
            const items = Array.isArray((libraryMedia as any)?.data) ? (libraryMedia as any).data : [];
            const match = items.find((m: any) => {
              const fp = String(m?.file_path ?? '');
              const fpNorm = normalizeScrubPath(fp);
              if (targetPath && fpNorm === targetPath) return true;
              if (targetBase && scrubPathBaseName(fp) === targetBase) return true;
              const fn = String(m?.file_name ?? '');
              if (targetBase && normalizeScrubPath(fn) === targetBase) return true;
              return false;
            });
            localMediaId = (match?.id ?? '').trim();
          }
        }
        if (!localMediaId && typeof infoHash === 'string' && infoHash.length === 40 && /^[a-fA-F0-9]+$/.test(infoHash)) {
          localMediaId = infoHash.trim().toLowerCase();
        }
        if (!localMediaId) return;

        scrubMetaRef.current = { localMediaId, torrentRel: torrentRelForScrub };

        const fetchMeta = async () => {
          const meta = await serverApi.getScrubThumbnailsMeta(localMediaId, {
            torrentRelativePath: torrentRelForScrub,
          });
          const ok = (meta as any)?.success === true;
          const data = (meta as any)?.data;
          if (!ok || !data) throw new Error('meta not ready');
          const next = metaFromApiPayload(data as Record<string, unknown>);
          if (!next) throw new Error('meta invalid');
          if (!cancelled) {
            setScrubThumbnails((prev) => mergeScrubMeta(prev, next));
            setScrubThumbnailsLoading(false);
          }
        };

        try {
          await fetchMeta();
          const meta = await serverApi
            .getScrubThumbnailsMeta(localMediaId, { torrentRelativePath: torrentRelForScrub })
            .catch(() => null);
          const data = (meta as any)?.data;
          const count = Number(data?.count ?? 0);
          const durationSeconds = Number(data?.duration_seconds ?? 0);
          const intervalSeconds = Number(data?.interval_seconds ?? 0);

          if (
            shouldForceRegenerateScrub({
              count,
              durationSeconds,
              intervalSeconds,
            })
          ) {
            // Ne pas vider le strip : sinon l’UI bascule sur les placeholders puis un count
            // partiel (2–4) remplace 8–9 vignettes ; on garde l’affichage jusqu’à progression réelle.
            if (!cancelled) setScrubThumbnailsLoading(true);
            await serverApi
              .generateScrubThumbnails(localMediaId, {
                force: true,
                torrentRelativePath: torrentRelForScrub,
                durationHintSeconds: durationHintForApi(),
              })
              .catch(() => {});
            throw new Error('forced_regen');
          }
          return;
        } catch (err) {
          const isForcedRegen = err instanceof Error && err.message === 'forced_regen';
          if (!cancelled && !isForcedRegen) setScrubThumbnailsLoading(true);
          if (!isForcedRegen) {
            await serverApi
              .generateScrubThumbnails(localMediaId, {
                torrentRelativePath: torrentRelForScrub,
                durationHintSeconds: durationHintForApi(),
              })
              .catch(() => {});
          }
          let attempts = 0;
          const poll = () => {
            if (cancelled) return;
            attempts += 1;
            fetchMeta().catch(() => {
              if (attempts >= 12) {
                setScrubThumbnailsLoading(false);
                return;
              }
              scrubRetryTimeoutRef.current = setTimeout(poll, 2000);
            });
          };
          scrubRetryTimeoutRef.current = setTimeout(poll, 1500);
        }
      } catch {
        if (!cancelled) setScrubThumbnailsLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [infoHash, hlsFilePath, streamBackendUrl, visible]);

  useEffect(() => {
    const d = playerDurationHint ?? 0;
    if (!d || d < 180 || !visible || streamBackendUrl?.trim()) return;
    const ctx = scrubMetaRef.current;
    if (!ctx?.localMediaId || scrubRegenInFlightRef.current || scrubAutoRegenDoneRef.current) return;
    const st = scrubThumbnailsRef.current;
    const expected = Math.min(2000, Math.ceil(d / 10));
    if (!st || st.count <= 0) return;
    if (st.count >= expected - 2) return;
    if (st.count * 10 >= d * 0.88) return;
    const interval = st.intervalSeconds && st.intervalSeconds > 0 ? st.intervalSeconds : 10;
    const approxCover = st.count * interval;
    if (approxCover >= d * 0.82) return;
    if (st.count >= 150) return;

    const t = window.setTimeout(() => {
      if (scrubRegenInFlightRef.current) return;
      scrubRegenInFlightRef.current = true;
      setScrubThumbnailsLoading(true);
      serverApi
        .generateScrubThumbnails(ctx.localMediaId, {
          force: true,
          torrentRelativePath: ctx.torrentRel,
          durationHintSeconds: d,
        })
        .then(async () => {
          await new Promise((r) => setTimeout(r, 2800));
          try {
            const meta = await serverApi.getScrubThumbnailsMeta(ctx.localMediaId, {
              torrentRelativePath: ctx.torrentRel,
            });
            const ok = (meta as any)?.success === true;
            const data = (meta as any)?.data;
            if (ok && data) {
              const next = metaFromApiPayload(data as Record<string, unknown>);
              if (next) setScrubThumbnails((prev) => mergeScrubMeta(prev, next));
            }
          } catch {
            /* ignore */
          }
        })
        .catch(() => {})
        .finally(() => {
          scrubRegenInFlightRef.current = false;
          setScrubThumbnailsLoading(false);
          scrubAutoRegenDoneRef.current = true;
        });
    }, 2200);

    return () => clearTimeout(t);
  }, [playerDurationHint, visible, streamBackendUrl, scrubThumbnails?.mediaId]);

  const reportPlaybackDuration = useCallback((duration: number) => {
    if (Number.isFinite(duration) && duration >= 45) {
      playerDurationHintRef.current = Math.max(playerDurationHintRef.current ?? 0, duration);
      setPlayerDurationHint((prev) => Math.max(prev ?? 0, duration));
    }
  }, []);

  return {
    scrubThumbnails,
    scrubThumbnailsLoading,
    reportPlaybackDuration,
  };
}
