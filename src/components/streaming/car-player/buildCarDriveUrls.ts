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
 * Profil qualité optimisé pour Tesla en conduite sur réseau mobile.
 * Priorité: **fluidité > qualité** (réseau instable, CPU/GPU limité, safety first).
 * 
 * Valeurs choisies:
 * - 480p @ 12fps : compromis lisibilité / bande passante (~500-800 kbps MJPEG)
 * - quality=3 : compression MJPEG moyenne (trade-off taille/artifacts)
 * - 96kbps audio : voix claire, musique acceptable, ~1/3 du bitrate standard
 */
export function getCarDriveQualityProfile(): CarDriveQualityProfile {
  return {
    maxHeight: 480,
    maxFps: 12,
    quality: 3,
    audioBitrate: '96k',
  };
}

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
export function buildCarDriveUrls(streamUrl: string, seekSeconds: number): CarDriveUrls {
  const seek = Math.max(0, Number.isFinite(seekSeconds) ? seekSeconds : 0);
  const profile = getCarDriveQualityProfile();
  
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

  const audio = new URL(url.toString());
  audio.pathname = `${pathname}/car.audio`;
  audio.searchParams.set('seek', seek.toFixed(3));
  audio.searchParams.set('bitrate', profile.audioBitrate);

  return {
    mjpegUrl: mjpeg.toString(),
    audioUrl: audio.toString(),
  };
}
