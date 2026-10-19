/** localStorage : intro déjà vue (desktop / une fois). */
export const STORAGE_INTRO_SKIPPED = 'popcorn_intro_skipped';
/** sessionStorage : sting Netflix déjà joué pour cette ouverture d’app (TV). */
export const STORAGE_INTRO_SESSION = 'popcorn_intro_session';

/**
 * Décide si l’intro d’ouverture (sting marque type Netflix) doit s’afficher.
 * - TV / webOS / Android TV : à chaque nouvelle session (comme Netflix à l’ouverture).
 * - Autres : une seule fois (localStorage).
 */
export function shouldShowBootIntro(opts: {
  isTvBoot: boolean;
  sessionSeen: boolean;
  foreverSkipped: boolean;
}): boolean {
  if (opts.isTvBoot) return !opts.sessionSeen;
  return !opts.foreverSkipped;
}

/**
 * Fichiers de l'intro dans public/. Le nom porte une empreinte du contenu (cache-busting) :
 * remplacer la vidéo = nouveau nom, pour que navigateurs, WebView et CDN ne resservent jamais
 * l'ancienne version en cache. Intro actuelle : Grok Imagine (19/10/2026), 6 s, 1280×720,
 * H.264 High + AAC stéréo, MP4 faststart.
 */
export const BOOT_INTRO_MP4_FILE = 'intro-5bda2c68.mp4';
/** Repli GIF (sans son) si le MP4 ne peut pas être lu. */
export const BOOT_INTRO_GIF_FILE = 'intro-d7f8295e.gif';

/** Chemin intro compatible file:// (relatif) et HTTP (racine absolue). */
export function resolveBootIntroMp4(protocol?: string): string {
  return protocol === 'file:' ? `./${BOOT_INTRO_MP4_FILE}` : `/${BOOT_INTRO_MP4_FILE}`;
}

export function resolveBootIntroGif(protocol?: string): string {
  return protocol === 'file:' ? `./${BOOT_INTRO_GIF_FILE}` : `/${BOOT_INTRO_GIF_FILE}`;
}

export type IntroAudioMode = 'sound' | 'muted';

/**
 * Lance l'intro AVEC le son (muted=false, volume=1) — autorisé dans les apps (webOS natif/lite,
 * Android/Tauri, desktop Tauri). Si le navigateur bloque l'autoplay sonore (sites web),
 * repli silencieux sur une lecture muette, sans casser l'intro.
 * Rejette seulement si même la lecture muette échoue.
 */
export async function playIntroWithSound(video: HTMLVideoElement): Promise<IntroAudioMode> {
  video.playsInline = true;
  video.setAttribute('playsinline', 'true');
  video.setAttribute('webkit-playsinline', 'true');
  try {
    video.muted = false;
    video.defaultMuted = false;
    video.removeAttribute('muted');
    video.volume = 1;
    await video.play();
    return 'sound';
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    // NotAllowedError = autoplay sonore refusé → retenter muet. Autres erreurs : idem (codec audio, etc.).
    if (name !== 'NotAllowedError') {
      console.warn('[intro] lecture sonore impossible, repli muet:', err);
    }
    video.muted = true;
    await video.play();
    return 'muted';
  }
}

/**
 * Après un repli muet : rétablit le son au premier geste utilisateur (clic, touche, toucher),
 * sauf Retour/Escape qui servent à passer l'intro. Retourne la fonction de nettoyage.
 */
export function unmuteIntroOnFirstGesture(video: HTMLVideoElement): () => void {
  if (typeof window === 'undefined') return () => {};
  const events = ['pointerdown', 'touchstart', 'keydown'] as const;
  const handler = (e: Event) => {
    if (e.type === 'keydown') {
      const k = e as KeyboardEvent;
      const code = k.keyCode ?? k.which;
      if (k.key === 'Escape' || code === 27 || code === 461 || code === 10009 || code === 8) return;
    }
    try {
      video.muted = false;
      video.volume = 1;
      if (video.paused) void video.play().catch(() => {});
    } catch {
      /* ignore */
    }
    cleanup();
  };
  const cleanup = () => {
    events.forEach((ev) => window.removeEventListener(ev, handler, true));
  };
  events.forEach((ev) => window.addEventListener(ev, handler, true));
  return cleanup;
}
