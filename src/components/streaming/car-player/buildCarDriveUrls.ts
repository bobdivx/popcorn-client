/** Construit les URLs MJPEG + audio Tesla Drive à partir de l’URL stream MP4. */

export type CarDriveUrls = {
  mjpegUrl: string;
  audioUrl: string;
};

/**
 * `/api/local/stream/<path>?info_hash=…`
 * → `/api/local/stream/<path>/car.mjpeg?info_hash=…&seek=…`
 * → `/api/local/stream/<path>/car.audio?info_hash=…&seek=…`
 */
export function buildCarDriveUrls(streamUrl: string, seekSeconds: number): CarDriveUrls {
  const seek = Math.max(0, Number.isFinite(seekSeconds) ? seekSeconds : 0);
  let url: URL;
  try {
    url = new URL(streamUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  } catch {
    url = new URL(`http://localhost${streamUrl.startsWith('/') ? '' : '/'}${streamUrl}`);
  }

  // Retirer d’éventuels suffixes drive déjà présents
  let pathname = url.pathname.replace(/\/car\.(mjpeg|audio)$/i, '');
  if (pathname.endsWith('/')) pathname = pathname.slice(0, -1);

  const mjpeg = new URL(url.toString());
  mjpeg.pathname = `${pathname}/car.mjpeg`;
  mjpeg.searchParams.set('seek', seek.toFixed(3));

  const audio = new URL(url.toString());
  audio.pathname = `${pathname}/car.audio`;
  audio.searchParams.set('seek', seek.toFixed(3));

  return {
    mjpegUrl: mjpeg.toString(),
    audioUrl: audio.toString(),
  };
}
