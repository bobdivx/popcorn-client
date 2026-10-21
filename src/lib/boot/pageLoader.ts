/**
 * Écran de chargement unique de l'app (#popcorn-loading-fallback, rendu par Layout.astro).
 *
 * Tous les états « on charge » du démarrage (splash Layout, vérifs auth/setup d'IndexRedirect,
 * vérif serveur, données de l'accueil, gardes de route) passent par ce même écran au lieu de
 * monter chacun leur propre loader : pas de flash ni de re-montage entre les étapes, et un
 * seul rendu, centré (même composition sur web, mobile, Android TV 1920 et webOS).
 *
 * Le contrôleur vit dans un script inline du <head> (Layout.astro) pour exister avant les
 * îlots Preact et survivre aux navigations View Transitions. Chaque « hold » garde l'écran
 * visible jusqu'à son release (plafond de sécurité par hold : jamais bloqué).
 */
import { useEffect } from 'preact/hooks';

type LoaderApi = {
  __popcornHoldPageLoader?: (key: string, maxMs?: number) => void;
  __popcornReleasePageLoader?: (key: string) => void;
  __popcornSetPageLoaderMessage?: (text: string | null) => void;
  __popcornShowPageLoader?: () => void;
  __popcornHomeReady?: boolean;
};

function w(): (Window & LoaderApi) | null {
  return typeof window === 'undefined' ? null : (window as Window & LoaderApi);
}

/** Garde l'écran de chargement unique visible (clé idempotente). */
export function holdPageLoader(key: string, maxMs?: number): void {
  try {
    w()?.__popcornHoldPageLoader?.(key, maxMs);
  } catch {
    /* ignore */
  }
}

/** Libère un hold ; l'écran se masque quand plus aucun hold n'est actif et que l'app est prête. */
export function releasePageLoader(key: string): void {
  try {
    w()?.__popcornReleasePageLoader?.(key);
  } catch {
    /* ignore */
  }
}

/** Sous-titre discret de l'écran de chargement (ex. « Démarrage du serveur… »). null = aucun. */
export function setPageLoaderMessage(text: string | null): void {
  try {
    w()?.__popcornSetPageLoaderMessage?.(text);
  } catch {
    /* ignore */
  }
}

/**
 * Garde l'écran de chargement unique tant que `active` est vrai (gardes de route, etc.).
 * `delayMs` : ne l'affiche que si l'attente dure (évite un flash pour une vérif instantanée).
 */
export function usePageLoaderHold(key: string, active: boolean, maxMs = 15000, delayMs = 0): void {
  useEffect(() => {
    if (!active) return undefined;
    let held = false;
    const start = () => {
      held = true;
      holdPageLoader(key, maxMs);
    };
    const timer = delayMs > 0 ? setTimeout(start, delayMs) : null;
    if (!timer) start();
    return () => {
      if (timer) clearTimeout(timer);
      if (held) releasePageLoader(key);
    };
  }, [key, active, maxMs, delayMs]);
}

export const HOME_READY_EVENT = 'popcorn-home-ready';
/** Clé du hold « données de l'accueil » (posé aussi par Layout.astro sur /dashboard). */
export const HOME_DATA_HOLD = 'home-data';

/** L'accueil a ses premières données (et son hero) : l'écran de chargement peut disparaître. */
export function markHomeReady(): void {
  const win = w();
  if (!win) return;
  // Toujours libérer (le hold peut avoir été reposé par une navigation vers l'accueil).
  releasePageLoader(HOME_DATA_HOLD);
  if (win.__popcornHomeReady) return;
  win.__popcornHomeReady = true;
  try {
    win.dispatchEvent(new Event(HOME_READY_EVENT));
  } catch {
    /* ignore */
  }
}

export function isHomeReady(): boolean {
  return !!w()?.__popcornHomeReady;
}

/** Réinitialise l'état « accueil prêt » (nouveau montage de l'accueil). */
export function resetHomeReady(): void {
  const win = w();
  if (win) win.__popcornHomeReady = false;
}
