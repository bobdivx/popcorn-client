import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { emitPlaybackStep, PLAYBACK_EVENT_PREFIX } from './playbackEvents';

describe('playbackEvents', () => {
  let listener: (e: CustomEvent) => void;
  let received: Array<{ step: string; detail: unknown }>;

  beforeEach(() => {
    received = [];
    listener = (e: CustomEvent) => {
      received.push({ step: (e.detail as { step: string }).step, detail: e.detail });
    };
    window.addEventListener(PLAYBACK_EVENT_PREFIX, listener as EventListener);
  });

  afterEach(() => {
    window.removeEventListener(PLAYBACK_EVENT_PREFIX, listener as EventListener);
  });

  it('emits source_selected with sourceType and mode', () => {
    emitPlaybackStep('source_selected', { sourceType: 'local_', mode: 'hls' });
    expect(received).toHaveLength(1);
    expect(received[0].step).toBe('source_selected');
    expect((received[0].detail as { sourceType?: string; mode?: string }).sourceType).toBe('local_');
    expect((received[0].detail as { sourceType?: string; mode?: string }).mode).toBe('hls');
    expect((received[0].detail as { timestamp: number }).timestamp).toBeDefined();
  });

  it('emits seek_native with position', () => {
    emitPlaybackStep('seek_native', { position: 120 });
    expect(received).toHaveLength(1);
    expect(received[0].step).toBe('seek_native');
    expect((received[0].detail as { position?: number }).position).toBe(120);
  });

  it('emits retry_503 with attempt', () => {
    emitPlaybackStep('retry_503', { attempt: 1 });
    expect(received).toHaveLength(1);
    expect(received[0].step).toBe('retry_503');
    expect((received[0].detail as { attempt?: number }).attempt).toBe(1);
  });

  it('emits fallback_direct_to_hls', () => {
    emitPlaybackStep('fallback_direct_to_hls', { message: 'Direct stream failed' });
    expect(received).toHaveLength(1);
    expect(received[0].step).toBe('fallback_direct_to_hls');
    expect((received[0].detail as { message?: string }).message).toBe('Direct stream failed');
  });
});
