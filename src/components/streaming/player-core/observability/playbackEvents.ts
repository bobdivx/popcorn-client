/**
 * Événements standardisés pour l'observabilité du lecteur (source → player → seek → retry → fallback).
 * Permet aux tests E2E et au diagnostic de suivre les étapes sans dépendre des logs console.
 */

export const PLAYBACK_EVENT_PREFIX = 'popcorn-playback' as const;

export type PlaybackEventStep =
  | 'source_selected'
  | 'player_mode_direct'
  | 'player_mode_hls'
  | 'seek_native'
  | 'seek_reload'
  | 'retry_503'
  | 'fallback_direct_to_hls'
  | 'fallback_lucie_to_hls'
  | 'fallback_message_shown'
  | 'error';

export interface PlaybackEventDetail {
  step: PlaybackEventStep;
  /** Ex: info_hash (tronqué), local_, friend */
  sourceType?: string;
  /** Ex: direct | hls */
  mode?: string;
  /** Position en secondes (seek) */
  position?: number;
  /** Numéro de tentative (retry) */
  attempt?: number;
  /** Message d'erreur ou de fallback */
  message?: string;
  timestamp: number;
}

function dispatchPlaybackEvent(detail: PlaybackEventDetail): void {
  try {
    const event = new CustomEvent(PLAYBACK_EVENT_PREFIX, {
      detail,
      bubbles: false,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(event);
    }
  } catch (_) {
    // ignore in envs without window
  }
}

/** Émet un événement observable (source sélectionnée, mode direct/HLS, etc.). */
export function emitPlaybackStep(step: PlaybackEventStep, payload?: Partial<Omit<PlaybackEventDetail, 'step' | 'timestamp'>>): void {
  dispatchPlaybackEvent({
    step,
    timestamp: typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now(),
    ...payload,
  });
}
