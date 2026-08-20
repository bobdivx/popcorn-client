import { useEffect, useRef, useState } from 'preact/hooks';
import {
  fetchPlaybackLogs,
  fetchPlaybackStatus,
  type PlaybackPipelineQuery,
  type PlaybackPipelineStatus,
} from '../../../../lib/streaming/playbackPipeline';
import {
  getNetworkPlaybackProfile,
  subscribeNetworkPlaybackProfile,
  type NetworkPlaybackProfile,
} from '../../../../lib/streaming/networkPlaybackProfile';
import { getBufferAheadSeconds } from '../utils/bufferMetrics';
import { PLAYBACK_EVENT_PREFIX, type PlaybackEventDetail } from '../../player-core/observability/playbackEvents';

export interface PlaybackLiveEvent {
  id: number;
  at: number;
  message: string;
}

export interface PlaybackLiveTraceState {
  status: PlaybackPipelineStatus | null;
  logLines: string[];
  events: PlaybackLiveEvent[];
  stallCount: number;
  waitingCount: number;
  bufferAheadSec: number;
  bandwidthMbps: number | null;
  network: NetworkPlaybackProfile;
  startedAt: number;
}

const MAX_EVENTS = 40;

export function usePlaybackLiveTrace(
  query: PlaybackPipelineQuery,
  enabled: boolean,
  videoRef: { current: HTMLVideoElement | null },
  hlsRef: { current: { bandwidthEstimate?: number } | null },
  isRemoteStream = false,
): PlaybackLiveTraceState {
  const [status, setStatus] = useState<PlaybackPipelineStatus | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [events, setEvents] = useState<PlaybackLiveEvent[]>([]);
  const [stallCount, setStallCount] = useState(0);
  const [waitingCount, setWaitingCount] = useState(0);
  const [bufferAheadSec, setBufferAheadSec] = useState(0);
  const [bandwidthMbps, setBandwidthMbps] = useState<number | null>(null);
  const [network, setNetwork] = useState(() => getNetworkPlaybackProfile(isRemoteStream));
  const startedAtRef = useRef(Date.now());
  const eventIdRef = useRef(0);
  const fileId = query.fileId || status?.file_id || '';
  const path = query.path || '';
  const infoHash = query.infoHash || '';
  const baseUrl = query.baseUrl || '';

  const pushEvent = (message: string) => {
    eventIdRef.current += 1;
    const item: PlaybackLiveEvent = { id: eventIdRef.current, at: Date.now(), message };
    setEvents((prev) => [...prev.slice(-(MAX_EVENTS - 1)), item]);
  };

  useEffect(() => {
    startedAtRef.current = Date.now();
    setStallCount(0);
    setWaitingCount(0);
    setEvents([]);
    pushEvent('Lecture lancée');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, infoHash, fileId]);

  useEffect(() => {
    const sync = () => setNetwork(getNetworkPlaybackProfile(isRemoteStream));
    sync();
    return subscribeNetworkPlaybackProfile(sync);
  }, [isRemoteStream]);

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
      const logs = await fetchPlaybackLogs({
        path: path || null,
        infoHash: infoHash || null,
        fileId: (next?.file_id || fileId) || null,
        baseUrl: baseUrl || null,
      });
      if (!cancelled && logs?.lines) setLogLines(logs.lines.slice(-30));
    };
    void poll();
    const id = window.setInterval(() => {
      void poll();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, path, infoHash, fileId, baseUrl]);

  useEffect(() => {
    if (!enabled) return;
    const video = videoRef.current;
    if (!video) return;

    const onWaiting = () => {
      setWaitingCount((n) => n + 1);
      pushEvent('Buffer (waiting)');
    };
    const onStalled = () => {
      setStallCount((n) => n + 1);
      pushEvent('Stall réseau / décodeur');
    };
    const onPlaying = () => pushEvent('Lecture démarrée');
    const onCanPlay = () => pushEvent('Assez de données pour lire');
    const tick = () => {
      setBufferAheadSec(getBufferAheadSeconds(video.buffered, video.currentTime));
      const est = hlsRef.current?.bandwidthEstimate;
      if (typeof est === 'number' && est > 0) {
        setBandwidthMbps(est / 1_000_000);
      }
    };

    video.addEventListener('waiting', onWaiting);
    video.addEventListener('stalled', onStalled);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('canplay', onCanPlay);
    const interval = window.setInterval(tick, 400);
    tick();
    return () => {
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('stalled', onStalled);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('canplay', onCanPlay);
      window.clearInterval(interval);
    };
  }, [enabled, videoRef, hlsRef, path, infoHash]);

  useEffect(() => {
    if (!enabled) return;
    const onPlayback = (ev: Event) => {
      const detail = (ev as CustomEvent<PlaybackEventDetail>).detail;
      if (!detail?.step) return;
      pushEvent(detail.message || detail.step);
    };
    window.addEventListener(PLAYBACK_EVENT_PREFIX, onPlayback as EventListener);
    return () => window.removeEventListener(PLAYBACK_EVENT_PREFIX, onPlayback as EventListener);
  }, [enabled]);

  return {
    status,
    logLines,
    events,
    stallCount,
    waitingCount,
    bufferAheadSec,
    bandwidthMbps,
    network,
    startedAt: startedAtRef.current,
  };
}
