/** Dernière entrée utilisateur : clavier/télécommande vs souris/tactile. */
export type BrowseInputModality = 'keyboard' | 'pointer';

let modality: BrowseInputModality = 'pointer';
let installed = false;

function onKeyDown(e: KeyboardEvent) {
  const k = e.key;
  if (
    k === 'ArrowLeft' ||
    k === 'ArrowRight' ||
    k === 'ArrowUp' ||
    k === 'ArrowDown' ||
    k === 'Enter' ||
    k === ' ' ||
    k === 'Tab' ||
    k === 'OK' ||
    k === 'Select' ||
    k === 'MediaPlayPause' ||
    // codes TV courants
    e.keyCode === 37 ||
    e.keyCode === 38 ||
    e.keyCode === 39 ||
    e.keyCode === 40 ||
    e.keyCode === 13
  ) {
    modality = 'keyboard';
  }
}

function onPointerDown() {
  modality = 'pointer';
}

export function ensureBrowseInputModalityTracking() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('pointerdown', onPointerDown, true);
}

export function getBrowseInputModality(): BrowseInputModality {
  ensureBrowseInputModalityTracking();
  return modality;
}

/** True si le focus vient d’une nav clavier / télécommande (pas clic souris). */
export function isBrowseKeyboardFocus(): boolean {
  return getBrowseInputModality() === 'keyboard';
}
