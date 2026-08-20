import { useEffect, useRef } from 'preact/hooks';
import { stampTvPlatformHints } from '../../lib/utils/device-detection';
import {
  clearTvBrowseRestore,
  findTvBrowseRestoreCard,
  isTvBrowsePath,
  peekTvBrowseRestore,
  saveTvBrowseRestoreFromElement,
} from '../../lib/tv-browse-restore';

const TV_MODAL_CLOSE_SELECTOR =
  '[data-close], [aria-label*="Fermer"], [aria-label*="Close"], [aria-label*="close"], [aria-label*="Retour"], [aria-label*="Back"], .close-button';

function isTvBackKey(e: KeyboardEvent): boolean {
  const key = e.key;
  const code = e.keyCode ?? e.which;
  return (
    key === 'Escape' ||
    key === 'Backspace' ||
    key === 'Back' ||
    key === 'BrowserBack' ||
    key === 'GoBack' ||
    code === 8 ||
    code === 27 ||
    code === 461 ||
    code === 10009 ||
    code === 4
  );
}

/** webOS / Tizen : `e.key` est souvent vide, seul `keyCode` est renseigné. */
function tvArrowKey(e: KeyboardEvent): 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | '' {
  const key = e.key;
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown') return key;
  const code = e.keyCode ?? e.which;
  if (code === 37 || code === 21) return 'ArrowLeft';
  if (code === 39 || code === 22) return 'ArrowRight';
  if (code === 38 || code === 19) return 'ArrowUp';
  if (code === 40 || code === 20) return 'ArrowDown';
  return '';
}

/**
 * Fournisseur de navigation TV global - Style Netflix
 * 
 * Supporte TOUS les éléments focusables sur toutes les pages:
 * - Cartes torrent dans les carrousels
 * - Cartes de paramètres dans les grilles
 * - Boutons et liens
 * - Formulaires (inputs, selects)
 * 
 * Navigation:
 * - Gauche/Droite/Haut/Bas: Navigation spatiale
 * - Enter: Sélectionne l'élément
 * - Escape/Back: Retour
 * 
 * Indicateur de position (focus):
 * - Masqué au chargement de la page. N'apparaît qu'au premier mouvement
 *   sur la télécommande (flèches), puis reste visible.
 * 
 * Effet visuel:
 * - Cartes: scale 1.08, ring lumineux, z-index élevé
 * - Autres éléments: outline violet
 */
