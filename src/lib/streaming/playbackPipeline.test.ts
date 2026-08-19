import { describe, expect, it } from 'vitest';
import { pipelineHeadline, type PlaybackPipelineStatus } from './playbackPipeline';

const t = (k: string) => k;

function status(partial: Partial<PlaybackPipelineStatus>): PlaybackPipelineStatus {
  return {
    file_id: 'abc',
    phase: 'transcoding',
    mode: 'transcode',
    ffmpeg_running: true,
    playlist_ready: false,
    is_complete: false,
    segment_count: 0,
    expected_segments: 100,
    video_duration: 400,
    debug_path: '/api/local/playback/debug?q=abc',
    ...partial,
  };
}

describe('pipelineHeadline', () => {
  it('distingue remux et transcode', () => {
    expect(pipelineHeadline(status({ mode: 'remux', phase: 'remuxing' }), t)).toBe(
      'playback.hls.preparingRemux',
    );
    expect(pipelineHeadline(status({ mode: 'transcode', phase: 'transcoding' }), t)).toBe(
      'playback.hls.preparingTranscode',
    );
  });

  it('affiche l’erreur serveur', () => {
    expect(pipelineHeadline(status({ last_error: 'ffprobe failed', phase: 'error' }), t)).toBe(
      'ffprobe failed',
    );
  });
});
