import { useEffect, useState } from 'preact/hooks';
import {
  fetchPlaybackStatus,
  playbackDebugUrl,
  type PlaybackPipelineQuery,
  type PlaybackPipelineStatus,
} from '../../../../lib/streaming/playbackPipeline';

export function usePlaybackPipelineStatus(
  query: PlaybackPipelineQuery,
  enabled: boolean,
): {
  status: PlaybackPipelineStatus | null;
  debugUrl: string;
} {
  const [status, setStatus] = useState<PlaybackPipelineStatus | null>(null);
  const path = query.path || '';
  const infoHash = query.infoHash || '';
  const fileId = query.fileId || status?.file_id || '';
  const baseUrl = query.baseUrl || '';

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const poll = async () => {
      const next = await fetchPlaybackStatus({
        path: path || null,
        infoHash: infoHash || null,
        fileId: fileId || null,
        baseUrl: baseUrl || null,
      });
      if (!cancelled && next) setStatus(next);
    };
    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, path, infoHash, fileId, baseUrl]);

  return {
    status,
    debugUrl: playbackDebugUrl({
      path: path || null,
      infoHash: infoHash || null,
      fileId: status?.file_id || fileId || null,
      baseUrl: baseUrl || null,
    }),
  };
}
