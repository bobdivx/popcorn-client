/** Construit les URLs MJPEG + audio Tesla Drive à partir de l'URL stream MP4. */

export type CarDriveUrls = {
  mjpegUrl: string;
  audioUrl: string;
};

export interface CarDriveQualityProfile {
  /** Hauteur max vidéo (ex: 480, 360). Réduit la bande passante et le coût de décodage MJPEG. */
  maxHeight: number;
  /** Framerate max (ex: 12). Framerate bas = moins de saccades sur réseau instable. */
  maxFps: number;
  /** Qualité de compression MJPEG (1=meilleur, 5=pire). */
  quality: number;
  /** Bitrate audio MP3 (ex: '96k'). Audio léger, largement suffisant en voiture. */
  audioBitrate: string;
}

/**
 * Profils Drive (fluidité > qualité). Mesures (oct. 2026, flux réel via Cloudflare) :
 * 480p q8 ≈ 27,8 Ko/image ≈ 2,7 Mb/s à 12 i/s (trop lourd en LTE) ; 360p q11 ≈ 14,2 Ko ≈ 1,4 Mb/s ;
 * 288p q12 ≈ 0,7 Mb/s. Défaut allégé : 360p/12/q11.
 */
export type CarDrivePreset = 'standard' | 'lite' | 'plus';

export function getCarDriveQualityProfile(preset: CarDrivePreset = 'standard'): CarDriveQualityProfile {
  if (preset === 'lite') return { maxHeight: 288, maxFps: 10, quality: 12, audioBitrate: '64k' };
  if (preset === 'plus') return { maxHeight: 480, maxFps: 12, quality: 8, audioBitrate: '96k' };
  // FFmpeg -q:v (2=meilleur … 31=pire)
  return { maxHeight: 360, maxFps: 12, quality: 11, audioBitrate: '96k' };
}

export const CAR_DRIVE_PRESET_LABELS: Record<CarDrivePreset, string> = {
  lite: 'Léger · 288p 10 i/s',
  standard: 'Standard · 360p 12 i/s',
  plus: 'Plus · 480p 12 i/s',
};

/**
 * Construit les URLs MJPEG + audio optimisées pour conduite Tesla.
 * 
 * `/api/local/stream/<path>?info_hash=…`
 * → `/api/local/stream/<path>/car.mjpeg?info_hash=…&seek=…&max_height=480&max_fps=12&quality=3`
 * → `/api/local/stream/<path>/car.audio?info_hash=…&seek=…&bitrate=96k`
 * 
 * **Paramètres ajoutés (optimisation stutter):**
 * - `max_height=480` : réduit bande passante ~50-70%, décodage MJPEG plus rapide
 * - `max_fps=12` : framerate bas = moins de saccades sur 3G/LTE variable
 * - `quality=3` : compression MJPEG équilibrée (1=meilleur/lourd, 5=pire/léger)
 * - `bitrate=96k` : audio MP3 compact mais audible
 * 
 * Si le serveur ignore ces params, comportement inchangé (fallback gracieux).
 */
export function buildCarDriveUrls(
  streamUrl: string,
  seekSeconds: number,
  preset: CarDrivePreset = 'standard',
  /** Session télémétrie (corrélation serveur : stream-stats `tag`). */
  sid?: string,
): CarDriveUrls {
  const seek = Math.max(0, Number.isFinite(seekSeconds) ? seekSeconds : 0);
  const profile = getCarDriveQualityProfile(preset);
  
  let url: URL;
  try {
    url = new URL(streamUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch {
    url = new URL(`http://localhost${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`);
  }

  // Retirer d'éventuels suffixes drive déjà présents
  let pathname = url.pathname.replace(/\/car\.(mjpeg|audio)$/i, '');
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  const mjpeg = new URL(url.toString());
  mjpeg.pathname = `${pathname}/car.mjpeg`;
  mjpeg.searchParams.set('seek', seek.toFixed(3));
  mjpeg.searchParams.set('max_height', String(profile.maxHeight));
  mjpeg.searchParams.set('max_fps', String(profile.maxFps));
  mjpeg.searchParams.set('quality', String(profile.quality));
  if (sid) mjpeg.searchParams.set('sid', sid);

  const audio = new URL(url.toString());
  audio.pathname = `${pathname}/car.audio`;
  audio.searchParams.set('seek', seek.toFixed(3));
  audio.searchParams.set('bitrate', profile.audioBitrate);

  return {
    mjpegUrl: mjpeg.toString(),
    audioUrl: audio.toString(),
  };
}
