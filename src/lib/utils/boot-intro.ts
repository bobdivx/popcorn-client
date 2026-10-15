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

/** Chemin intro compatible IPK webOS (file://) et HTTP. */
export function resolveBootIntroMp4(protocol?: string): string {
  return protocol === 'file:' ? './intro.mp4' : '/intro.mp4';
}

export function resolveBootIntroGif(protocol?: string): string {
  return protocol === 'file:' ? './intro.gif' : '/intro.gif';
}
