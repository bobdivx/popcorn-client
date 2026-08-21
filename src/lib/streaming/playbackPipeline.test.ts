import { describe, expect, it } from 'vitest';
import { friendlyPlaybackHint, pipelineHeadline, type PlaybackPipelineStatus } from './playbackPipeline';

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

describe('friendlyPlaybackHint', () => {
  it('qualité : pastille courte, pas le texte 4K brut', () => {
    expect(friendlyPlaybackHint({ qualityTransition: true, t }).label).toBe(
      'playback.hls.optimizingPicture',
    );
  });

  it('ETA : message chaleureux, pas « lecture dans 23 s »', () => {
    expect(
      friendlyPlaybackHint({ etaPlayableSeconds: 23, t }).label,
    ).toBe('playback.hls.warmingUp');
  });
});

describe('pipelineHeadline', () => {
  it('sans statut : pas de faux « serveur prépare » (laisse le fallback overlay)', () => {
    expect(pipelineHeadline(null, t)).toBe('');
  });

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

  it('ne reste pas sur « préparation » une fois la playlist servie', () => {
    expect(
      pipelineHeadline(
        status({ mode: 'transcode', phase: 'transcoding', playlist_ready: true, segment_count: 12 }),
        t,
      ),
    ).toBe('');
  });
});
