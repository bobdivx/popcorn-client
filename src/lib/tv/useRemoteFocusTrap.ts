import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';

/**
 * Piège à focus « télécommande » pour les cartes d'erreur / de confirmation / modales
 * (webOS natif & lite, Android TV, clavier PC).
 *
 * - focus automatique sur le premier bouton (ou [data-autofocus]) à l'ouverture et quand le
 *   contenu change (ex. le panneau passe de « Chargement » à « Erreur ») ;
 * - flèches ←→↑↓ (+ D-pad Android 19-22) : navigation spatiale entre les boutons de la carte ;
 * - OK / Entrée (13, 23, 66) : active le bouton focalisé, une seule fois ;
 * - Tab reste dans la carte ; un focus qui s'échappe est ramené dedans ;
 * - Retour (461 webOS, 10009 Tizen, 4 Android, Échap, Backspace hors champ, `webosback`) :
 *   appelle `onBack` une seule fois par appui (keydown + webosback du même appui dédoublonnés).
 *
 * Les gestionnaires clavier du lecteur / de la navigation TV déjà enregistrés en capture sur
 * `window` doivent ignorer l'événement quand `isRemoteFocusTrapActive()` est vrai : ce piège
 * l'arrête ensuite (stopImmediatePropagation) pour que rien derrière ne réagisse.
 */

type Trap = { id: number; container: () => HTMLElement | null };
const stack: Trap[] = [];
let nextId = 1;

/** Dernier Retour traité par un piège : le doublon du même appui (webosback / popstate) est absorbé. */
let lastTrapBackAt = 0;
const BACK_GRACE_MS = 600;

/**
 * Vrai quand une carte piège le focus (ou vient de se fermer sur Retour, < 600 ms) :
 * les autres gestionnaires de touches doivent s'effacer.
 */
export function isRemoteFocusTrapActive(): boolean {
  if (Date.now() - lastTrapBackAt < BACK_GRACE_MS) return true;
  for (let i = stack.length - 1; i >= 0; i--) {
    const el = stack[i].container();
    if (el && el.isConnected) return true;
  }
  return false;
}

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable]:not([disabled])';

export function trapFocusables(container: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  container.querySelectorAll<HTMLElement>(FOCUSABLE).forEach((el) => {
    if (el.closest('[data-trap-skip], [aria-hidden="true"], [inert]')) return;
    if (el.getAttribute('aria-disabled') === 'true') return;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    const cs = window.getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    out.push(el);
  });
  return out;
}

type Dir = 'left' | 'right' | 'up' | 'down';

function arrowDir(e: KeyboardEvent): Dir | null {
  const k = e.key;
  const c = e.keyCode || e.which;
  if (k === 'ArrowLeft' || k === 'Left' || c === 37 || c === 21) return 'left';
  if (k === 'ArrowRight' || k === 'Right' || c === 39 || c === 22) return 'right';
  if (k === 'ArrowUp' || k === 'Up' || c === 38 || c === 19) return 'up';
  if (k === 'ArrowDown' || k === 'Down' || c === 40 || c === 20) return 'down';
  return null;
}

function isEnter(e: KeyboardEvent): boolean {
  const c = e.keyCode || e.which;
  return e.key === 'Enter' || c === 13 || c === 23 || c === 66;
}

function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'submit', 'reset', 'checkbox', 'radio', 'range', 'color', 'file'].includes(type);
  }
  return (el as HTMLElement).isContentEditable === true;
}

export function isRemoteBackKey(e: KeyboardEvent): boolean {
  const k = e.key;
  const c = e.keyCode || e.which;
  if (k === 'Backspace' || c === 8) return !isTextField(e.target as Element | null);
  return (
    k === 'Escape' ||
    k === 'Back' ||
    k === 'BrowserBack' ||
    k === 'GoBack' ||
    k === 'XF86Back' ||
    c === 27 ||
    c === 461 ||
    c === 10009 ||
    c === 4 ||
    c === 166
  );
}

/** Voisin spatial dans la direction ; repli linéaire (avec bouclage) si rien dans l'axe. */
export function pickNeighbor(items: HTMLElement[], current: HTMLElement | null, dir: Dir): HTMLElement | null {
  if (!items.length) return null;
  const idx = current ? items.indexOf(current) : -1;
  if (idx < 0) return items[0];
  const from = current!.getBoundingClientRect();
  const cx = from.left + from.width / 2;
  const cy = from.top + from.height / 2;
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const el of items) {
    if (el === current) continue;
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    let main: number;
    let cross: number;
    if (dir === 'left') { main = -dx; cross = Math.abs(dy); }
    else if (dir === 'right') { main = dx; cross = Math.abs(dy); }
    else if (dir === 'up') { main = -dy; cross = Math.abs(dx); }
    else { main = dy; cross = Math.abs(dx); }
    if (main <= 1) continue;
    const score = main + cross * 2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) return best;
  const step = dir === 'left' || dir === 'up' ? -1 : 1;
  return items[(idx + step + items.length) % items.length];
}

