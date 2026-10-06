import type { RefObject } from 'preact';

export type CarAttachResult = {
  /** Appeler au unmount / changement de source */
  destroy: () => void;
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function inferCodecHintFromUrl(streamUrl: string): string | null {
  const lower = streamUrl.toLowerCase();
  const bits: string[] = [];
  if (/hevc|x265|h\.?265|av1/.test(lower)) bits.push('HEVC');
  if (/dts|truehd|atmos|flac|e-?ac-?3|ddp|\bac3\b/.test(lower)) bits.push('DTS/AC3');
  return bits.length ? bits.join(' + ') : null;
}

/**
 * Attente que le serveur ait un MP4 H.264/AAC prêt (remux / audio AAC / transcode).
 * En conduite Tesla, on a besoin d’un progressif video/mp4 stable — pas de HLS.
 */
async function waitUntilMp4Ready(
  streamUrl: string,
  signal: { cancelled: boolean },
  onStatus?: (message: string | null) => void,
): Promise<boolean> {
  const codecHint = inferCodecHintFromUrl(streamUrl);
  // DTS→AAC ou HEVC→H.264 peut prendre plus de 3 min sur gros fichiers
  const maxAttempts = codecHint ? 180 : 120; // 6–4 min @ 2 s
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal.cancelled) return false;
    try {
      const res = await fetch(streamUrl, {
        method: 'GET',
        headers: { Range: 'bytes=0-1' },
        cache: 'no-store',
      });
      if (signal.cancelled) return false;
      // 200/206 = octets prêts ; 503 = remux/transcode en cours
      if (res.status === 200 || res.status === 206) {
        try {
          await res.arrayBuffer();
        } catch {
          // ignore body drain
        }
        return true;
      }
      if (res.status === 503 || res.status === 202) {
        const base = codecHint
          ? `Conversion ${codecHint} → H.264/AAC pour Tesla…`
          : 'Préparation MP4 H.264/AAC pour Tesla…';
        onStatus?.(attempt === 0 ? base : `${base} (${attempt + 1})`);
        await sleep(2000);
        continue;
      }
      // Autres erreurs : laisser le <video> tenter quand même
      return true;
    } catch {
      if (signal.cancelled) return false;
      // CORS / réseau : après quelques essais, laisser <video> charger le MP4 directement
      if (attempt >= 2) {
        onStatus?.(null);
        return true;
      }
      onStatus?.('Connexion au flux MP4…');
      await sleep(2000);
    }
  }
  return false;
}

/**
 * Attache un flux progressif MP4 au `<video>` voiture (Tesla Drive).
 *
 * En conduite, Tesla masque souvent la vidéo mais laisse l’audio — d’où un
 * conteneur MP4 natif (Range) plutôt que HLS/MSE, trop fragile dans ce Chromium.
 */
export async function attachCarStream(
  video: HTMLVideoElement,
  streamUrl: string,
  _mode: 'direct' | 'hls-native' | 'hls',
  onFatalError: (message: string) => void,
  onStatus?: (message: string | null) => void,
): Promise<CarAttachResult> {
  const signal = { cancelled: false };
  let nativeErrorHandler: (() => void) | null = null;

  const destroy = () => {
    signal.cancelled = true;
    if (nativeErrorHandler) {
      video.removeEventListener('error', nativeErrorHandler);
      nativeErrorHandler = null;
    }
    try {
      video.removeAttribute('src');
      video.load();
    } catch {
      // ignore
    }
  };

  const ready = await waitUntilMp4Ready(streamUrl, signal, (msg) => onStatus?.(msg));
  if (signal.cancelled) return { destroy };
  onStatus?.(null);

  if (!ready) {
    onFatalError('Préparation MP4 trop longue. Réessayez dans quelques minutes.');
    return { destroy };
  }

  video.src = streamUrl;
  video.load();

  nativeErrorHandler = () => {
    const code = video.error?.code;
    if (!code) return;
    // MEDIA_ERR_SRC_NOT_SUPPORTED — conteneur/codec encore incompatible
    if (code === 4) {
      const hint = inferCodecHintFromUrl(streamUrl);
      onFatalError(
        hint
          ? `Format encore illisible (${hint}). Relancez après conversion serveur H.264/AAC, ou choisissez une version AAC.`
          : 'Format non lisible en MP4. Le serveur doit servir H.264 + AAC pour Tesla.',
      );
    } else if (code === 2) {
      // Réseau : retry soft une fois (coupures Wi‑Fi voiture)
      onFatalError('Erreur réseau pendant la lecture. Vérifiez la connexion et réessayez.');
    } else {
      onFatalError(`Erreur média (code ${code})`);
    }
  };
  video.addEventListener('error', nativeErrorHandler);

  return { destroy };
}

/** Helpers pour typage Ref dans CarPlayer (évite imports inutiles). */
export type VideoRef = RefObject<HTMLVideoElement>;
