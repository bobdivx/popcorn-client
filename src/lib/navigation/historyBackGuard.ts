import { useEffect, useRef } from 'preact/hooks';
import { getLastRemoteBackAt } from '../tv/useRemoteFocusTrap';

/**
 * Retour système (geste / bouton Android, bouton « précédent » du navigateur) pour un écran
 * plein-page sans URL propre (lecteur, panneau de lecture) : UNE entrée d'historique tant que
 * l'écran est ouvert ; le Retour la consomme et appelle `onBack` une seule fois.
 *
 * Pourquoi ce module :
 * - avant, chaque overlay de chargement / buffering du lecteur faisait `pushState` puis, au
 *   démontage, `replaceState(null)` : une entrée « morte » restait à chaque buffering. Le
 *   ClientRouter Astro ignore un popstate dont l'état est null → appuis Retour sans effet
 *   (« le bouton retour ne fonctionne pas »), et pendant la lecture rien n'écoutait le Retour ;
 * - le ClientRouter Astro ne doit pas relancer une transition de page en plus de la fermeture :
 *   pendant que la garde est armée, l'état de l'entrée SOUS elle est mis à null (le routeur
 *   ignore un popstate sans état) puis restauré dès qu'on y revient ;
 * - à la fermeture par un bouton à l'écran, l'entrée encore au sommet est retirée par un
 *   `history.back()` silencieux, sans fuite.
 *
 * webOS (pas de ClientRouter, Retour = touche 461 / webosback gérés ailleurs) : désactivé.
 */

type Guard = { id: number; onBack: () => void; popped: boolean; closingAt: number; savedPrev: unknown };

const GUARD_KEY = '__popcornnBackGuard';
const stack: Guard[] = [];
let nextId = 1;
let suppressPops = 0;
let suppressTimer: ReturnType<typeof setTimeout> | null = null;
/** États à restaurer sur l'entrée sous la garde, lors des retraits silencieux (FIFO). */
const pendingRestores: unknown[] = [];
let listenerInstalled = false;

function stateGuardId(): number | null {
  try {
    const st = window.history.state as Record<string, unknown> | null;
    const v = st && st[GUARD_KEY];
    return typeof v === 'number' ? v : null;
  } catch {
    return null;
  }
}

function restorePrevState(saved: unknown) {
  try {
    if (window.history.state == null) window.history.replaceState(saved ?? null, '');
  } catch {
    /* ignore */
  }
}

function onPopState() {
  if (suppressPops > 0) {
    // Retrait silencieux de notre propre entrée (fermeture par bouton) : on retrouve l'entrée
    // d'avant (état null → ignorée par le routeur) et on lui rend son état.
    suppressPops -= 1;
    restorePrevState(pendingRestores.shift());
    return;
  }
  const top = stack[stack.length - 1];
  if (!top || top.popped) return;
  if (stateGuardId() === top.id) return; // navigation « avant » vers notre entrée : rien à faire
  top.popped = true;
  restorePrevState(top.savedPrev);
  const now = Date.now();
  // Fermeture déjà demandée (bouton à l'écran / Retour télécommande) : pas de 2e fermeture.
  if (now - top.closingAt < 1500) return;
  // Même appui déjà traité par une carte télécommande (keydown 461/4/Échap) : pas de doublon.
  if (now - getLastRemoteBackAt() < 600) return;
  top.onBack();
  // L'écran est resté ouvert (ex. Retour a seulement fermé une confirmation) : ré-armer.
  setTimeout(() => {
    if (stack.includes(top) && top.popped) {
      top.popped = false;
      pushGuardEntry(top);
    }
  }, 120);
}

function installListener() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener('popstate', onPopState);
}

function pushGuardEntry(guard: Guard) {
  try {
    const prev = window.history.state as Record<string, unknown> | null;
    guard.savedPrev = prev;
    // Entrée sous la garde : état null le temps que la garde est armée (le ClientRouter ignore
    // alors le popstate du Retour) ; restauré au retour sur cette entrée.
    window.history.replaceState(null, '');
    // L'entrée de garde reprend l'état courant (index Astro…) : si elle survivait (rechargement),
    // elle resterait une entrée « normale ».
    window.history.pushState({ ...(prev || {}), [GUARD_KEY]: guard.id }, '');
  } catch {
    /* ignore */
  }
}

function isWebOSRuntime(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as { PalmSystem?: unknown; webOS?: unknown };
  if (w.PalmSystem || w.webOS) return true;
  return /web0s|webos/i.test(navigator.userAgent || '');
}

/**
 * Active une garde Retour tant que `active` est vrai.
 * Retourne `markClosing()` à appeler juste avant une fermeture volontaire (bouton à l'écran) :
 * un popstate déclenché par cette fermeture ne rappellera pas `onBack`.
 */
export function useHistoryBackGuard(active: boolean, onBack: () => void): () => void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const guardRef = useRef<Guard | null>(null);

  useEffect(() => {
    if (!active || typeof window === 'undefined' || !window.history?.pushState) return;
    if (isWebOSRuntime()) return;
    installListener();
    const guard: Guard = { id: nextId++, onBack: () => onBackRef.current(), popped: false, closingAt: 0, savedPrev: null };
    guardRef.current = guard;
    stack.push(guard);
    pushGuardEntry(guard);
    return () => {
      const i = stack.indexOf(guard);
      if (i >= 0) stack.splice(i, 1);
      if (guardRef.current === guard) guardRef.current = null;
      // Entrée encore au sommet (fermeture par bouton) : la retirer sans réveiller le routeur.
      if (!guard.popped && stateGuardId() === guard.id) {
        suppressPops += 1;
        pendingRestores.push(guard.savedPrev);
        if (suppressTimer) clearTimeout(suppressTimer);
        suppressTimer = setTimeout(() => {
          suppressPops = 0;
          pendingRestores.length = 0;
          suppressTimer = null;
        }, 1000);
        try {
          window.history.back();
        } catch {
          suppressPops = Math.max(0, suppressPops - 1);
          pendingRestores.pop();
        }
      }
    };
  }, [active]);

  return () => {
    if (guardRef.current) guardRef.current.closingAt = Date.now();
  };
}
