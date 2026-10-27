/**
 * Garde-fou chemin de lecture : un dossier (ex. `media/films`, `downloadPath` d'un torrent)
 * ne doit jamais être envoyé au backend comme fichier à lire / sonder (ffprobe sur un dossier
 * → durée 0,35 s, aucune piste audio).
 */
const VIDEO_EXTENSIONS = /\.(mkv|mp4|m4v|avi|webm|mov|wmv|flv|ts|m2ts|mts|mpg|mpeg|ogv|3gp|vob)$/i;

/** `true` si le chemin se termine par une extension vidéo connue (fichier, pas dossier). */
export function isVideoFilePath(path: string | null | undefined): boolean {
  const p = (path ?? '').toString().trim().replace(/\\/g, '/').replace(/\/+$/, '');
  if (!p) return false;
  const last = p.split('/').pop() || '';
  return VIDEO_EXTENSIONS.test(last);
}