function focusEl(el: HTMLElement | null) {
  if (!el) return;
  try {
    (el as any).focus({ preventScroll: false, focusVisible: true });
  } catch {
    el.focus();
  }
}

export interface RemoteFocusTrapOptions {
  /** Piège actif (ex. carte visible). */
  active?: boolean;
  /** Touche Retour : fermer la carte / revenir en arrière. Appelé une fois par appui. */
  onBack?: (() => void) | null;
  /** Délai avant le focus initial (laisser le rendu se poser). */
  focusDelayMs?: number;
}

export function useRemoteFocusTrap(
  ref: RefObject<HTMLElement>,
  { active = true, onBack, focusDelayMs = 30 }: RemoteFocusTrapOptions = {},
) {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active || typeof window === 'undefined') return;
    const id = nextId++;
    const trap: Trap = { id, container: () => ref.current };
    stack.push(trap);
    const isTop = () => stack.length > 0 && stack[stack.length - 1].id === id;
    let lastBackAt = 0;

    const focusInitial = () => {
      const root = ref.current;
      if (!root || !isTop()) return;
      if (root.contains(document.activeElement)) return;
      const items = trapFocusables(root);
      focusEl(items.find((el) => el.hasAttribute('data-autofocus')) || items[0] || null);
    };
    const t = window.setTimeout(focusInitial, focusDelayMs);

    // Contenu qui change (chargement → erreur, confirmation qui s'ouvre…) : refocaliser.
    let mo: MutationObserver | null = null;
    let moTimer = 0;
    if (typeof MutationObserver !== 'undefined' && ref.current) {
      mo = new MutationObserver(() => {
        window.clearTimeout(moTimer);
        moTimer = window.setTimeout(focusInitial, 16);
      });
      mo.observe(ref.current, { childList: true, subtree: true });
    }

    const back = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      (e as any).stopImmediatePropagation?.();
      const now = Date.now();
      if ((e as KeyboardEvent).repeat || now - lastBackAt < BACK_GRACE_MS) return; // un seul retour par appui
      lastBackAt = now;
      lastTrapBackAt = now;
      onBackRef.current?.();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const root = ref.current;
      if (!root || !root.isConnected || !isTop()) return;
      const activeEl = document.activeElement as HTMLElement | null;
      const inside = !!activeEl && root.contains(activeEl);

      if (isRemoteBackKey(e)) {
        back(e);
        return;
      }
      const dir = arrowDir(e);
      if (dir) {
        // Champ texte : ←/→ déplacent le curseur.
        if (inside && isTextField(activeEl) && (dir === 'left' || dir === 'right')) {
          e.stopImmediatePropagation();
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        const items = trapFocusables(root);
        focusEl(inside ? pickNeighbor(items, activeEl, dir) : items[0] || null);
        return;
      }
      if (isEnter(e)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (e.repeat) return;
        if (!inside) {
          focusInitial();
          return;
        }
        activeEl!.click();
        return;
      }
      if (e.key === 'Tab' || (e.keyCode || e.which) === 9) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const items = trapFocusables(root);
        if (!items.length) return;
        const i = inside ? items.indexOf(activeEl!) : -1;
        focusEl(items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length]);
        return;
      }
      // Autres touches (lecture/pause, chiffres…) : ne pas atteindre le lecteur derrière.
      if (!inside || !isTextField(activeEl)) e.stopImmediatePropagation();
    };

    const onWebOSBack = (e: Event) => {
      const root = ref.current;
      if (!root || !root.isConnected || !isTop()) return;
      back(e);
    };

    const onFocusIn = (e: FocusEvent) => {
      const root = ref.current;
      if (!root || !isTop()) return;
      const target = e.target as Node | null;
      if (target && !root.contains(target)) {
        const items = trapFocusables(root);
        focusEl(items.find((el) => el.hasAttribute('data-autofocus')) || items[0] || null);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('webosback', onWebOSBack, true);
    document.addEventListener('webosback', onWebOSBack, true);
    document.addEventListener('webOSBackButton', onWebOSBack, true);
    document.addEventListener('focusin', onFocusIn, true);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(moTimer);
      mo?.disconnect();
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('webosback', onWebOSBack, true);
      document.removeEventListener('webosback', onWebOSBack, true);
      document.removeEventListener('webOSBackButton', onWebOSBack, true);
      document.removeEventListener('focusin', onFocusIn, true);
      const i = stack.findIndex((s) => s.id === id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [active, focusDelayMs]);
}
