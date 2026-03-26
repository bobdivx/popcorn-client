import { useEffect, useRef } from 'preact/hooks';
import { focusTVSidebarFirst } from '../../lib/tv/focus-tv-sidebar';

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
    // Sélecteur universel pour tous les éléments interactifs
    const FOCUSABLE_SELECTOR = `
      a[href]:not([disabled]):not([aria-hidden="true"]),
      button:not([disabled]):not([aria-hidden="true"]),
      input:not([disabled]):not([type="hidden"]),
      select:not([disabled]),
      textarea:not([disabled]),
      [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"]),
      [data-focusable]
    `.replace(/\s+/g, ' ').trim();

    // Sélecteurs pour les cartes (effet Netflix)
    const CARD_SELECTOR = '[data-torrent-card], .torrent-poster, [data-settings-card], [data-focusable-card]';
    const CAROUSEL_SELECTOR = '[data-carousel]';
    const SETTINGS_CONTAINER_SELECTOR = '[data-tv-settings-container]';
    const SITE_HEADER_SELECTOR = '[data-tv-site-header]';
    const APP_SIDEBAR_SELECTOR = '[data-tv-app-sidebar]';
    const DATA_TV_DASHBOARD_PIN = 'data-tv-dashboard-pin';

    const isTvDoc = () =>
      typeof document !== 'undefined' && document.documentElement.getAttribute('data-tv-platform') === 'true';

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
      const sidebar = document.querySelector(APP_SIDEBAR_SELECTOR);
      const dialog = document.querySelector('[role="dialog"]:not([aria-hidden="true"])');
      for (const r of [sidebar, dialog]) {
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
        // TV : sidebar fermée = pas de focus dans la barre (évite un rail « toujours là » + focus fantôme)
        if (
          isTvDoc() &&
          document.documentElement.getAttribute('data-tv-sidebar-open') !== 'true' &&
          el.closest(APP_SIDEBAR_SELECTOR)
        ) {
          return false;
        }
        const rect = el.getBoundingClientRect();
        if (rectForSort) {
          rectForSort.set(el, { left: rect.left, top: rect.top });
        }
        const inViewportX = rect.right >= -pad && rect.left <= window.innerWidth + pad;
        const inViewportY = rect.bottom >= -pad - aboveViewport && rect.top <= window.innerHeight + pad + belowViewport;
        if (rect.width <= 0 || rect.height <= 0 || !inViewportX || !inViewportY) return false;
        if (el.closest('[aria-hidden="true"]')) return false;
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

    /** TV : flèche gauche depuis l’élément le plus à gauche du main (hors carrousel, ex. hero) → ouvrir la sidebar. */
    const tryFocusSidebarFromLeftmost = (activeElement: HTMLElement): boolean => {
      if (!isTvDoc() || !activeElement) return false;
      const mainEl = document.querySelector('main.app-main');
      if (!mainEl || !mainEl.contains(activeElement)) return false;
      if (activeElement.closest(CAROUSEL_SELECTOR)) return false;
      const list = getFocusableElements(mainEl as HTMLElement);
      if (list.length === 0) return false;
      const sorted = [...list].sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.left - rb.left || ra.top - rb.top;
      });
      if (sorted[0] === activeElement) {
        return focusTVSidebarFirst();
      }
      return false;
    };

    /** TV : sur /dashboard la sidebar reste ouverte (même quand le focus est dans le contenu). */
    const syncDashboardSidebarPin = () => {
      if (!isTvDoc()) return;
      const path = typeof window !== 'undefined' ? window.location.pathname.replace(/\/$/, '') || '/' : '/';
      if (path === '/dashboard') {
        document.documentElement.setAttribute(DATA_TV_DASHBOARD_PIN, 'true');
        document.documentElement.setAttribute('data-tv-sidebar-open', 'true');
      } else {
        document.documentElement.removeAttribute(DATA_TV_DASHBOARD_PIN);
        const sidebar = document.querySelector(APP_SIDEBAR_SELECTOR);
        const ae = document.activeElement as HTMLElement | null;
        // Toujours fermer la barre en quittant /dashboard sauf si le focus est encore dans la sidebar
        // (activeElement peut être null pendant une transition Astro — avant : l’attribut restait bloqué « ouvert »)
        if (!sidebar || !ae || ae === document.body || !sidebar.contains(ae)) {
          document.documentElement.removeAttribute('data-tv-sidebar-open');
        }
      }
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
      // Dans un carousel : gauche/droite dans le même carrousel (la barre d’app est gérée dans navigate → focusTVSidebarFirst)
      const currentCarousel = current.closest(CAROUSEL_SELECTOR);
      if (currentCarousel && (direction === 'left' || direction === 'right')) {
        return elements.filter((el) => currentCarousel.contains(el));
      }
      // Depuis un carousel, haut/bas : exclure le FAB et autres [data-tv-nav-skip] pour garder le focus dans les lignes
      if (currentCarousel && (direction === 'up' || direction === 'down')) {
        return elements.filter((el) => !el.closest(FAB_SKIP_SELECTOR));
      }
      // Menu paramètres (nav) sur TV : flèche gauche → barre d’app (hors [data-tv-settings-container])
      const settingsNav = current.closest('[data-tv-settings-nav]');
      const settingsContainerForNav = current.closest(SETTINGS_CONTAINER_SELECTOR);
      if (settingsNav && settingsContainerForNav && direction === 'left' && isTvDoc()) {
        const appSidebar = document.querySelector(APP_SIDEBAR_SELECTOR);
        if (appSidebar) {
          return elements.filter((el) => settingsContainerForNav.contains(el) || appSidebar.contains(el));
        }
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
      const candidates = getCandidatesForDirection(current, elements, direction);

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

      // Seuils pour déterminer si un élément est dans la bonne direction
      const DIRECTION_THRESHOLD = 5;
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
    const FOCUS_ANCHOR_RATIO = 0.18;
    const getFocusAnchorX = () => typeof window !== 'undefined' ? window.innerWidth * FOCUS_ANCHOR_RATIO : 120;

    // Carousel : on scroll pour que la carte focusée soit à la position d'ancrage (focus fixe, carousel qui bouge).
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

      // TV / webOS : éviter d’écrire scrollLeft si quasi inchangé (reflow coûteux)
      if (isInstantScroll && Math.abs(carousel.scrollLeft - newScrollLeft) < 4) {
        return;
      }

      if (isInstantScroll) {
        carousel.scrollLeft = newScrollLeft;
      } else {
        carousel.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
      }
    };

    // Focus un élément
    const focusElement = (element: HTMLElement) => {
      const inHeroDashboard = element.closest('.hero-dashboard');
      // TV / webOS : éviter scrollIntoView(center) coûteux ; nearest limite les reflows.
      const scrollOpts =
        isInstantScroll || inHeroDashboard
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

      if (scope) return focusableElements[0];

      // TV + Dashboard : commencer sur le hero (évite de scroller vers les carrousels et de « perdre » le bandeau)
      if (isTvDoc() && typeof window !== 'undefined') {
        const path = window.location.pathname.replace(/\/$/, '') || '/';
        if (path === '/dashboard') {
          const heroBtn = document.querySelector<HTMLElement>('.hero-dashboard button[data-focusable]');
          if (heroBtn && focusableElements.includes(heroBtn)) return heroBtn;
        }
      }

      // Page Media Detail : priorité au bouton Retour pour que la télécommande y accède (flèches ou premier focus)
      const mediaDetailBack = document.querySelector<HTMLElement>('[data-media-detail-back]');
      if (mediaDetailBack && focusableElements.includes(mediaDetailBack)) return mediaDetailBack;

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

      const carouselEl = activeElement?.closest(CAROUSEL_SELECTOR) as HTMLElement | null;

      let focusableElements: HTMLElement[] | undefined;

      // TV : carte la plus à gauche + flèche gauche → barre latérale (un seul getFocusableElements quand scope === carrousel)
      if (
        !scope &&
        isTvDoc() &&
        direction === 'left' &&
        activeElement &&
        activeElement !== document.body &&
        carouselEl
      ) {
        if (effectiveScope === carouselEl) {
          focusableElements = getFocusableElements(carouselEl);
          if (focusableElements.length > 0 && focusableElements[0] === activeElement && focusTVSidebarFirst()) {
            return true;
          }
        } else {
          const inCarousel = getFocusableElements(carouselEl);
          if (inCarousel.length > 0 && inCarousel[0] === activeElement && focusTVSidebarFirst()) {
            return true;
          }
        }
      }

      if (focusableElements === undefined) {
        focusableElements = getFocusableElements(effectiveScope);
      }

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

      if (
        !scope &&
        isTvDoc() &&
        direction === 'left' &&
        activeElement &&
        activeElement !== document.body &&
        tryFocusSidebarFromLeftmost(activeElement)
      ) {
        return true;
      }

      return false;
    };

    // Gestionnaire de touches
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      
      // Détecter le bouton retour (webOS, Android TV, etc.)
      const isBackButton = e.key === 'Escape' || 
                          e.key === 'Backspace' || 
                          e.keyCode === 8 || // Backspace
                          e.keyCode === 27 || // Escape
                          (e.key === 'BrowserBack' || e.key === 'GoBack'); // Certains navigateurs TV
      
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

      // Modal ouverte : navigation D-pad limitée à l'intérieur de la modal (piège à focus)
      const modal = document.querySelector<HTMLElement>('[role="dialog"]:not([aria-hidden="true"])');
      if (modal && !isBackButton) {
        const focusInModal = modal.contains(document.activeElement);
        if (focusInModal && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
          const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right';
          const handled = navigate(dir, modal);
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
          }
          return;
        }
        if (focusInModal) {
          // Enter, Space : laisser passer au switch ci-dessous
        } else {
          return; // Focus hors modal = ne pas naviguer dans la page
        }
      }

      // TV : touche Menu / ContextMenu / Android KEYCODE_MENU (82) → focus navigation latérale
      if (
        document.documentElement.getAttribute('data-tv-platform') === 'true' &&
        !modal &&
        (e.key === 'ContextMenu' ||
          e.key === 'Menu' ||
          (e as KeyboardEvent & { keyCode?: number }).keyCode === 82)
      ) {
        if (focusTVSidebarFirst()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      // Ignorer si player vidéo actif
      if (document.querySelector('.hls-player-container:focus-within')) {
        return;
      }

      if (
        isWebOS &&
        (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        const now = performance.now();
        if (e.repeat && now - lastWebosArrowAt < WEBOS_ARROW_REPEAT_MS) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        lastWebosArrowAt = now;
      }

      let handled = false;

      switch (e.key) {
        case 'ArrowLeft': {
          // Settings : depuis le contenu, la flèche gauche ramène toujours au menu latéral
          const settingsContainer = document.querySelector(SETTINGS_CONTAINER_SELECTOR);
          const contentArea = document.querySelector('[data-tv-settings-content]');
          const nav = document.querySelector<HTMLElement>('[data-tv-settings-nav]');
          const active = document.activeElement as HTMLElement;
          if (settingsContainer && contentArea && nav && active && contentArea.contains(active)) {
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
          if (!handled) {
            // Navigation synchrone pour savoir si un déplacement a eu lieu (fallback barre d’app géré dans getCandidatesForDirection)
            const moved = navigate('left');
            handled = moved;
          }
          break;
        }
        case 'ArrowRight':
          handled = scheduleOrRunNavigate('right');
          break;
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
            const closeBtn = modal.querySelector('[aria-label*="Close"], [aria-label*="Fermer"], [aria-label*="close"], [data-close], .close-button, button[aria-label*="Close"], button[aria-label*="Fermer"]') as HTMLElement;
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

      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // Gestionnaire de focus pour effet visuel + état barre latérale TV (masquée si le focus est dans le contenu)
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (isTvDoc() && target) {
        const sidebar = document.querySelector(APP_SIDEBAR_SELECTOR);
        const pinDashboard = document.documentElement.getAttribute(DATA_TV_DASHBOARD_PIN) === 'true';
        if (sidebar?.contains(target)) {
          document.documentElement.setAttribute('data-tv-sidebar-open', 'true');
        } else if (!pinDashboard) {
          document.documentElement.removeAttribute('data-tv-sidebar-open');
        }
      }
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

    /** Toutes les plateformes TV : pas de pulse/scale/transitions lourdes (Android TV, Apple TV, webOS…). */
    const TV_PLATFORM_PERF_CSS = `
      html[data-tv-platform="true"] [data-torrent-card],
      html[data-tv-platform="true"] .torrent-poster,
      html[data-tv-platform="true"] [data-settings-card],
      html[data-tv-platform="true"] [data-focusable-card] {
        transition: none !important;
      }
      html[data-tv-platform="true"] .tv-card-focused {
        transform: none !important;
        box-shadow: none !important;
      }
      html[data-tv-platform="true"] [data-torrent-card].tv-card-focused,
      html[data-tv-platform="true"] .torrent-poster.tv-card-focused,
      html[data-tv-platform="true"] [data-settings-card].tv-card-focused {
        animation: none !important;
        outline: 3px solid rgba(255, 255, 255, 0.55) !important;
        outline-offset: 2px !important;
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
      html[data-tv-platform="true"] .tv-element-focused,
      html[data-tv-platform="true"] a:focus-visible,
      html[data-tv-platform="true"] button:focus-visible,
      html[data-tv-platform="true"] input:focus-visible,
      html[data-tv-platform="true"] select:focus-visible,
      html[data-tv-platform="true"] textarea:focus-visible,
      html[data-tv-platform="true"] [tabindex]:focus-visible {
        animation: none !important;
        box-shadow: none !important;
      }
      html[data-tv-platform="true"] a,
      html[data-tv-platform="true"] button,
      html[data-tv-platform="true"] input,
      html[data-tv-platform="true"] [data-focusable] {
        transition: none !important;
      }
    `;

    // Styles CSS pour la navigation TV
    const style = document.createElement('style');
    style.id = 'tv-navigation-styles';
    style.textContent = `
      /* Marquer le body comme TV active — halo blanc (même norme que cartes) */
      body {
        --tv-focus-color: rgba(255, 255, 255, 0.4);
        --tv-focus-shadow: 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.4);
      }
      
      /* Style pour les cartes (torrent, settings) */
      [data-torrent-card],
      .torrent-poster,
      [data-settings-card],
      [data-focusable-card] {
        transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, opacity 0.2s ease-out;
      }
      
      /* Effet Netflix pour cartes focusées */
      .tv-card-focused {
        transform: scale(1.08) !important;
        z-index: 50 !important;
        box-shadow: var(--tv-focus-shadow) !important;
      }
      
      /* Cartes torrent / poster : halo blanc scintillant (pas de box-shadow violet) */
      [data-torrent-card].tv-card-focused,
      .torrent-poster.tv-card-focused,
      [data-settings-card].tv-card-focused {
        box-shadow: unset !important;
        outline: 4px solid rgba(255, 255, 255, 0.4) !important;
        outline-offset: 4px !important;
        border-radius: 0.5rem !important;
        animation: tv-halo-pulse 2s ease-in-out infinite !important;
      }
      [data-settings-card].tv-card-focused {
        border-radius: var(--ds-radius-lg) !important;
      }
      [data-torrent-card]:focus-visible,
      [data-torrent-card]:focus-within,
      .torrent-poster:focus-visible,
      .torrent-poster:focus-within {
        outline: 2px solid rgba(255, 255, 255, 0.4) !important;
        outline-offset: 2px !important;
        border-radius: 0.5rem !important;
        box-shadow: 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.4) !important;
        animation: tv-halo-pulse 2s ease-in-out infinite !important;
      }
      
      /* Cartes adjacentes assombries */
      [data-carousel]:has(.tv-card-focused) [data-torrent-card]:not(.tv-card-focused),
      [data-carousel]:has(.tv-card-focused) .torrent-poster:not(.tv-card-focused),
      .grid:has(.tv-card-focused) [data-settings-card]:not(.tv-card-focused):not(:focus-within) {
        opacity: 0.7;
      }
      
      /* Focus visible global : halo blanc scintillant (boutons, liens, inputs) */
      .tv-element-focused,
      a:focus-visible,
      button:focus-visible,
      input:focus-visible,
      select:focus-visible,
      textarea:focus-visible,
      [tabindex]:focus-visible {
        outline: 3px solid var(--tv-focus-color) !important;
        outline-offset: 2px !important;
        box-shadow: 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.4) !important;
        animation: tv-halo-pulse 2s ease-in-out infinite !important;
      }
      
      /* Masquer le halo sur les éléments à l’intérieur des cartes (le halo est sur la carte) */
      .tv-card-focused a:focus-visible,
      .tv-card-focused button:focus-visible,
      [data-torrent-card] a:focus-visible,
      [data-torrent-card] button:focus-visible,
      .torrent-poster a:focus-visible,
      .torrent-poster button:focus-visible {
        outline: none !important;
        box-shadow: none !important;
        animation: none !important;
      }
      
      /* Animation de transition pour le focus */
      a, button, input, select, textarea, [tabindex], [data-focusable] {
        transition: outline 0.15s ease-out, outline-offset 0.15s ease-out;
      }

      /* webOS : GPU / CPU limités — pas d’animation infinie, zoom léger, transitions désactivées */
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
      html[data-webos="true"] .tv-element-focused,
      html[data-webos="true"] a:focus-visible,
      html[data-webos="true"] button:focus-visible,
      html[data-webos="true"] input:focus-visible,
      html[data-webos="true"] select:focus-visible,
      html[data-webos="true"] textarea:focus-visible,
      html[data-webos="true"] [tabindex]:focus-visible {
        animation: none !important;
      }
      html[data-webos="true"] a,
      html[data-webos="true"] button,
      html[data-webos="true"] input,
      html[data-webos="true"] [data-focusable] {
        transition: none !important;
      }
    ` + TV_PLATFORM_PERF_CSS;

    // Version sans :has() pour les navigateurs plus anciens
    if (!CSS.supports('selector(:has(*))')) {
      style.textContent = `
        body {
          --tv-focus-color: rgba(255, 255, 255, 0.4);
          --tv-focus-shadow: 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.4);
        }
        
        [data-torrent-card],
        .torrent-poster,
        [data-settings-card],
        [data-focusable-card] {
          transition: transform 0.2s ease-out, box-shadow 0.2s ease-out, opacity 0.2s ease-out;
        }
        
        .tv-card-focused {
          transform: scale(1.08) !important;
          z-index: 50 !important;
          box-shadow: var(--tv-focus-shadow) !important;
        }
        
        [data-torrent-card].tv-card-focused,
        .torrent-poster.tv-card-focused,
        [data-settings-card].tv-card-focused {
          box-shadow: unset !important;
          outline: 4px solid rgba(255, 255, 255, 0.4) !important;
          outline-offset: 4px !important;
          border-radius: 0.5rem !important;
          animation: tv-halo-pulse 2s ease-in-out infinite !important;
        }
        [data-settings-card].tv-card-focused {
          border-radius: var(--ds-radius-lg) !important;
        }
        
        .tv-element-focused,
        a:focus-visible,
        button:focus-visible,
        input:focus-visible,
        select:focus-visible,
        textarea:focus-visible,
        [tabindex]:focus-visible {
          outline: 3px solid var(--tv-focus-color) !important;
          outline-offset: 2px !important;
          box-shadow: 0 4px 20px rgba(255, 255, 255, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.4) !important;
          animation: tv-halo-pulse 2s ease-in-out infinite !important;
        }
        
        .tv-card-focused a:focus-visible,
        .tv-card-focused button:focus-visible {
          outline: none !important;
          box-shadow: none !important;
          animation: none !important;
        }
        
        a, button, input, select, textarea, [tabindex], [data-focusable] {
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
        html[data-webos="true"] .tv-element-focused,
        html[data-webos="true"] a:focus-visible,
        html[data-webos="true"] button:focus-visible,
        html[data-webos="true"] input:focus-visible,
        html[data-webos="true"] select:focus-visible,
        html[data-webos="true"] textarea:focus-visible,
        html[data-webos="true"] [tabindex]:focus-visible {
          animation: none !important;
        }
        html[data-webos="true"] a,
        html[data-webos="true"] button,
        html[data-webos="true"] input,
        html[data-webos="true"] [data-focusable] {
          transition: none !important;
        }
      ` + TV_PLATFORM_PERF_CSS;
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
      }
      // webOS peut envoyer un événement personnalisé ou un KeyboardEvent
      if (event.type === 'webosback' || (event instanceof KeyboardEvent && (event.key === 'Backspace' || event.key === 'Escape'))) {
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
            const closeBtn = modal.querySelector('[aria-label*="Fermer"], [aria-label*="Close"], button[aria-label*="Fermer"]') as HTMLElement;
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

    syncDashboardSidebarPin();
    window.addEventListener('popstate', syncDashboardSidebarPin);
    document.addEventListener('astro:page-load', syncDashboardSidebarPin);

    // Page Media Detail : focus initial sur le bouton Retour à l'arrivée (télécommande)
    const maybeFocusMediaDetailBack = () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname !== '/torrents' || !new URLSearchParams(window.location.search).get('slug')) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const back = document.querySelector<HTMLElement>('[data-media-detail-back]');
          if (back) focusElement(back);
        });
      });
    };
    const tMediaDetail = setTimeout(maybeFocusMediaDetailBack, 200);
    window.addEventListener('popstate', maybeFocusMediaDetailBack);
    document.addEventListener('astro:page-load', maybeFocusMediaDetailBack);

    return () => {
      if (settingsFocusTimeoutId) clearTimeout(settingsFocusTimeoutId);
      clearTimeout(tMediaDetail);
      window.removeEventListener('popstate', maybeFocusMediaDetailBack);
      document.removeEventListener('astro:page-load', maybeFocusMediaDetailBack);
      window.removeEventListener('popstate', maybeFocusSettingsContent);
      document.removeEventListener('astro:page-load', maybeFocusSettingsContent);
      window.removeEventListener('popstate', syncDashboardSidebarPin);
      document.removeEventListener('astro:page-load', syncDashboardSidebarPin);
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