export default function TVNavigationProvider() {
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  /** Dernier élément auquel on a appliqué l’effet visuel (pour retrait ciblé, évite querySelectorAll). */
  const lastEffectTargetRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    // App simple webOS (URL hébergée) : stamp data-webos / data-tv-platform depuis l’UA LG.
    stampTvPlatformHints();
  }, []);

  useEffect(() => {
    // Sélecteur universel pour tous les éléments interactifs
    const FOCUSABLE_SELECTOR = `
      a[href]:not([disabled]):not([aria-hidden="true"]):not([tabindex="-1"]),
      button:not([disabled]):not([aria-hidden="true"]):not([tabindex="-1"]),
      input:not([disabled]):not([type="hidden"]),
      select:not([disabled]),
      textarea:not([disabled]),
      [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"]),
      [data-focusable]:not([tabindex="-1"])
    `.replace(/\s+/g, ' ').trim();

    // Sélecteurs pour les cartes (effet Netflix)
    const CARD_SELECTOR = '[data-torrent-card], .torrent-poster, [data-settings-card], [data-focusable-card]';
    const CAROUSEL_SELECTOR = '[data-carousel]';
    const LIST_SELECTOR = '[data-tv-list]';
    const LIST_ITEM_SELECTOR = '[data-tv-list-item]';
    const LIST_HEADER_SELECTOR = '[data-tv-list-header]';
    const SETTINGS_CONTAINER_SELECTOR = '[data-tv-settings-container]';
    const SITE_HEADER_SELECTOR = '[data-tv-site-header]';

    const isTvDoc = () =>
      typeof document !== 'undefined' && document.documentElement.getAttribute('data-tv-platform') === 'true';

    /** Mobile tactile : ne pas appliquer le focus Netflix (scale/z-index) ni l’auto-focus settings. */
    const isCoarsePointer = () =>
      typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

    const isWebOSCheck = () =>
      typeof document !== 'undefined' && document.documentElement.getAttribute('data-webos') === 'true';

    /** Cache des nœuds focusables par carrousel (invalidé si le DOM du carrousel change). */
    const carouselRawFocusablesCache = new WeakMap<HTMLElement, HTMLElement[]>();

    const invalidateCarouselCachesForNode = (node: Node | null) => {
      if (!node) return;
      if (node instanceof HTMLElement && node.matches(CAROUSEL_SELECTOR)) {
        carouselRawFocusablesCache.delete(node);
        return;
      }
      let el: Element | null = node instanceof Element ? node : node.parentElement;
      while (el) {
        if (el.matches(CAROUSEL_SELECTOR)) {
          carouselRawFocusablesCache.delete(el as HTMLElement);
          return;
        }
        el = el.parentElement;
      }
    };

    const getCarouselRawFocusables = (carousel: HTMLElement): HTMLElement[] => {
      let list = carouselRawFocusablesCache.get(carousel);
      if (list) return list;
      list = Array.from(carousel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      carouselRawFocusablesCache.set(carousel, list);
      return list;
    };

    /** webOS : union de quelques racines — carrousels via cache (pas de querySelectorAll complet sur main à chaque touche). */
    const collectFocusablesFromWebOSRoots = (): HTMLElement[] => {
      const seen = new Set<HTMLElement>();
      const out: HTMLElement[] = [];
      const main = document.querySelector('main.app-main');
      if (main) {
        for (const carousel of Array.from(main.querySelectorAll<HTMLElement>(CAROUSEL_SELECTOR))) {
          for (const el of getCarouselRawFocusables(carousel)) {
            if (seen.has(el)) continue;
            seen.add(el);
            out.push(el);
          }
        }
        for (const el of Array.from(main.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))) {
          if (el.closest(CAROUSEL_SELECTOR)) continue;
          if (seen.has(el)) continue;
          seen.add(el);
          out.push(el);
        }
      }
      const siteHeader = document.querySelector(SITE_HEADER_SELECTOR);
      const dialog = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
      for (const r of [siteHeader, dialog]) {
        if (!r) continue;
        for (const el of Array.from(r.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))) {
          if (seen.has(el)) continue;
          seen.add(el);
          out.push(el);
        }
      }
      if (out.length === 0 && document.body) {
        return Array.from(document.body.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      }
      return out;
    };

    // Obtenir tous les éléments focusables visibles (optionnellement limités à un conteneur, ex. modal)
    // Exclut les éléments hors viewport. Sur webOS on évite getComputedStyle pour réduire la latence.
    const getFocusableElements = (scope?: HTMLElement | null): HTMLElement[] => {
      const pad = 1;
      // Zone sous/au-dessus l’écran pour inclure des lignes voisines lors des flèches
      const belowViewport = typeof window !== 'undefined' ? Math.min(500, window.innerHeight * 0.6) : 0;
      // TV : zone « au-dessus » large pour joindre le hero après scroll. webOS : plafonner (2400px = scan énorme à chaque touche).
      const webos = isWebOSCheck();
      const tv = isTvDoc();
      // webOS + TV : assez large pour le hero, sans inclure toute la page comme avec 2400px
      const aboveViewport =
        typeof window !== 'undefined'
          ? webos && tv
            ? Math.min(1800, window.innerHeight * 1.5)
            : tv
              ? Math.min(2400, window.innerHeight * 2)
              : Math.min(500, window.innerHeight * 0.35)
          : 0;

      let raw: HTMLElement[];
      if (scope) {
        raw = scope.matches(CAROUSEL_SELECTOR)
          ? getCarouselRawFocusables(scope)
          : Array.from(scope.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      } else if (webos) {
        raw = collectFocusablesFromWebOSRoots();
      } else {
        raw = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      }

      const isCarouselScope = !!(scope && scope.matches(CAROUSEL_SELECTOR));
      const rectForSort = isCarouselScope ? new Map<HTMLElement, { left: number; top: number }>() : null;

      const filtered = raw.filter((el) => {
        if (scope && !scope.contains(el)) return false;
        const rect = el.getBoundingClientRect();
        if (rectForSort) {
          rectForSort.set(el, { left: rect.left, top: rect.top });
        }
        const inViewportX = rect.right >= -pad && rect.left <= window.innerWidth + pad;
        const inViewportY = rect.bottom >= -pad - aboveViewport && rect.top <= window.innerHeight + pad + belowViewport;
        if (rect.width <= 0 || rect.height <= 0 || !inViewportX || !inViewportY) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
        if (el.closest('[data-tv-nav-skip]')) return false;
        if (el.getAttribute('tabindex') === '-1') return false;
        if (!webos) {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        }
        return true;
      });

      // Carrousel : ordre gauche → droite stable (réutilise les rects du filtre, pas de second getBoundingClientRect)
      if (isCarouselScope && rectForSort && filtered.length > 1) {
        filtered.sort((a, b) => {
          const ra = rectForSort.get(a)!;
          const rb = rectForSort.get(b)!;
          return ra.left - rb.left || ra.top - rb.top;
        });
      }
      return filtered;
    };

    // Détecter le contexte de navigation
    const getNavigationContext = (element: HTMLElement): 'carousel' | 'form' | 'grid' | 'page' => {
      if (element.closest(CAROUSEL_SELECTOR)) return 'carousel';
      if (element.closest('form')) return 'form';
      if (element.closest('.grid')) return 'grid';
      return 'page';
    };

    // Vérifier si un élément est une carte
    const isCard = (element: HTMLElement): boolean => {
      return element.matches(CARD_SELECTOR) || !!element.closest(CARD_SELECTOR);
    };

    // Éléments à ignorer en navigation verticale depuis les carrousels (ex. bouton flottant Feedback)
    const FAB_SKIP_SELECTOR = '[data-tv-nav-skip]';
    const VIDEO_CONTROLS_ROW = '[data-tv-video-controls-row]';
    const VIDEO_PROGRESS = '[data-tv-video-progress]';

    // Restreindre les candidats selon le contexte (éviter changement de ligne en carousel, etc.)
    const getCandidatesForDirection = (
      current: HTMLElement,
      elements: HTMLElement[],
      direction: 'up' | 'down' | 'left' | 'right'
    ): HTMLElement[] => {
      // Menu ouvert (notif avatar, badge serveur…) : rester dans le menu
      const openMenu = current.closest('[role="menu"]');
      if (openMenu) {
        const inMenu = elements.filter((el) => openMenu.contains(el));
        if (inMenu.length > 0) return inMenu;
      }

      // Header global (logo Popcorn, nav) : gauche/droite restent dans le header
      const siteHeader = current.closest(SITE_HEADER_SELECTOR);
      if (siteHeader && (direction === 'left' || direction === 'right')) {
        const inHeader = elements.filter((el) => siteHeader.contains(el));
        if (inHeader.length > 0) return inHeader;
      }

      // Dans le lecteur vidéo : gauche/droite uniquement dans la même ligne de boutons (pas la barre de progression)
      const videoWrapper = current.closest('#video-player-wrapper');
      const controlsRow = current.closest(VIDEO_CONTROLS_ROW);
      if (videoWrapper && (direction === 'left' || direction === 'right')) {
        const inRow = elements.filter((el) => {
          if (el.closest(VIDEO_PROGRESS)) return false;
          const elRow = el.closest(VIDEO_CONTROLS_ROW);
          return elRow && controlsRow && elRow === controlsRow;
        });
        if (inRow.length > 0) return inRow;
      }
      // Liste verticale (téléchargements, etc.) : gauche/droite restent dans la même ligne
      const currentListItem = current.closest(LIST_ITEM_SELECTOR);
      if (currentListItem && (direction === 'left' || direction === 'right')) {
        const inRow = elements.filter((el) => currentListItem.contains(el));
        if (inRow.length > 0) return inRow;
      }
      // Dans un carousel : gauche/droite dans le même carrousel
      const currentCarousel = current.closest(CAROUSEL_SELECTOR);
      if (currentCarousel && (direction === 'left' || direction === 'right')) {
        return elements.filter((el) => currentCarousel.contains(el));
      }
      // Depuis un carousel, haut/bas : exclure le FAB et autres [data-tv-nav-skip] pour garder le focus dans les lignes
      if (currentCarousel && (direction === 'up' || direction === 'down')) {
        return elements.filter((el) => !el.closest(FAB_SKIP_SELECTOR));
      }
      // Menu paramètres (nav) sur TV : flèche gauche → header (hors [data-tv-settings-container])
      const settingsNav = current.closest('[data-tv-settings-nav]');
      const settingsContainerForNav = current.closest(SETTINGS_CONTAINER_SELECTOR);
      if (settingsNav && settingsContainerForNav && direction === 'left' && isTvDoc()) {
        const header = document.querySelector(SITE_HEADER_SELECTOR);
        if (header) {
          return elements.filter((el) => settingsContainerForNav.contains(el) || header.contains(el));
        }
      }
      // Menu latéral settings : haut/bas restent dans la nav (évite de sauter vers une carte contenu)
      if (settingsNav && (direction === 'up' || direction === 'down')) {
        if (direction === 'down') {
          return elements.filter((el) => settingsNav.contains(el));
        }
        const header = document.querySelector(SITE_HEADER_SELECTOR);
        if (header) {
          return elements.filter((el) => settingsNav.contains(el) || header.contains(el));
        }
        return elements.filter((el) => settingsNav.contains(el));
      }
      // Contenu settings : haut/bas restent dans le panneau (évite de retomber dans la sidebar)
      const settingsContent = current.closest('[data-tv-settings-content]');
      if (settingsContent && (direction === 'up' || direction === 'down')) {
        return elements.filter((el) => settingsContent.contains(el) && !el.closest('[data-tv-settings-nav]'));
      }
      // À l'intérieur du menu settings : gauche/droite uniquement dans le même conteneur
      const settingsContainer = current.closest(SETTINGS_CONTAINER_SELECTOR);
      if (settingsContainer && (direction === 'left' || direction === 'right')) {
        return elements.filter((el) => settingsContainer.contains(el));
      }
      return elements;
    };

    // Trouver l'élément le plus proche dans une direction
    // `fullOrderedInScope` = liste complète du scope courant (inclut l’élément actif), requis pour le voisin L/R dans les carrousels.
    const findClosestElement = (
      current: HTMLElement,
      elements: HTMLElement[],
      direction: 'up' | 'down' | 'left' | 'right',
      fullOrderedInScope?: HTMLElement[] | null
    ): HTMLElement | null => {
      const DIRECTION_THRESHOLD = 5;
      let candidates = getCandidatesForDirection(current, elements, direction);

      // TV : en remontant depuis le contenu, ne pas sauter au header tant qu’un focus existe au-dessus dans <main>
      // (sinon le score spatial privilégie souvent un onglet du header aligné en X avec la carte courante)
      if (direction === 'up' && isTvDoc()) {
        const main = document.querySelector('main.app-main');
        const header = document.querySelector(SITE_HEADER_SELECTOR);
        if (main?.contains(current) && !header?.contains(current)) {
          const curRect = current.getBoundingClientRect();
          const cy = curRect.top + curRect.height / 2;
          const aboveInMain = candidates.filter((el) => {
            if (header?.contains(el)) return false;
            if (!main?.contains(el)) return false;
            const r = el.getBoundingClientRect();
            return r.top + r.height / 2 < cy - DIRECTION_THRESHOLD;
          });
          if (aboveInMain.length > 0) {
            candidates = aboveInMain;
          }
        }
      }

      // Préférence pour [data-tv-page-action] (toggle Bibliothèque, etc.) quand il se trouve
      // entre la position courante et la cible naturelle dans la direction. Permet de
      // l'atteindre même s'il est éloigné horizontalement (sinon le score spatial le rate
      // car le voisin direct vertical aligné en X gagne presque toujours).
      // Actif sur toutes les plateformes (TV + desktop avec flèches), pas seulement TV.
      if (
        (direction === 'up' || direction === 'down') &&
        !current.closest(LIST_ITEM_SELECTOR) &&
        !current.closest('[data-tv-settings-nav]')
      ) {
        const curRect = current.getBoundingClientRect();
        const cy = curRect.top + curRect.height / 2;
        const inAction = !!current.closest('[data-tv-page-action]');
        if (!inAction) {
          const pageActionCands = candidates.filter((el) => {
            if (!el.closest('[data-tv-page-action]')) return false;
            const r = el.getBoundingClientRect();
            const ay = r.top + r.height / 2;
            return direction === 'up' ? ay < cy - DIRECTION_THRESHOLD : ay > cy + DIRECTION_THRESHOLD;
          });
          if (pageActionCands.length > 0) {
            // Prendre l'élément le plus proche en Y (entrée/sortie de la barre d'action).
            const closest = pageActionCands.reduce((best, el) => {
              const r = el.getBoundingClientRect();
              const ay = r.top + r.height / 2;
              const dist = Math.abs(ay - cy);
              if (!best || dist < best.dist) return { el, dist };
              return best;
            }, null as null | { el: HTMLElement; dist: number });
            if (closest) {
              const paY = closest.el.getBoundingClientRect();
              const paCy = paY.top + paY.height / 2;
              // Vérifier qu'il n'y a aucune autre rangée focalisable strictement entre nous et la page-action.
              // On considère qu'un élément est "sur la même ligne" qu'un autre s'il est à moins de 30px en Y.
              const SAME_ROW_TOLERANCE = 30;
              const blocking = candidates.some((el) => {
                if (el === closest.el || el === current) return false;
                if (el.closest('[data-tv-page-action]')) return false;
                const r = el.getBoundingClientRect();
                const ey = r.top + r.height / 2;
                // Ignorer les éléments quasi sur la même ligne que current (ex : autres
                // boutons du hero) — ils ne bloquent pas verticalement.
                if (Math.abs(ey - cy) < SAME_ROW_TOLERANCE) return false;
                if (direction === 'up') {
                  return ey < cy - DIRECTION_THRESHOLD && ey > paCy + SAME_ROW_TOLERANCE;
                }
                return ey > cy + DIRECTION_THRESHOLD && ey < paCy - SAME_ROW_TOLERANCE;
              });
              if (!blocking) {
                return closest.el;
              }
            }
          }
        }
      }

      // Liste verticale : haut/bas = même « colonne » de la ligne voisine ; gauche/droite = boutons de la ligne
      const listItem = current.closest(LIST_ITEM_SELECTOR) as HTMLElement | null;
      const list = (listItem?.closest(LIST_SELECTOR) as HTMLElement | null) ?? (current.closest(LIST_SELECTOR) as HTMLElement | null);
      if (listItem && (direction === 'left' || direction === 'right')) {
        const rowEls = getFocusableElements(listItem);
        const idx = rowEls.indexOf(current);
        if (idx !== -1) {
          const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < rowEls.length) return rowEls[nextIdx];
        }
        return null;
      }
      if (list && listItem && (direction === 'up' || direction === 'down')) {
        const items = Array.from(list.querySelectorAll<HTMLElement>(LIST_ITEM_SELECTOR));
        const itemIdx = items.indexOf(listItem);
        const nextIdx = direction === 'up' ? itemIdx - 1 : itemIdx + 1;
        if (nextIdx >= 0 && nextIdx < items.length) {
          const nextItem = items[nextIdx];
          const currentRow = getFocusableElements(listItem);
          const nextRow = getFocusableElements(nextItem);
          if (nextRow.length === 0) return null;
          const slot = Math.max(0, currentRow.indexOf(current));
          const primary = nextItem.querySelector<HTMLElement>('[data-tv-list-primary]');
          if (slot <= 0 && primary && nextRow.includes(primary)) return primary;
          return nextRow[Math.min(slot, nextRow.length - 1)] ?? primary ?? nextRow[0];
        }
        if (direction === 'up' && itemIdx === 0) {
          const page = list.closest('[data-page]') ?? list.parentElement;
          const header = page?.querySelector<HTMLElement>(LIST_HEADER_SELECTOR);
          if (header) {
            const inAction = header.querySelector<HTMLElement>(
              '[data-tv-page-action] button:not([disabled]), [data-tv-page-action] [data-focusable]'
            );
            if (inAction) return inAction;
            const headerEls = getFocusableElements(header);
            if (headerEls.length > 0) return headerEls[headerEls.length - 1];
          }
        }
        return null;
      }
      const listHeader = current.closest(LIST_HEADER_SELECTOR) as HTMLElement | null;
      if (listHeader && direction === 'down') {
        const page = listHeader.closest('[data-page]') ?? listHeader.parentElement;
        const listEl = page?.querySelector<HTMLElement>(LIST_SELECTOR);
        const firstItem = listEl?.querySelector<HTMLElement>(LIST_ITEM_SELECTOR);
        if (firstItem) {
          const primary = firstItem.querySelector<HTMLElement>('[data-tv-list-primary]');
          if (primary) return primary;
          const firsts = getFocusableElements(firstItem);
          if (firsts[0]) return firsts[0];
        }
      }

      // Sidebar settings : haut/bas = item précédent/suivant (ordre DOM), pas le score spatial
      const settingsNavEl = current.closest('[data-tv-settings-nav]') as HTMLElement | null;
      if (settingsNavEl && (direction === 'up' || direction === 'down')) {
        const navItems = getFocusableElements(settingsNavEl);
        const navIdx = navItems.indexOf(current);
        if (navIdx !== -1) {
          const nextNavIdx = direction === 'up' ? navIdx - 1 : navIdx + 1;
          if (nextNavIdx >= 0 && nextNavIdx < navItems.length) return navItems[nextNavIdx];
          if (direction === 'down') {
            const contentArea = document.querySelector('[data-tv-settings-content]') as HTMLElement | null;
            if (contentArea) {
              const first = getInitialFocusElement(contentArea);
              if (first && !settingsNavEl.contains(first)) return first;
            }
            return current;
          }
          // Haut depuis le 1er item : laisser le spatial atteindre le header
        }
      }

      // Header : gauche/droite = voisin DOM (onglets → recherche / téléchargements / réglages / avatar).
      // Les onglets centrés peuvent chevaucher les icônes : le score spatial ne trouve alors
      // plus aucun candidat à droite de « Demandes ».
      if (
        (direction === 'left' || direction === 'right') &&
        current.closest(SITE_HEADER_SELECTOR)
      ) {
        const header = current.closest(SITE_HEADER_SELECTOR) as HTMLElement;
        const full = getFocusableElements(header);
        const idx = full.indexOf(current);
        if (idx !== -1) {
          const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < full.length) {
            return full[nextIdx];
          }
        }
        return null;
      }

      // TV + carrousel : gauche/droite = voisin sur la même ligne (liste déjà ordonnée dans getFocusableElements)
      if (
        isTvDoc() &&
        (direction === 'left' || direction === 'right') &&
        current.closest(CAROUSEL_SELECTOR)
      ) {
        const carousel = current.closest(CAROUSEL_SELECTOR) as HTMLElement;
        const full =
          fullOrderedInScope && fullOrderedInScope.length > 0 && fullOrderedInScope.every((el) => carousel.contains(el))
            ? fullOrderedInScope
            : getFocusableElements(carousel);
        const idx = full.indexOf(current);
        if (idx !== -1) {
          const nextIdx = direction === 'left' ? idx - 1 : idx + 1;
          if (nextIdx >= 0 && nextIdx < full.length) {
            return full[nextIdx];
          }
        }
      }

      const currentRect = current.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;
      const context = getNavigationContext(current);

      // Pénalité pour la distance sur l'axe secondaire
      const SECONDARY_PENALTY = context === 'carousel' ? 3 : 2;

      let bestElement: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of candidates) {
        if (el === current) continue;

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        let isInDirection = false;
        let primaryDistance = 0;
        let secondaryDistance = 0;

        switch (direction) {
          case 'up':
            isInDirection = centerY < currentCenterY - DIRECTION_THRESHOLD;
            primaryDistance = currentCenterY - centerY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'down':
            isInDirection = centerY > currentCenterY + DIRECTION_THRESHOLD;
            primaryDistance = centerY - currentCenterY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'left':
            isInDirection = centerX < currentCenterX - DIRECTION_THRESHOLD;
            primaryDistance = currentCenterX - centerX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
          case 'right':
            isInDirection = centerX > currentCenterX + DIRECTION_THRESHOLD;
            primaryDistance = centerX - currentCenterX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
        }

        if (!isInDirection) continue;

        // Score: priorité à la direction primaire, pénalité pour la distance secondaire
        const score = primaryDistance + secondaryDistance * SECONDARY_PENALTY;

        if (score < bestScore) {
          bestScore = score;
          bestElement = el;
        }
      }

      // Logique spéciale pour les carrousels: quand on monte/descend, aller à la première carte visible
      if (bestElement && (direction === 'down' || direction === 'up')) {
        const currentCarousel = current.closest(CAROUSEL_SELECTOR);
        const targetCarousel = bestElement.closest(CAROUSEL_SELECTOR);
        
        if (targetCarousel && (!currentCarousel || !currentCarousel.isSameNode(targetCarousel))) {
          // Entrer dans un nouveau carousel : première carte (au moins partiellement) visible pour navigation fluide
          const cardsInCarousel = Array.from(targetCarousel.querySelectorAll<HTMLElement>(CARD_SELECTOR))
            .filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.left < window.innerWidth && rect.right > 0;
            })
            .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
          
          if (cardsInCarousel.length > 0) {
            // Trouver un élément focusable dans la première carte
            const firstCard = cardsInCarousel[0];
            const focusableInCard = firstCard.querySelector('a[href], button') as HTMLElement;
            return focusableInCard || firstCard;
          }
        }
      }

      return bestElement;
    };

    // TV (toutes plateformes) : scroll instantané — smooth = lag sur télécommande
    const isWebOS = typeof document !== 'undefined' && document.documentElement.getAttribute('data-webos') === 'true';
    const isInstantScroll = isWebOS || isTvDoc();
    const scrollBehavior: ScrollBehavior = isInstantScroll ? 'auto' : 'smooth';

    /** webOS : limiter le débit des keydown en répétition (sinon la pile de travaux sature la télécommande). */
    let lastWebosArrowAt = 0;
    const WEBOS_ARROW_REPEAT_MS = 72;

    // webOS : navigation synchrone (rAF ajoutait une frame de délai + ne renvoyait pas le vrai résultat).
    const scheduleOrRunNavigate = (direction: 'up' | 'down' | 'left' | 'right', scope?: HTMLElement | null): boolean => {
      return navigate(direction, scope);
    };

    // Position d'ancrage du focus : la carte focusée reste à cet X en pixels (depuis le bord gauche du viewport).
    // Le carousel défile pour amener chaque carte à cette position → navigation fluide type Netflix.
    const FOCUS_ANCHOR_RATIO = 0.12;
    const getFocusAnchorX = () => typeof window !== 'undefined' ? window.innerWidth * FOCUS_ANCHOR_RATIO : 120;

    // Carousel : on scroll pour que la carte focusée soit à la position d'ancrage (focus fixe, carousel qui bouge).
    // Le scroll est instantané (behavior='auto') sur TOUTES les plateformes : le mode 'smooth'
    // sur desktop produisait un effet de « glissé » de toutes les cartes à chaque
    // changement de focus — perçu comme parasite par les utilisateurs (cf. UX roadmap Phase 3).
    const scrollCarouselToElement = (carousel: HTMLElement, el: HTMLElement) => {
      const elRect = el.getBoundingClientRect();
      const carouselRect = carousel.getBoundingClientRect();
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      if (maxScroll <= 0) return;

      const anchorX = getFocusAnchorX();
      const cardLeftInScroll = elRect.left - carouselRect.left + carousel.scrollLeft;
      // On veut : après scroll, le bord gauche de la carte soit à anchorX (dans le viewport).
      // cardLeft (viewport) = carouselRect.left + (cardLeftInScroll - newScrollLeft) = anchorX
      let newScrollLeft = cardLeftInScroll + carouselRect.left - anchorX;
      newScrollLeft = Math.max(0, Math.min(maxScroll, newScrollLeft));

      // Évite un reflow inutile si la position est déjà quasi correcte.
      if (Math.abs(carousel.scrollLeft - newScrollLeft) < 4) {
        return;
      }

      carousel.scrollLeft = newScrollLeft;
    };

    // Focus un élément
    const focusElement = (element: HTMLElement) => {
      const inHeroDashboard = element.closest('.hero-dashboard');
      const inListItem = element.closest(LIST_ITEM_SELECTOR);
      // TV / webOS : éviter scrollIntoView(center) coûteux ; nearest limite les reflows.
      // Liste verticale : nearest pour ne pas recentrer la page à chaque flèche.
      const scrollOpts =
        isInstantScroll || inHeroDashboard || inListItem
          ? {
              behavior: scrollBehavior,
              block: 'nearest' as ScrollLogicalPosition,
              inline: 'nearest' as ScrollLogicalPosition,
            }
          : { behavior: scrollBehavior, block: 'center' as ScrollLogicalPosition, inline: 'center' as ScrollLogicalPosition };
      const targetToScroll = element.closest(CARD_SELECTOR) as HTMLElement || element;
      const carousel = targetToScroll.closest(CAROUSEL_SELECTOR) as HTMLElement | null;

      // Si c'est une carte, privilégier un élément réellement focusable
      if (isCard(element)) {
        const card = element.closest(CARD_SELECTOR) as HTMLElement || element;

        if (element.matches(FOCUSABLE_SELECTOR)) {
          element.focus();
          if (carousel) scrollCarouselToElement(carousel, card);
          else element.scrollIntoView(scrollOpts);
          lastFocusedRef.current = element;
          return;
        }

        const focusable = card.querySelector(FOCUSABLE_SELECTOR) as HTMLElement;
        if (focusable) {
          focusable.focus();
          if (carousel) scrollCarouselToElement(carousel, card);
          else focusable.scrollIntoView(scrollOpts);
          lastFocusedRef.current = focusable;
          return;
        }

        if (!card.hasAttribute('tabindex')) {
          card.setAttribute('tabindex', '0');
        }
        card.focus();
        if (carousel) scrollCarouselToElement(carousel, card);
        else card.scrollIntoView(scrollOpts);
        lastFocusedRef.current = card;
        return;
      }

      element.focus();
      if (carousel) scrollCarouselToElement(carousel, targetToScroll);
      else element.scrollIntoView(scrollOpts);

      lastFocusedRef.current = element;
    };

    // Appliquer l'effet visuel (retrait ciblé pour limiter la latence sur webOS)
    const applyFocusEffect = (element: HTMLElement) => {
      const prev = lastEffectTargetRef.current;
      if (prev) {
        prev.classList.remove('tv-card-focused', 'tv-element-focused');
        lastEffectTargetRef.current = null;
      }
      const card = element.closest(CARD_SELECTOR) as HTMLElement;
      if (card) {
        card.classList.add('tv-card-focused');
        lastEffectTargetRef.current = card;
      } else {
        element.classList.add('tv-element-focused');
        lastEffectTargetRef.current = element;
      }
    };

    // Retirer l'effet visuel
    const removeFocusEffect = (element: HTMLElement) => {
      const card = element.closest(CARD_SELECTOR) as HTMLElement;
      if (card) card.classList.remove('tv-card-focused');
      element.classList.remove('tv-element-focused');
      if (lastEffectTargetRef.current === card || lastEffectTargetRef.current === element) {
        lastEffectTargetRef.current = null;
      }
    };

    // Premier élément à focuser (selon la page ou la modal)
    const getInitialFocusElement = (scope?: HTMLElement | null): HTMLElement | null => {
      const focusableElements = getFocusableElements(scope);
      if (focusableElements.length === 0) return null;

      // Modale (scope = dialog) : ne pas utiliser le 1er nœud DOM (souvent « Retour ») — respecter data-autofocus (ex. « Lire » dans la modal Téléchargements)
      if (scope) {
        const autofocus = focusableElements.find((el) => el.hasAttribute('data-autofocus'));
        if (autofocus) return autofocus;
        return focusableElements[0];
      }

      // Retour d’une fiche : restaurer la carte avant le hero / data-tv-initial-focus
      if (isTvDoc() && isTvBrowsePath()) {
        const restore = peekTvBrowseRestore();
        if (restore) {
          const card = findTvBrowseRestoreCard(restore.itemKey);
          if (card) {
            const inner = card.matches(FOCUSABLE_SELECTOR)
              ? card
              : card.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
            if (inner && (focusableElements.includes(inner) || inner.offsetWidth > 0)) return inner;
          }
          return null;
        }
      }

      const marked = document.querySelector<HTMLElement>('[data-tv-initial-focus]');
      if (marked && !document.querySelector('[data-episode-card]')) {
        if (focusableElements.includes(marked)) return marked;
        const inner = marked.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (inner && (focusableElements.includes(inner) || inner.offsetWidth > 0)) return inner;
        if (marked.matches(FOCUSABLE_SELECTOR)) return marked;
      }

      // TV + Pages avec hero (Dashboard / Films / Séries) : commencer sur le hero
      // (évite de scroller vers les carrousels et de « perdre » le bandeau).
      if (isTvDoc() && typeof window !== 'undefined') {
        const path = window.location.pathname.replace(/\/$/, '') || '/';
        if (path === '/dashboard' || path === '/films' || path === '/series' || path === '/demandes') {
          const heroBtn = document.querySelector<HTMLElement>('.hero-dashboard button[data-focusable]');
          if (heroBtn && focusableElements.includes(heroBtn)) return heroBtn;
        }
      }

      // Fiche média : Lire / Télécharger, pas Retour (Retour = Escape / Back)
      const mediaDetailPrimary =
        document.querySelector<HTMLElement>('[data-media-detail-primary-action]') ||
        document.querySelector<HTMLElement>('[data-media-detail-action="play"]') ||
        document.querySelector<HTMLElement>('[data-media-detail-action="download"]');
      if (mediaDetailPrimary && focusableElements.includes(mediaDetailPrimary)) return mediaDetailPrimary;

      // Page Settings : priorité au contenu (première carte ou premier focusable) sur toute sous-page
      const settingsContainer = document.querySelector(SETTINGS_CONTAINER_SELECTOR);
      if (settingsContainer) {
        const contentArea = document.querySelector('[data-tv-settings-content]');
        const inContainer = focusableElements.filter((el) => settingsContainer.contains(el));
        if (contentArea && inContainer.length > 0) {
          const firstInContent = inContainer.find((el) => contentArea.contains(el));
          if (firstInContent) return firstInContent;
        }
        if (inContainer.length > 0) {
          const nav = settingsContainer.querySelector('[data-tv-settings-nav]');
          const firstInNav = nav ? inContainer.find((el) => nav.contains(el)) : null;
          if (firstInNav) return firstInNav;
          return inContainer[0];
        }
      }

      // Priorité aux cartes sur les autres pages
      const firstCard = document.querySelector(`${CARD_SELECTOR} a, ${CARD_SELECTOR} button`) as HTMLElement;
      if (firstCard) return firstCard;
      return focusableElements[0];
    };

    // Navigation dans une direction (scope optionnel = modal ou conteneur pour piège à focus, fromEl = élément de référence pour la recherche spatiale, ex. input qu'on quitte)
    const navigate = (direction: 'up' | 'down' | 'left' | 'right', scope?: HTMLElement | null, fromEl?: HTMLElement | null): boolean => {
      const activeElement = (fromEl ?? document.activeElement) as HTMLElement;

      // Sur webOS / TV : en carousel, gauche/droite uniquement dans le carousel courant
      let effectiveScope = scope;
      if (!effectiveScope && activeElement && (direction === 'left' || direction === 'right')) {
        const carousel = activeElement.closest(CAROUSEL_SELECTOR) as HTMLElement | null;
        if (carousel) effectiveScope = carousel;
      }

      // webOS : haut/bas depuis une carte torrent — le <main> suffit pour passer d’une ligne à l’autre
      if (
        !scope &&
        isWebOSCheck() &&
        activeElement &&
        activeElement !== document.body &&
        (direction === 'up' || direction === 'down') &&
        activeElement.closest(CAROUSEL_SELECTOR)
      ) {
        const mainEl = document.querySelector('main.app-main');
        if (mainEl) effectiveScope = mainEl as HTMLElement;
      }

      const focusableElements = getFocusableElements(effectiveScope);

      if (focusableElements.length === 0) return false;
      
      // Si scope défini et focus hors scope, focuser le premier élément du scope
      if (scope && (!activeElement || activeElement === document.body || !scope.contains(activeElement))) {
        const first = getInitialFocusElement(scope);
        if (first) {
          focusElement(first);
          return true;
        }
        return false;
      }
      
      // Si pas de focus actuel et pas de fromEl, focus le premier élément (priorité Settings = 1er menu)
      if ((!activeElement || activeElement === document.body) && !fromEl) {
        const first = getInitialFocusElement(scope);
        if (first) {
          focusElement(first);
          return true;
        }
        return false;
      }

      // Exclure l'élément actuel (ou fromEl) des candidats pour éviter de se re-focuser
      const candidates = focusableElements.filter((el) => el !== activeElement);
      const nextElement = findClosestElement(activeElement, candidates, direction, focusableElements);
      if (nextElement) {
        focusElement(nextElement);
        return true;
      }

      return false;
    };

    /** TV : premier lien / bouton du header (touche Menu). */
    const focusTVHeaderFirst = (): boolean => {
      const header = document.querySelector(SITE_HEADER_SELECTOR);
      if (!header) return false;
      const first =
        header.querySelector<HTMLElement>(
          'a[href]:not([disabled]), button:not([disabled]), [data-focusable], [tabindex]:not([tabindex="-1"])'
        ) ?? undefined;
      if (!first) return false;
      first.focus();
      return true;
    };

    /** TV : premier focusable d'un bloc [data-tv-page-action] (toggle Bibliothèque, etc.). */
    const focusPageAction = (): boolean => {
      const action = document.querySelector<HTMLElement>('[data-tv-page-action]');
      if (!action) return false;
      const first =
        action.querySelector<HTMLElement>(
          'a[href]:not([disabled]), button:not([disabled]), [data-focusable], [tabindex]:not([tabindex="-1"])'
        ) ?? (action.matches(FOCUSABLE_SELECTOR) ? action : null);
      if (!first) return false;
      first.focus();
      return true;
    };

    /**
     * Touche Menu : cycle Header → Page-action → Contenu (1ère carte).
     * Permet d'atteindre le toggle Bibliothèque même quand il est hors du parcours
     * spatial naturel (placé à droite du titre, sous le hero).
     */
    const cycleTopFocus = (): boolean => {
      const active = document.activeElement as HTMLElement | null;
      const inHeader = !!active && !!active.closest(SITE_HEADER_SELECTOR);
      const inAction = !!active && !!active.closest('[data-tv-page-action]');
      if (!inHeader && !inAction) {
        // Depuis le contenu : aller au header.
        if (focusTVHeaderFirst()) return true;
        return focusPageAction();
      }
      if (inHeader) {
        // Header → page-action si présente, sinon on reste.
        if (focusPageAction()) return true;
        return false;
      }
      // inAction → revenir au header.
      return focusTVHeaderFirst();
    };

    // Gestionnaire de touches
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Détecter le bouton retour (webOS, Android TV, etc.)
      const isBackButton = isTvBackKey(e);
      
      // Vérifier si le focus est dans un champ éditable (saisie texte)
      const isEditableElement = (el: HTMLElement | null) =>
        el && (
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.isContentEditable
        );
      const inEditable = isEditableElement(target);
      
      // Dans un input/textarea/contenteditable :
      // - Backspace = supprimer du texte, ne jamais interpréter comme "retour"
      // - Escape = quitter le champ et naviguer vers le haut
      // - ArrowUp/ArrowDown = quitter le champ et naviguer (les télécommandes TV n'ont souvent pas Escape)
      if (inEditable) {
        if (e.key === 'Backspace' || e.keyCode === 8) {
          return; // Laisser le comportement par défaut (suppression du caractère)
        }
        if (e.key === 'Escape' || e.keyCode === 27) {
          const handled = navigate('up', undefined, target);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          } else {
            target.blur();
          }
          return;
        }
        if (e.key === 'ArrowUp') {
          const handled = navigate('up', undefined, target);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (e.key === 'ArrowDown') {
          const handled = navigate('down', undefined, target);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
          return; // Laisser le curseur se déplacer dans le texte
        }
      }

      // Clavier à l'écran : Backspace télécommande = effacer un caractère (quitter si vide)
      const tvKeyboard = target.closest?.('[data-tv-keyboard]') as HTMLElement | null;
      if (tvKeyboard && (e.key === 'Backspace' || e.keyCode === 8)) {
        const backspaceBtn = tvKeyboard.querySelector<HTMLButtonElement>('[data-tv-keyboard-backspace]');
        if (backspaceBtn && !backspaceBtn.disabled) {
          e.preventDefault();
          e.stopPropagation();
          backspaceBtn.click();
          return;
        }
      }

      // Modal ouverte : navigation D-pad limitée à l'intérieur de la modal (piège à focus)
      const modal = document.querySelector<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])');
      if (modal && !isBackButton) {
        const focusInModal = modal.contains(document.activeElement);
        if (!focusInModal) {
          const first = getInitialFocusElement(modal);
          if (first) {
            focusElement(first);
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        const modalArrow = tvArrowKey(e);
        if (modalArrow) {
          const dir = modalArrow.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
          const handled = navigate(dir, modal);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
      }

      // TV : touche Menu / ContextMenu / Android KEYCODE_MENU (82) → cycle Header → Page action → Contenu
      if (
        document.documentElement.getAttribute('data-tv-platform') === 'true' &&
        !modal &&
        (e.key === 'ContextMenu' ||
          e.key === 'Menu' ||
          (e as KeyboardEvent & { keyCode?: number }).keyCode === 82)
      ) {
        if (cycleTopFocus()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Raccourci direct toggle Bibliothèque / page-action :
      // - Desktop : touche « b » (lettre, hors champ texte).
      // - TV : touche couleur Verte (Tizen/webOS keyCode 404, key=ColorF1) — la plus accessible
      //   sur la majorité des télécommandes.
      const evKeyCode = (e as KeyboardEvent & { keyCode?: number }).keyCode;
      const isPageActionShortcut =
        !modal &&
        !inEditable &&
        ((e.key === 'b' || e.key === 'B') ||
          e.key === 'ColorF1' ||
          evKeyCode === 404);
      if (isPageActionShortcut) {
        if (focusPageAction()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Ignorer si player vidéo actif (HLS, Lucie, wrapper unifié),
      // sauf overlay buffer / chargement qui doit recevoir Retour.
      if (
        !document.querySelector('[data-playback-overlay]') &&
        document.querySelector(
          '.hls-player-container:focus-within, #lucie-player-container:focus-within, #video-player-wrapper:focus-within, [data-tv-player-active]:focus-within'
        )
      ) {
        return;
      }

      // Hero TV : gauche/droite cycle les titres au lieu de changer de bouton
      if (
        isTvDoc() &&
        !modal &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      ) {
        const activeHero = document.activeElement as HTMLElement | null;
        const heroCycle = activeHero?.closest?.('[data-tv-hero-cycle]') as HTMLElement | null;
        if (heroCycle) {
          heroCycle.dispatchEvent(
            new CustomEvent('tv-hero-cycle', {
              bubbles: true,
              detail: { delta: e.key === 'ArrowRight' ? 1 : -1 },
            })
          );
          e.preventDefault();
          e.stopPropagation();
          return;
        }
      }

      const arrowKey = tvArrowKey(e);
      if (isWebOS && arrowKey) {
        const now = performance.now();
        if (e.repeat && now - lastWebosArrowAt < WEBOS_ARROW_REPEAT_MS) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastWebosArrowAt = now;
      }

      let handled = false;

      const keyForSwitch =
        isBackButton && e.key !== 'Escape' && e.key !== 'Backspace'
          ? 'Escape'
          : e.key || arrowKey;

      switch (keyForSwitch) {
        case 'ArrowLeft': {
          // Settings : gauche dans le contenu d'abord (grille, pastilles thème) ;
          // seulement s'il n'y a plus de voisin à gauche → menu latéral.
          const settingsContainer = document.querySelector(SETTINGS_CONTAINER_SELECTOR);
          const contentArea = document.querySelector('[data-tv-settings-content]');
          const nav = document.querySelector<HTMLElement>('[data-tv-settings-nav]');
          const active = document.activeElement as HTMLElement;
          if (settingsContainer && contentArea && nav && active && contentArea.contains(active) && !nav.contains(active)) {
            const movedInContent = navigate('left', contentArea as HTMLElement);
            if (movedInContent) {
              handled = true;
            } else {
              const navRect = nav.getBoundingClientRect();
              const navOffScreen = navRect.right < 0 || navRect.left > window.innerWidth;
              const focusNav = () => {
                const currentItem = nav.querySelector<HTMLElement>('[aria-current="page"]');
                const firstInNav = nav.querySelector<HTMLElement>('a[href], button, [data-focusable], [tabindex]:not([tabindex="-1"])');
                const toFocus = currentItem || firstInNav;
                if (toFocus) toFocus.focus();
              };
              if (navOffScreen) {
                document.dispatchEvent(new CustomEvent('open-settings-drawer'));
                requestAnimationFrame(() => requestAnimationFrame(focusNav));
              } else {
                focusNav();
              }
              handled = true;
            }
          }
          if (!handled) {
            const moved = navigate('left');
            handled = moved;
          }
          break;
        }
        case 'ArrowRight': {
          const settingsNav = document.querySelector<HTMLElement>('[data-tv-settings-nav]');
          const contentArea = document.querySelector<HTMLElement>('[data-tv-settings-content]');
          const activeRight = document.activeElement as HTMLElement;
          if (settingsNav && contentArea && activeRight && settingsNav.contains(activeRight)) {
            handled = navigate('right', contentArea);
            break;
          }
          handled = scheduleOrRunNavigate('right');
          break;
        }
        case 'ArrowUp':
          handled = scheduleOrRunNavigate('up');
          break;
        case 'ArrowDown':
          handled = scheduleOrRunNavigate('down');
          break;
        case 'Enter':
        case 'NumpadEnter':
        case 'OK':
        case 'Select':
          // Laisser l'événement se propager naturellement pour les liens/boutons
          const active = document.activeElement as HTMLElement;
          if (active && !['A', 'BUTTON', 'INPUT', 'SELECT'].includes(active.tagName)) {
            // Chercher un lien ou bouton dans l'élément
            const clickable = active.querySelector('a[href], button') as HTMLElement;
            if (clickable) {
              clickable.click();
              handled = true;
            }
          }
          break;
        case ' ':
          // Espace sur un élément non-input
          const activeEl = document.activeElement as HTMLElement;
          if (activeEl && !['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT'].includes(activeEl.tagName)) {
            const btn = activeEl.querySelector('button, a[href]') as HTMLElement;
            if (btn) {
              btn.click();
              handled = true;
            }
          }
          break;
        case 'Escape':
        case 'Backspace':
          // Fermer modal si ouverte
          if (modal) {
            const closeBtn = modal.querySelector(TV_MODAL_CLOSE_SELECTOR) as HTMLElement;
            if (closeBtn) {
              closeBtn.click();
              handled = true;
            } else {
              // Si pas de bouton de fermeture trouvé, déclencher un événement personnalisé
              // que les composants peuvent écouter pour fermer la modal
              const closeEvent = new CustomEvent('tv-back-button', { 
                bubbles: true, 
                cancelable: true,
                detail: { modal }
              });
              modal.dispatchEvent(closeEvent);
              
              if (!closeEvent.defaultPrevented) {
                // Si l'événement n'a pas été géré, essayer de trouver un bouton X ou fermer
                const xBtn = modal.querySelector('button svg, button[class*="close"], button[class*="X"]')?.closest('button') as HTMLElement;
                if (xBtn) {
                  xBtn.click();
                  handled = true;
                } else {
                  // Dernier recours : essayer de trouver n'importe quel bouton dans le header de la modal
                  const modalHeader = modal.querySelector('div:first-child, header');
                  if (modalHeader) {
                    const headerBtn = modalHeader.querySelector('button') as HTMLElement;
                    if (headerBtn) {
                      headerBtn.click();
                      handled = true;
                    }
                  }
                }
              } else {
                handled = true;
              }
            }
          } else {
            // Vérifier si un sous-menu Settings peut gérer le retour (le plus profond contenant le focus)
            const handlers = Array.from(document.querySelectorAll('[data-tv-back-handler]')) as (HTMLElement & { _tvBack?: () => void })[];
            const active = document.activeElement;
            const containing = handlers.filter((el) => active && el.contains(active));
            const deepest = containing.length
              ? containing.reduce((a, b) => (a.contains(b) ? b : a))
              : null;
            if (deepest?._tvBack) {
              deepest._tvBack();
              handled = true;
            } else if (window.history.length > 1) {
              window.history.back();
              handled = true;
            }
          }
          break;
      }

      const activeAfter = document.activeElement as HTMLElement | null;
      const trapSettingsArrows =
        !!activeAfter &&
        ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) &&
        !!activeAfter.closest?.(SETTINGS_CONTAINER_SELECTOR);

      if (handled || trapSettingsArrows) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Gestionnaire de focus pour effet visuel
    const handleFocusIn = (e: FocusEvent) => {
      // Sur mobile, le tap focus une carte : le scale/z-index recouvre les voisines et bloque le swipe.
      if (!isTvDoc() && isCoarsePointer()) return;
      const target = e.target as HTMLElement;
      applyFocusEffect(target);
    };

    const handleFocusOut = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      const delay = isWebOS ? 0 : 10;
      setTimeout(() => {
        const card = target.closest(CARD_SELECTOR) as HTMLElement;
        if (card && !card.contains(document.activeElement)) {
          removeFocusEffect(target);
        } else if (!card && target !== document.activeElement) {
          removeFocusEffect(target);
        }
      }, delay);
    };

    /** Mobile : les styles injectés (scale 1.08) passent après global.css — il faut les désactiver ici. */
    const MOBILE_TOUCH_CSS = `
      @media (hover: none) and (pointer: coarse) {
        html:not([data-tv-platform="true"]) .tv-card-focused {
          transform: none !important;
          z-index: auto !important;
          outline: none !important;
          box-shadow: none !important;
          animation: none !important;
        }
        html:not([data-tv-platform="true"]) .grid:has(.tv-card-focused) [data-settings-card]:not(.tv-card-focused):not(:focus-within) {
          opacity: 1 !important;
        }
        html:not([data-tv-platform="true"]) .carousel-container {
          scroll-behavior: auto !important;
        }
      }
    `;

    /** TV : pas d’anim sur posters / carrousels (GPU). Loader, ds-enter et UI restent actifs. */
    const TV_PLATFORM_PERF_CSS = `
      html[data-tv-platform="true"] [data-carousel],
      html[data-tv-platform="true"] [data-carousel] *:not(.ds-loader-spin):not(.ds-progress-bar):not(.animate-spin),
      html[data-tv-platform="true"] .carousel-container,
      html[data-tv-platform="true"] .carousel-container *:not(.ds-loader-spin):not(.ds-progress-bar):not(.animate-spin) {
        animation: none !important;
        transition: none !important;
      }
      html[data-tv-platform="true"] [data-torrent-card],
      html[data-tv-platform="true"] .torrent-poster,
      html[data-tv-platform="true"] [data-settings-card],
      html[data-tv-platform="true"] [data-focusable-card] {
        transition: none !important;
        animation: none !important;
      }
      html[data-tv-platform="true"] .tv-card-focused {
        transform: none !important;
        box-shadow: none !important;
        animation: none !important;
      }
      html[data-tv-platform="true"] [data-torrent-card].tv-card-focused,
      html[data-tv-platform="true"] .torrent-poster.tv-card-focused,
      html[data-tv-platform="true"] [data-settings-card].tv-card-focused {
        animation: none !important;
        outline: 3px solid rgba(255, 255, 255, 0.75) !important;
        outline-offset: -3px !important;
        box-shadow: none !important;
      }
      html[data-tv-platform="true"] [data-torrent-card]:focus-visible,
      html[data-tv-platform="true"] [data-torrent-card]:focus-within,
      html[data-tv-platform="true"] .torrent-poster:focus-visible,
      html[data-tv-platform="true"] .torrent-poster:focus-within {
        animation: none !important;
        box-shadow: none !important;
      }
      html[data-tv-platform="true"] [data-carousel]:has(.tv-card-focused) [data-torrent-card]:not(.tv-card-focused),
      html[data-tv-platform="true"] [data-carousel]:has(.tv-card-focused) .torrent-poster:not(.tv-card-focused) {
        opacity: 1 !important;
      }
      html[data-tv-platform="true"] .grid:has(.tv-card-focused) [data-settings-card]:not(.tv-card-focused):not(:focus-within) {
        opacity: 1 !important;
      }
    `;

    // Styles CSS pour la navigation TV
    const style = document.createElement('style');
    style.id = 'tv-navigation-styles';
    style.textContent = `
      /* Marquer le body comme TV active — halo blanc (même norme que cartes) */
      body {
        --tv-focus-color: rgba(255, 255, 255, 0.75);
        --tv-focus-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
      }
      
      /* Style « Netflix » (desktop / mobile) — pas sur html[data-tv-platform] (mode perf ci-dessous) */
      html:not([data-tv-platform="true"]) [data-torrent-card],
      html:not([data-tv-platform="true"]) .torrent-poster,
      html:not([data-tv-platform="true"]) [data-settings-card],
      html:not([data-tv-platform="true"]) [data-focusable-card] {
        transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, opacity 0.2s ease-out;
      }
      
      html:not([data-tv-platform="true"]) .tv-card-focused {
        transform: scale(1.08) !important;
        z-index: 10 !important;
        box-shadow: var(--tv-focus-shadow) !important;
      }
      
      html:not([data-tv-platform="true"]) [data-torrent-card].tv-card-focused,
      html:not([data-tv-platform="true"]) .torrent-poster.tv-card-focused,
      html:not([data-tv-platform="true"]) [data-settings-card].tv-card-focused {
        box-shadow: unset !important;
        outline: 2px solid var(--tv-focus-color) !important;
        outline-offset: -2px !important;
        border-radius: 0.5rem !important;
      }
      html:not([data-tv-platform="true"]) [data-settings-card].tv-card-focused {
        border-radius: var(--ds-radius-lg) !important;
      }
      html:not([data-tv-platform="true"]) [data-torrent-card]:focus-visible,
      html:not([data-tv-platform="true"]) [data-torrent-card]:focus-within,
      html:not([data-tv-platform="true"]) .torrent-poster:focus-visible,
      html:not([data-tv-platform="true"]) .torrent-poster:focus-within {
        outline: 2px solid var(--tv-focus-color) !important;
        outline-offset: -2px !important;
        border-radius: 0.5rem !important;
      }
      
      html:not([data-tv-platform="true"]) [data-carousel]:has(.tv-card-focused) [data-torrent-card]:not(.tv-card-focused),
      html:not([data-tv-platform="true"]) [data-carousel]:has(.tv-card-focused) .torrent-poster:not(.tv-card-focused),
      html:not([data-tv-platform="true"]) .grid:has(.tv-card-focused) [data-settings-card]:not(.tv-card-focused):not(:focus-within) {
        opacity: 0.7;
      }
      
      html:not([data-tv-platform="true"]) .tv-element-focused,
      html:not([data-tv-platform="true"]) a:focus-visible,
      html:not([data-tv-platform="true"]) button:focus-visible,
      html:not([data-tv-platform="true"]) input:focus-visible,
      html:not([data-tv-platform="true"]) select:focus-visible,
      html:not([data-tv-platform="true"]) textarea:focus-visible,
      html:not([data-tv-platform="true"]) [tabindex]:focus-visible {
        outline: 2px solid var(--tv-focus-color) !important;
        outline-offset: -2px !important;
      }
      
      html:not([data-tv-platform="true"]) .tv-card-focused a:focus-visible,
      html:not([data-tv-platform="true"]) .tv-card-focused button:focus-visible,
      html:not([data-tv-platform="true"]) [data-torrent-card] a:focus-visible,
      html:not([data-tv-platform="true"]) [data-torrent-card] button:focus-visible,
      html:not([data-tv-platform="true"]) .torrent-poster a:focus-visible,
      html:not([data-tv-platform="true"]) .torrent-poster button:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        animation: none !important;
      }
      
      html:not([data-tv-platform="true"]) a,
      html:not([data-tv-platform="true"]) button,
      html:not([data-tv-platform="true"]) input,
      html:not([data-tv-platform="true"]) select,
      html:not([data-tv-platform="true"]) textarea,
      html:not([data-tv-platform="true"]) [tabindex],
      html:not([data-tv-platform="true"]) [data-focusable] {
        transition: outline 0.15s ease-out, outline-offset 0.15s ease-out;
      }

      /* webOS : posters sans scale/transition coûteuse ; le loader et l’UI restent animés */
      html[data-webos="true"] [data-torrent-card],
      html[data-webos="true"] .torrent-poster,
      html[data-webos="true"] [data-settings-card],
      html[data-webos="true"] [data-focusable-card] {
        transition: none !important;
      }
      html[data-webos="true"] .tv-card-focused {
        transform: scale(1.02) !important;
      }
      html[data-webos="true"] [data-torrent-card].tv-card-focused,
      html[data-webos="true"] .torrent-poster.tv-card-focused,
      html[data-webos="true"] [data-settings-card].tv-card-focused {
        animation: none !important;
      }
    ` + TV_PLATFORM_PERF_CSS + MOBILE_TOUCH_CSS;

    // Version sans :has() pour les navigateurs plus anciens
    if (!CSS.supports('selector(:has(*))')) {
      style.textContent = `
        body {
          --tv-focus-color: rgba(255, 255, 255, 0.75);
          --tv-focus-shadow: 0 4px 20px rgba(0, 0, 0, 0.45);
        }
        
        html:not([data-tv-platform="true"]) [data-torrent-card],
        html:not([data-tv-platform="true"]) .torrent-poster,
        html:not([data-tv-platform="true"]) [data-settings-card],
        html:not([data-tv-platform="true"]) [data-focusable-card] {
          transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, opacity 0.2s ease-out;
        }
        
        html:not([data-tv-platform="true"]) .tv-card-focused {
          transform: scale(1.08) !important;
          z-index: 10 !important;
          box-shadow: var(--tv-focus-shadow) !important;
        }
        
        html:not([data-tv-platform="true"]) [data-torrent-card].tv-card-focused,
        html:not([data-tv-platform="true"]) .torrent-poster.tv-card-focused,
        html:not([data-tv-platform="true"]) [data-settings-card].tv-card-focused {
          box-shadow: unset !important;
          outline: 2px solid rgba(255, 255, 255, 0.85) !important;
          outline-offset: -2px !important;
          border-radius: 0.5rem !important;
        }
        html:not([data-tv-platform="true"]) [data-settings-card].tv-card-focused {
          border-radius: var(--ds-radius-lg) !important;
        }
        
        html:not([data-tv-platform="true"]) .tv-element-focused,
        html:not([data-tv-platform="true"]) a:focus-visible,
        html:not([data-tv-platform="true"]) button:focus-visible,
        html:not([data-tv-platform="true"]) input:focus-visible,
        html:not([data-tv-platform="true"]) select:focus-visible,
        html:not([data-tv-platform="true"]) textarea:focus-visible,
        html:not([data-tv-platform="true"]) [tabindex]:focus-visible {
          outline: 2px solid var(--tv-focus-color) !important;
          outline-offset: -2px !important;
        }
        
        html:not([data-tv-platform="true"]) .tv-card-focused a:focus-visible,
        html:not([data-tv-platform="true"]) .tv-card-focused button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          animation: none !important;
        }
        
        html:not([data-tv-platform="true"]) a,
        html:not([data-tv-platform="true"]) button,
        html:not([data-tv-platform="true"]) input,
        html:not([data-tv-platform="true"]) select,
        html:not([data-tv-platform="true"]) textarea,
        html:not([data-tv-platform="true"]) [tabindex],
        html:not([data-tv-platform="true"]) [data-focusable] {
          transition: outline 0.15s ease-out, outline-offset 0.15s ease-out;
        }

        html[data-webos="true"] [data-torrent-card],
        html[data-webos="true"] .torrent-poster,
        html[data-webos="true"] [data-settings-card],
        html[data-webos="true"] [data-focusable-card] {
          transition: none !important;
        }
        html[data-webos="true"] .tv-card-focused {
          transform: scale(1.02) !important;
        }
        html[data-webos="true"] [data-torrent-card].tv-card-focused,
        html[data-webos="true"] .torrent-poster.tv-card-focused,
        html[data-webos="true"] [data-settings-card].tv-card-focused {
          animation: none !important;
        }
      ` + TV_PLATFORM_PERF_CSS + MOBILE_TOUCH_CSS;
    }

    if (!document.getElementById('tv-navigation-styles')) {
      document.head.appendChild(style);
    }

    // Gestionnaire pour le bouton retour webOS (peut être envoyé via différents événements)
    const handleWebOSBack = (e: Event) => {
      const event = e as KeyboardEvent | CustomEvent;
      // Si c'est un KeyboardEvent Backspace et que le focus est dans un champ de saisie, ne pas faire retour
      if (event instanceof KeyboardEvent && (event.key === 'Backspace' || event.keyCode === 8)) {
        const active = document.activeElement as HTMLElement | null;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
          return;
        }
        const tvKeyboard = active?.closest?.('[data-tv-keyboard]') as HTMLElement | null;
        if (tvKeyboard) {
          const backspaceBtn = tvKeyboard.querySelector<HTMLButtonElement>('[data-tv-keyboard-backspace]');
          if (backspaceBtn && !backspaceBtn.disabled) {
            backspaceBtn.click();
            e.preventDefault();
            e.stopPropagation();
            return;
          }
        }
      }
      // webOS peut envoyer un événement personnalisé ou un KeyboardEvent
      if (event.type === 'webosback' || (event instanceof KeyboardEvent && isTvBackKey(event))) {
        const modal = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
        if (modal) {
          const closeEvent = new CustomEvent('tv-back-button', { 
            bubbles: true, 
            cancelable: true,
            detail: { modal }
          });
          modal.dispatchEvent(closeEvent);
          if (!closeEvent.defaultPrevented) {
            // Si pas géré, essayer de fermer via le bouton de fermeture
            const closeBtn = modal.querySelector(TV_MODAL_CLOSE_SELECTOR) as HTMLElement;
            if (closeBtn) {
              closeBtn.click();
            }
          }
          e.preventDefault();
          e.stopPropagation();
        } else {
          // Même logique que Escape/Backspace : priorité aux handlers data-tv-back-handler (ex. MediaDetail)
          const handlers = Array.from(document.querySelectorAll('[data-tv-back-handler]')) as (HTMLElement & { _tvBack?: () => void })[];
          const active = document.activeElement;
          const containing = handlers.filter((el) => active && el.contains(active));
          const deepest = containing.length
            ? containing.reduce((a, b) => (a.contains(b) ? b : a))
            : null;
          if (deepest?._tvBack) {
            deepest._tvBack();
            e.preventDefault();
            e.stopPropagation();
          } else if (window.history.length > 1) {
            window.history.back();
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    // Invalider le cache carrousel quand le DOM du dashboard change (sync, infinite scroll, etc.)
    const mainForCarouselObserver = document.querySelector('main.app-main');
    const carouselDomObserver =
      mainForCarouselObserver &&
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          invalidateCarouselCachesForNode(m.target);
          m.addedNodes.forEach((n) => invalidateCarouselCachesForNode(n));
          m.removedNodes.forEach((n) => invalidateCarouselCachesForNode(n));
        }
      });
    if (carouselDomObserver && mainForCarouselObserver) {
      carouselDomObserver.observe(mainForCarouselObserver, { childList: true, subtree: true });
    }

    // Ajouter les event listeners
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleWebOSBack, true);
    // Écouter les événements webOS spécifiques si disponibles
    if (typeof window !== 'undefined' && (window as any).webOS) {
      document.addEventListener('webosback', handleWebOSBack);
    }
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Page Settings : après navigation (ou chargement), focus sur la première carte avec délai 1 s (l'utilisateur peut parcourir le menu)
    const SETTINGS_FOCUS_DELAY_MS = 1000;
    let settingsFocusTimeoutId: ReturnType<typeof setTimeout> | null = null;
    const maybeFocusSettingsContent = () => {
      if (typeof window === 'undefined') return;
      // Mobile : ne pas voler le focus (scale + scrollIntoView bloquent le swipe et le scroll).
      if (!isTvDoc()) return;
      const pathname = window.location.pathname.replace(/\/$/, '') || '/';
      if (!pathname.startsWith('/settings')) return;
      if (settingsFocusTimeoutId) {
        clearTimeout(settingsFocusTimeoutId);
        settingsFocusTimeoutId = null;
      }
      const run = () => {
        const first = getInitialFocusElement();
        if (first) focusElement(first);
      };
      settingsFocusTimeoutId = setTimeout(() => {
        settingsFocusTimeoutId = null;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            run();
            // Nouveau contenu possiblement rendu en différé (LazyCategoryPanel) : réessayer une fois
            setTimeout(run, 120);
          });
        });
      }, SETTINGS_FOCUS_DELAY_MS);
    };
    maybeFocusSettingsContent();
    window.addEventListener('popstate', maybeFocusSettingsContent);
    document.addEventListener('astro:page-load', maybeFocusSettingsContent);

    // Fiche média : focus Lire / Télécharger (pas Retour). Les séries gèrent le carrousel d’épisodes elles-mêmes.
    const maybeFocusMediaDetailPrimary = () => {
      if (typeof window === 'undefined') return;
      if (!isTvDoc()) return;
      if (window.location.pathname !== '/torrents') return;
      const params = new URLSearchParams(window.location.search);
      if (!params.get('slug') && !params.get('tmdbId')) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (document.querySelector('[data-episode-card]')) return;
          const primary =
            document.querySelector<HTMLElement>('[data-media-detail-primary-action]') ||
            document.querySelector<HTMLElement>('[data-media-detail-action="play"]') ||
            document.querySelector<HTMLElement>('[data-media-detail-action="download"]');
          if (primary) focusElement(primary);
        });
      });
    };
    const tMediaDetail = setTimeout(maybeFocusMediaDetailPrimary, 200);
    window.addEventListener('popstate', maybeFocusMediaDetailPrimary);
    document.addEventListener('astro:page-load', maybeFocusMediaDetailPrimary);

    const onBrowseCardActivate = (e: Event) => {
      if (!isTvDoc()) return;
      const el = (e.target as HTMLElement | null)?.closest?.('[data-tv-item-key]') as HTMLElement | null;
      if (el) saveTvBrowseRestoreFromElement(el);
    };
    document.addEventListener('click', onBrowseCardActivate, true);

    let browseRestoreTimeouts: ReturnType<typeof setTimeout>[] = [];
    const tryRestoreBrowseFocus = (): boolean => {
      if (!isTvDoc() || !isTvBrowsePath()) return false;
      const restore = peekTvBrowseRestore();
      if (!restore) return false;
      window.scrollTo(0, restore.scrollY);
      const card = findTvBrowseRestoreCard(restore.itemKey);
      if (!card) return false;
      const focusable = card.matches(FOCUSABLE_SELECTOR)
        ? card
        : card.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (!focusable) return false;
      focusElement(focusable);
      clearTvBrowseRestore();
      return true;
    };
    const scheduleBrowseRestore = () => {
      browseRestoreTimeouts.forEach(clearTimeout);
      browseRestoreTimeouts = [];
      if (!isTvDoc() || !isTvBrowsePath() || !peekTvBrowseRestore()) return;
      let attempts = 0;
      const tick = () => {
        if (tryRestoreBrowseFocus()) return;
        attempts += 1;
        if (attempts >= 16) {
          clearTvBrowseRestore();
          const first = getInitialFocusElement();
          if (first) focusElement(first);
          return;
        }
        browseRestoreTimeouts.push(setTimeout(tick, 120));
      };
      browseRestoreTimeouts.push(
        setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(tick)), 50)
      );
    };
    scheduleBrowseRestore();
    document.addEventListener('astro:page-load', scheduleBrowseRestore);

    return () => {
      if (settingsFocusTimeoutId) clearTimeout(settingsFocusTimeoutId);
      clearTimeout(tMediaDetail);
      browseRestoreTimeouts.forEach(clearTimeout);
      document.removeEventListener('click', onBrowseCardActivate, true);
      document.removeEventListener('astro:page-load', scheduleBrowseRestore);
      window.removeEventListener('popstate', maybeFocusMediaDetailPrimary);
      document.removeEventListener('astro:page-load', maybeFocusMediaDetailPrimary);
      window.removeEventListener('popstate', maybeFocusSettingsContent);
      document.removeEventListener('astro:page-load', maybeFocusSettingsContent);
      if (carouselDomObserver) carouselDomObserver.disconnect();
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleWebOSBack, true);
      if (typeof window !== 'undefined' && (window as any).webOS) {
        document.removeEventListener('webosback', handleWebOSBack);
      }
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
      
      const existingStyle = document.getElementById('tv-navigation-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  return null;
}
