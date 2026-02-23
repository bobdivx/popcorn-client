import { useEffect, useRef } from 'preact/hooks';

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

    // Obtenir tous les éléments focusables visibles (optionnellement limités à un conteneur, ex. modal)
    // Exclut les éléments hors viewport. Sur webOS on évite getComputedStyle pour réduire la latence.
    const getFocusableElements = (scope?: HTMLElement | null): HTMLElement[] => {
      const root = scope || document;
      const pad = 1;
      // Zone sous l’écran pour inclure la ligne suivante (dashboard Films/Séries) et permettre flèche bas
      const belowViewport = typeof window !== 'undefined' ? Math.min(500, window.innerHeight * 0.6) : 0;
      const isWebOSCheck = typeof document !== 'undefined' && document.documentElement.getAttribute('data-webos') === 'true';
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => {
          if (scope && !scope.contains(el)) return false;
          const rect = el.getBoundingClientRect();
          const inViewportX = rect.right >= -pad && rect.left <= window.innerWidth + pad;
          const inViewportY = rect.bottom >= -pad && rect.top <= window.innerHeight + pad + belowViewport;
          if (rect.width <= 0 || rect.height <= 0 || !inViewportX || !inViewportY) return false;
          if (el.closest('[aria-hidden="true"]') || el.closest('.hidden')) return false;
          if (!isWebOSCheck) {
            const style = window.getComputedStyle(el);
            if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
          }
          return true;
        });
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
      // Dans un carousel : gauche/droite uniquement dans le MÊME carousel (éviter de sauter à la ligne du dessous)
      const currentCarousel = current.closest(CAROUSEL_SELECTOR);
      if (currentCarousel && (direction === 'left' || direction === 'right')) {
        return elements.filter((el) => currentCarousel.contains(el));
      }
      // Depuis un carousel, haut/bas : exclure le FAB et autres [data-tv-nav-skip] pour garder le focus dans les lignes
      if (currentCarousel && (direction === 'up' || direction === 'down')) {
        return elements.filter((el) => !el.closest(FAB_SKIP_SELECTOR));
      }
      // À l'intérieur du menu settings : gauche/droite uniquement dans le même conteneur
      const settingsContainer = current.closest(SETTINGS_CONTAINER_SELECTOR);
      if (settingsContainer && (direction === 'left' || direction === 'right')) {
        return elements.filter((el) => settingsContainer.contains(el));
      }
      return elements;
    };

    // Trouver l'élément le plus proche dans une direction
    const findClosestElement = (
      current: HTMLElement,
      elements: HTMLElement[],
      direction: 'up' | 'down' | 'left' | 'right'
    ): HTMLElement | null => {
      const candidates = getCandidatesForDirection(current, elements, direction);

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

    // Sur webOS, scroll instantané pour une navigation plus fluide (smooth = lag sur TV)
    const isWebOS = typeof document !== 'undefined' && document.documentElement.getAttribute('data-webos') === 'true';
    const scrollBehavior: ScrollBehavior = isWebOS ? 'auto' : 'smooth';

    // Sur webOS : exécuter la navigation en rAF pour réduire la latence perçue (touche renvoyée tout de suite)
    const scheduleOrRunNavigate = (direction: 'up' | 'down' | 'left' | 'right', scope?: HTMLElement | null): boolean => {
      if (isWebOS) {
        requestAnimationFrame(() => navigate(direction, scope));
        return true;
      }
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

      if (isWebOS) {
        carousel.scrollLeft = newScrollLeft;
      } else {
        carousel.scrollTo({ left: newScrollLeft, behavior: 'smooth' });
      }
    };

    // Focus un élément
    const focusElement = (element: HTMLElement) => {
      const scrollOpts = { behavior: scrollBehavior, block: 'center' as ScrollLogicalPosition, inline: 'center' as ScrollLogicalPosition };
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

      // Page Media Detail : priorité au bouton Retour pour que la télécommande y accède (flèches ou premier focus)
      const mediaDetailBack = document.querySelector<HTMLElement>('[data-media-detail-back]');
      if (mediaDetailBack && focusableElements.includes(mediaDetailBack)) return mediaDetailBack;

      // Page Settings : sur la vue d'ensemble (/settings sans category), priorité au contenu (première carte)
      const settingsContainer = document.querySelector(SETTINGS_CONTAINER_SELECTOR);
      if (settingsContainer) {
        const contentArea = document.querySelector('[data-tv-settings-content]');
        const inContainer = focusableElements.filter((el) => settingsContainer.contains(el));
        const isOverview = typeof window !== 'undefined' && window.location.pathname === '/settings' && !new URLSearchParams(window.location.search).get('category');
        if (isOverview && contentArea && inContainer.length > 0) {
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
      // Sur webOS / TV : en carousel, gauche/droite uniquement dans le carousel courant → moins d’éléments à traiter, moins de latence
      let effectiveScope = scope;
      if (!effectiveScope && activeElement && (direction === 'left' || direction === 'right')) {
        const carousel = activeElement.closest(CAROUSEL_SELECTOR) as HTMLElement | null;
        if (carousel) effectiveScope = carousel;
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
      const nextElement = findClosestElement(activeElement, candidates, direction);
      if (nextElement) {
        focusElement(nextElement);
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

      // Ignorer si player vidéo actif
      if (document.querySelector('.hls-player-container:focus-within')) {
        return;
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
          if (!handled) handled = scheduleOrRunNavigate('left');
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

    // Gestionnaire de focus pour effet visuel
    const handleFocusIn = (e: FocusEvent) => {
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
      .torrent-poster.tv-card-focused {
        box-shadow: unset !important;
        outline: 4px solid rgba(255, 255, 255, 0.4) !important;
        outline-offset: 4px !important;
        border-radius: 0.5rem !important;
        animation: tv-halo-pulse 2s ease-in-out infinite !important;
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
    `;

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
        .torrent-poster.tv-card-focused {
          box-shadow: unset !important;
          outline: 4px solid rgba(255, 255, 255, 0.4) !important;
          outline-offset: 4px !important;
          border-radius: 0.5rem !important;
          animation: tv-halo-pulse 2s ease-in-out infinite !important;
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
      `;
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

    // Ajouter les event listeners
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleWebOSBack, true);
    // Écouter les événements webOS spécifiques si disponibles
    if (typeof window !== 'undefined' && (window as any).webOS) {
      document.addEventListener('webosback', handleWebOSBack);
    }
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);

    // Page Settings vue d'ensemble : focus initial sur le contenu (première carte) à l'arrivée
    const maybeFocusSettingsOverview = () => {
      if (typeof window === 'undefined') return;
      if (window.location.pathname !== '/settings' || new URLSearchParams(window.location.search).get('category')) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const first = getInitialFocusElement();
          if (first) focusElement(first);
        });
      });
    };
    maybeFocusSettingsOverview();
    window.addEventListener('popstate', maybeFocusSettingsOverview);
    document.addEventListener('astro:page-load', maybeFocusSettingsOverview);

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
      clearTimeout(tMediaDetail);
      window.removeEventListener('popstate', maybeFocusMediaDetailBack);
      document.removeEventListener('astro:page-load', maybeFocusMediaDetailBack);
      window.removeEventListener('popstate', maybeFocusSettingsOverview);
      document.removeEventListener('astro:page-load', maybeFocusSettingsOverview);
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
