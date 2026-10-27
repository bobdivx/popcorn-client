/**
 * Plein écran natif de l'app Android (Tauri) : mode immersif + paysage.
 *
 * Appelle la commande Tauri `set-native-fullscreen` (src-tauri/src/lib.rs), qui passe par JNI
 * à `MainActivity.popcornnSetNativeFullscreen` (ajoutée par scripts/patch-android-fullscreen.js).
 * Le même patch corrige onShowCustomView : `element.requestFullscreen()` devient un vrai plein
 * écran natif ; cette commande sert de complément / repli (plein écran « CSS »).
 *
 * Sans effet (retour `false`) sur le web, webOS, desktop Tauri et les anciennes APK :
 * useFullscreen.ts garde alors l'API Fullscreen web et son repli CSS.
 */
import { isTauri } from './tauri';

/** Évènement émis par MainActivity quand le bouton Retour quitte le plein écran natif. */
export const NATIVE_FULLSCREEN_EXIT_EVENT = 'popcornn:native-fullscreen-exit';

let nativeActive = false;
/** Dernier état demandé (synchrone) : une sortie juste après une entrée encore en vol est transmise. */
let nativeRequested = false;

/** App Tauri sur Android (téléphone, tablette, TV). */
export function isTauriAndroid(): boolean {
  if (!isTauri()) return false;
  return typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
}

export function isNativeFullscreenActive(): boolean {
  return nativeActive;
}

/**
 * Active / désactive le plein écran natif Android.
 * @returns `true` si l'activité Android a appliqué la demande, `false` sinon (non Android,
 *          commande ou patch absent…) — ne lève jamais.
 */
export async function setNativeFullscreen(enabled: boolean): Promise<boolean> {
  if (!isTauriAndroid()) return false;
  if (!enabled && !nativeActive && !nativeRequested) return false;
  nativeRequested = enabled;
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const ok = (await invoke<boolean>('set-native-fullscreen', { enabled })) === true;
    // Une demande plus récente (sortie pendant l'entrée) fait foi.
    if (nativeRequested === enabled) nativeActive = enabled && ok;
    return ok;
  } catch (e) {
    // Ancienne APK (commande inconnue) ou MainActivity non patchée : repli CSS.
    if (!enabled) nativeActive = false;
    console.warn('[Fullscreen] Plein écran natif Android indisponible:', e);
    return false;
  }
}

/** Abonnement à la sortie du plein écran natif par le bouton Retour Android. */
export function onNativeFullscreenExit(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => {
    nativeActive = false;
    nativeRequested = false;
    callback();
  };
  window.addEventListener(NATIVE_FULLSCREEN_EXIT_EVENT, handler);
  return () => window.removeEventListener(NATIVE_FULLSCREEN_EXIT_EVENT, handler);
}
