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
    const getFocusableElements = (scope?: HTMLElement | null): HTMLElement[] => {
      const root = scope || document;
      return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => {
          if (scope && !scope.contains(el)) return false;
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            !el.closest('[aria-hidden="true"]') &&
            !el.closest('.hidden')
          );
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

    // Sur la page Settings : restreindre gauche/droite au conteneur (éviter que "droite" aille au header)
    const getCandidatesForDirection = (
      current: HTMLElement,
      elements: HTMLElement[],
      direction: 'up' | 'down' | 'left' | 'right'
    ): HTMLElement[] => {
      const settingsContainer = current.closest(SETTINGS_CONTAINER_SELECTOR);
      if (!settingsContainer || (direction !== 'left' && direction !== 'right')) {
        return elements;
      }
      // À l'intérieur du menu settings : gauche/droite uniquement dans le même conteneur
      return elements.filter((el) => settingsContainer.contains(el));
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
          // Entrer dans un nouveau carousel, trouver la première carte visible
          const cardsInCarousel = Array.from(targetCarousel.querySelectorAll<HTMLElement>(CARD_SELECTOR))
            .filter(el => {
              const rect = el.getBoundingClientRect();
              return rect.width > 0 && rect.height > 0 && rect.left >= 0 && rect.right <= window.innerWidth;
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

    // Sur webOS, scrollIntoView ne fait pas défiler le carousel (overflow-x) : on scroll le conteneur à la main
    const scrollCarouselToElement = (carousel: HTMLElement, el: HTMLElement) => {
      const elRect = el.getBoundingClientRect();
      const carouselRect = carousel.getBoundingClientRect();
      const elementLeftInScroll = elRect.left - carouselRect.left + carousel.scrollLeft;
      const centerOffset = (carousel.clientWidth / 2) - (elRect.width / 2);
      let newScrollLeft = elementLeftInScroll - centerOffset;
      const maxScroll = carousel.scrollWidth - carousel.clientWidth;
      newScrollLeft = Math.max(0, Math.min(maxScroll, newScrollLeft));
      carousel.scrollLeft = newScrollLeft;
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
          if (isWebOS && carousel) scrollCarouselToElement(carousel, card);
          else element.scrollIntoView(scrollOpts);
          lastFocusedRef.current = element;
          return;
        }

        const focusable = card.querySelector(FOCUSABLE_SELECTOR) as HTMLElement;
        if (focusable) {
          focusable.focus();
          if (isWebOS && carousel) scrollCarouselToElement(carousel, card);
          else focusable.scrollIntoView(scrollOpts);
          lastFocusedRef.current = focusable;
          return;
        }

        if (!card.hasAttribute('tabindex')) {
          card.setAttribute('tabindex', '0');
        }
        card.focus();
        if (isWebOS && carousel) scrollCarouselToElement(carousel, card);
        else card.scrollIntoView(scrollOpts);
        lastFocusedRef.current = card;
        return;
      }

      element.focus();
      if (isWebOS && carousel) scrollCarouselToElement(carousel, targetToScroll);
      else element.scrollIntoView(scrollOpts);

      lastFocusedRef.current = element;
    };

    // Appliquer l'effet visuel
    const applyFocusEffect = (element: HTMLElement) => {
      // Retirer l'effet des autres éléments
      document.querySelectorAll('.tv-card-focused').forEach(el => {
        el.classList.remove('tv-card-focused');
      });
      document.querySelectorAll('.tv-element-focused').forEach(el => {
        el.classList.remove('tv-element-focused');
      });
      
      // Appliquer l'effet approprié
      const card = element.closest(CARD_SELECTOR) as HTMLElement;
      if (card) {
        card.classList.add('tv-card-focused');
      } else {
        element.classList.add('tv-element-focused');
      }
    };

    // Retirer l'effet visuel
    const removeFocusEffect = (element: HTMLElement) => {
      const card = element.closest(CARD_SELECTOR) as HTMLElement;
      if (card) {
        card.classList.remove('tv-card-focused');
      }
      element.classList.remove('tv-element-focused');
    };

    // Premier élément à focuser (selon la page ou la modal)
    const getInitialFocusElement = (scope?: HTMLElement | null): HTMLElement | null => {
      const focusableElements = getFocusableElements(scope);
      if (focusableElements.length === 0) return null;

      if (scope) return focusableElements[0];

      // Page Settings : priorité au premier élément du menu (nav) des paramètres
      const settingsContainer = document.querySelector(SETTINGS_CONTAINER_SELECTOR);
      if (settingsContainer) {
        const nav = settingsContainer.querySelector('[data-tv-settings-nav]');
        const inContainer = focusableElements.filter((el) => settingsContainer.contains(el));
        if (nav && inContainer.length > 0) {
          const firstInNav = inContainer.find((el) => nav.contains(el));
          if (firstInNav) return firstInNav;
          return inContainer[0];
        }
        if (inContainer.length > 0) return inContainer[0];
      }

      // Priorité aux cartes sur les autres pages
      const firstCard = document.querySelector(`${CARD_SELECTOR} a, ${CARD_SELECTOR} button`) as HTMLElement;
      if (firstCard) return firstCard;
      return focusableElements[0];
    };

    // Navigation dans une direction (scope optionnel = modal ou conteneur pour piège à focus, fromEl = élément de référence pour la recherche spatiale, ex. input qu'on quitte)
    const navigate = (direction: 'up' | 'down' | 'left' | 'right', scope?: HTMLElement | null, fromEl?: HTMLElement | null): boolean => {
      const focusableElements = getFocusableElements(scope);
      if (focusableElements.length === 0) return false;

      const activeElement = (fromEl ?? document.activeElement) as HTMLElement;
      
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
        case 'ArrowLeft':
          handled = navigate('left');
          break;
        case 'ArrowRight':
          handled = navigate('right');
          break;
        case 'ArrowUp':
          handled = navigate('up');
          break;
        case 'ArrowDown':
          handled = navigate('down');
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
        } else if (window.history.length > 1) {
          window.history.back();
          e.preventDefault();
          e.stopPropagation();
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

    // Pas de focus initial au chargement : l'indicateur de position (focus) n'apparaît
    // qu'au premier mouvement sur la télécommande (flèches). navigate() focusera
    // le premier élément adapté dès la première touche directionnelle.

    return () => {
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
