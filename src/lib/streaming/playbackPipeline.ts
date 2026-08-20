import { getBackendUrl } from '../backend-url';

export type PlaybackPipelinePhase =
  | 'waiting'
  | 'remuxing'
  | 'transcoding'
  | 'ready'
  | 'error';

export interface PlaybackPipelineStatus {
  file_id: string;
  phase: PlaybackPipelinePhase | string;
  mode: 'remux' | 'transcode' | string;
  ffmpeg_running: boolean;
  playlist_ready: boolean;
  is_complete: boolean;
  segment_count: number;
  expected_segments: number;
  video_duration: number;
  input_path?: string | null;
  last_error?: string | null;
  debug_path: string;
  encoding_hwaccel?: string | null;
  cuda_decode_available?: boolean;
  gpu_available?: boolean;
  min_playable_segments?: number;
  eta_playable_seconds?: number | null;
  generation_elapsed_seconds?: number | null;
}

export interface PlaybackPipelineLogs {
  file_id?: string | null;
  needles: string[];
  lines: string[];
}

export interface PlaybackPipelineQuery {
  path?: string | null;
  infoHash?: string | null;
  fileId?: string | null;
  baseUrl?: string | null;
}

function backendBase(baseUrl?: string | null): string {
  return (baseUrl || getBackendUrl() || '').replace(/\/$/, '');
}

export function playbackDebugUrl(query: PlaybackPipelineQuery & { fileId?: string | null }): string {
  const base = backendBase(query.baseUrl);
  const id = query.fileId || '';
  const params = new URLSearchParams();
  if (id) params.set('q', id);
  else if (query.path) params.set('path', query.path);
  if (query.infoHash) params.set('info_hash', query.infoHash);
  return `${base}/api/local/playback/debug?${params.toString()}`;
}

export async function fetchPlaybackStatus(
  query: PlaybackPipelineQuery,
): Promise<PlaybackPipelineStatus | null> {
  const base = backendBase(query.baseUrl);
  if (!base) return null;
  const params = new URLSearchParams();
  if (query.fileId) params.set('file_id', query.fileId);
  if (query.path) params.set('path', query.path.replace(/\/playlist\.m3u8$/i, ''));
  if (query.infoHash) params.set('info_hash', query.infoHash);
  if (![...params.keys()].length) return null;
  try {
    const res = await fetch(`${base}/api/local/playback/status?${params.toString()}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: PlaybackPipelineStatus };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function playbackLogsUrl(query: PlaybackPipelineQuery & { fileId?: string | null }): string {
  const base = backendBase(query.baseUrl);
  const params = new URLSearchParams();
  if (query.fileId) params.set('file_id', query.fileId);
  else if (query.path) params.set('path', query.path);
  if (query.infoHash) params.set('info_hash', query.infoHash);
  params.set('limit', '80');
  return `${base}/api/local/playback/logs?${params.toString()}`;
}

export async function fetchPlaybackLogs(
  query: PlaybackPipelineQuery,
): Promise<PlaybackPipelineLogs | null> {
  const base = backendBase(query.baseUrl);
  if (!base) return null;
  const params = new URLSearchParams();
  if (query.fileId) params.set('file_id', query.fileId);
  if (query.path) params.set('path', query.path.replace(/\/playlist\.m3u8$/i, ''));
  if (query.infoHash) params.set('info_hash', query.infoHash);
  params.set('limit', '80');
  if (![...params.keys()].some((k) => k !== 'limit')) return null;
  try {
    const res = await fetch(`${base}/api/local/playback/logs?${params.toString()}`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { success?: boolean; data?: PlaybackPipelineLogs };
    return json.data ?? null;
  } catch {
    return null;
  }
}

export function pipelineHeadline(status: PlaybackPipelineStatus | null, t: (k: string) => string): string {
  if (!status) return '';
  if (status.phase === 'error' || status.last_error) {
    return status.last_error || t('playback.phase.error');
  }
  if (status.mode === 'remux' || status.phase === 'remuxing') {
    return t('playback.hls.preparingRemux');
  }
  if (status.mode === 'transcode' || status.phase === 'transcoding') {
    return t('playback.hls.preparingTranscode');
  }
  if (status.playlist_ready) return t('playback.hls.playlistReady');
  return t('playback.hls.serverPreparing');
}
