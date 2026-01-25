import { useEffect, useRef } from 'preact/hooks';

// Constantes pour l'algorithme de navigation spatiale
const DIRECTION_THRESHOLD_PX = 5; // Seuil en pixels pour considérer qu'un élément est dans une direction
const SECONDARY_AXIS_PENALTY = 2; // Pénalité pour la distance sur l'axe secondaire
const INITIAL_FOCUS_DELAY_MS = 100; // Délai initial avant de tenter le focus

// Sélecteur CSS pour les éléments focusables
const FOCUSABLE_SELECTOR = `a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable]`;

// Sélecteur pour les cartes de contenu (priorité pour le focus initial)
const CONTENT_CARD_SELECTOR = `[data-torrent-card] a, [data-torrent-card] button, .torrent-poster a, .torrent-poster button, [data-focusable]`;

/**
 * Fournisseur de navigation TV global
 * Gère la navigation au clavier/D-pad pour toute l'application
 * Compatible avec webOS, Android TV, et autres plateformes TV
 */
export default function TVNavigationProvider() {
  // Cache des éléments focusables pour optimiser les performances
  const focusableCacheRef = useRef<HTMLElement[]>([]);
  const cacheValidRef = useRef(false);

  useEffect(() => {
    // Invalider le cache quand le DOM change
    const invalidateCache = () => {
      cacheValidRef.current = false;
    };

    // Observer les changements du DOM pour invalider le cache
    const mutationObserver = new MutationObserver(invalidateCache);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'tabindex', 'aria-hidden', 'style', 'class'],
    });

    // Obtenir tous les éléments focusables visibles (avec cache)
    const getFocusableElements = (): HTMLElement[] => {
      if (cacheValidRef.current && focusableCacheRef.current.length > 0) {
        return focusableCacheRef.current;
      }

      const elements = Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
        .filter(el => {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            style.opacity !== '0' &&
            rect.width > 0 &&
            rect.height > 0 &&
            !el.closest('[aria-hidden="true"]') &&
            !el.closest('.hidden')
          );
        });

      focusableCacheRef.current = elements;
      cacheValidRef.current = true;
      return elements;
    };

    // Trouver l'élément le plus proche dans une direction
    const findClosestElement = (
      current: HTMLElement,
      elements: HTMLElement[],
      direction: 'up' | 'down' | 'left' | 'right'
    ): HTMLElement | null => {
      const currentRect = current.getBoundingClientRect();
      const currentCenterX = currentRect.left + currentRect.width / 2;
      const currentCenterY = currentRect.top + currentRect.height / 2;
      const currentCarousel = current.closest('[data-carousel]');

      let bestElement: HTMLElement | null = null;
      let bestScore = Infinity;

      for (const el of elements) {
        if (el === current) continue;

        const rect = el.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        // Vérifier si l'élément est dans la bonne direction
        let isInDirection = false;
        let primaryDistance = 0;
        let secondaryDistance = 0;

        switch (direction) {
          case 'up':
            isInDirection = centerY < currentCenterY - DIRECTION_THRESHOLD_PX;
            primaryDistance = currentCenterY - centerY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'down':
            isInDirection = centerY > currentCenterY + DIRECTION_THRESHOLD_PX;
            primaryDistance = centerY - currentCenterY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'left':
            isInDirection = centerX < currentCenterX - DIRECTION_THRESHOLD_PX;
            primaryDistance = currentCenterX - centerX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
          case 'right':
            isInDirection = centerX > currentCenterX + DIRECTION_THRESHOLD_PX;
            primaryDistance = centerX - currentCenterX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
        }

        if (!isInDirection) continue;

        // Score : priorité à la direction primaire, pénalité pour la distance secondaire
        const score = primaryDistance + secondaryDistance * SECONDARY_AXIS_PENALTY;

        if (score < bestScore) {
          bestScore = score;
          bestElement = el;
        }
      }

      // Logique spéciale pour navigation vers un nouveau carrousel
      // Quand on descend/monte vers un carrousel différent, prendre la première carte à gauche
      if (bestElement && (direction === 'down' || direction === 'up')) {
        const targetCarousel = bestElement.closest('[data-carousel]');
        
        // Si on entre dans un nouveau carrousel (différent du carrousel actuel)
        if (targetCarousel && (!currentCarousel || !currentCarousel.isSameNode(targetCarousel))) {
          // Trouver la première carte visible à gauche dans ce carrousel
          const cardsInCarousel = Array.from(targetCarousel.querySelectorAll<HTMLElement>(
            '[data-torrent-card] a, [data-torrent-card] button, .torrent-poster a, .torrent-poster button'
          )).filter(el => {
            const rect = el.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0 && elements.includes(el);
          });
          
          if (cardsInCarousel.length > 0) {
            // Trier par position X (gauche à droite)
            cardsInCarousel.sort((a, b) => {
              const rectA = a.getBoundingClientRect();
              const rectB = b.getBoundingClientRect();
              return rectA.left - rectB.left;
            });
            // Retourner la première carte (la plus à gauche)
            return cardsInCarousel[0];
          }
        }
      }

      return bestElement;
    };

    // Focus sur le premier élément approprié
    const focusFirstAppropriateElement = (focusableElements: HTMLElement[]) => {
      // Priorité: première carte de contenu
      const firstCard = document.querySelector(CONTENT_CARD_SELECTOR) as HTMLElement;
      
      if (firstCard && focusableElements.includes(firstCard)) {
        firstCard.focus();
        firstCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      }
      
      // Sinon premier élément dans main
      const mainContent = document.querySelector('main');
      if (mainContent) {
        const mainFocusable = focusableElements.find(el => mainContent.contains(el));
        if (mainFocusable) {
          mainFocusable.focus();
          mainFocusable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          return true;
        }
      }
      
      // Fallback
      if (focusableElements[0]) {
        focusableElements[0].focus();
        return true;
      }
      
      return false;
    };

    // Gestionnaire d'événements clavier
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignorer si on est dans un input/textarea (sauf pour Escape)
      const activeElement = document.activeElement as HTMLElement;
      const isInputFocused = activeElement && 
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA');
      
      if (isInputFocused && e.key !== 'Escape') {
        return;
      }

      // Ignorer si une modal est ouverte (elle gère sa propre navigation)
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) {
        return;
      }

      // Ignorer si le player vidéo est actif (il gère sa propre navigation)
      if (document.querySelector('.hls-player-container:focus-within')) {
        return;
      }

      const focusableElements = getFocusableElements();
      if (focusableElements.length === 0) return;

      // Si aucun élément n'a le focus, focus le premier élément approprié
      if (!activeElement || !focusableElements.includes(activeElement)) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          focusFirstAppropriateElement(focusableElements);
          return;
        }
      }

      let direction: 'up' | 'down' | 'left' | 'right' | null = null;

      switch (e.key) {
        case 'ArrowUp':
          direction = 'up';
          break;
        case 'ArrowDown':
          direction = 'down';
          break;
        case 'ArrowLeft':
          direction = 'left';
          break;
        case 'ArrowRight':
          direction = 'right';
          break;
        case 'Enter':
        case ' ':
          // Cliquer sur l'élément focusé (si ce n'est pas un lien/bouton qui gère déjà ça)
          if (activeElement && !['A', 'BUTTON', 'INPUT', 'SELECT'].includes(activeElement.tagName)) {
            e.preventDefault();
            activeElement.click();
          }
          return;
        case 'Escape':
          // Bouton retour - naviguer en arrière
          if (window.history.length > 1) {
            e.preventDefault();
            window.history.back();
          }
          return;
        default:
          return;
      }

      if (direction && activeElement) {
        e.preventDefault();
        const nextElement = findClosestElement(activeElement, focusableElements, direction);
        if (nextElement) {
          nextElement.focus();
          nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        }
      }
    };

    // Ajouter les styles de focus visible
    // Note: !important est nécessaire pour surcharger les styles existants sur TV
    const style = document.createElement('style');
    style.id = 'tv-navigation-styles';
    style.textContent = `
      /* Focus visible pour navigation TV */
      body.tv-navigation-active *:focus-visible {
        outline: 3px solid #a855f7 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 6px rgba(168, 85, 247, 0.3) !important;
      }
      
      /* Animation de focus */
      body.tv-navigation-active a:focus-visible,
      body.tv-navigation-active button:focus-visible,
      body.tv-navigation-active [tabindex]:focus-visible {
        transform: scale(1.02);
        transition: transform 0.15s ease, outline 0.15s ease, box-shadow 0.15s ease;
      }
      
      /* Cartes avec focus */
      body.tv-navigation-active .torrent-poster:focus-visible,
      body.tv-navigation-active [data-focusable]:focus-visible {
        transform: scale(1.05);
        z-index: 10;
      }
    `;
    
    if (!document.getElementById('tv-navigation-styles')) {
      document.head.appendChild(style);
    }
    
    // Ajouter la classe au body pour activer les styles
    document.body.classList.add('tv-navigation-active');

    // Écouter les événements clavier
    document.addEventListener('keydown', handleKeyDown, true);

    // Focus initial - utiliser MutationObserver pour attendre le contenu
    let initialFocusAttempts = 0;
    const maxAttempts = 10;
    
    const tryInitialFocus = () => {
      const focusable = getFocusableElements();
      
      // Ne pas voler le focus si l'utilisateur a déjà focalisé quelque chose
      if (document.activeElement !== document.body) {
        return true; // Arrêter les tentatives
      }
      
      if (focusable.length > 0) {
        // Priorité 1: Premier TorrentPoster/carte de contenu (pages dashboard)
        const firstCard = document.querySelector(CONTENT_CARD_SELECTOR) as HTMLElement;
        
        if (firstCard && focusable.includes(firstCard)) {
          firstCard.focus();
          firstCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
        
        // Priorité 2: Premier élément avec data-initial-focus
        const initialFocusElement = document.querySelector('[data-initial-focus]') as HTMLElement;
        if (initialFocusElement && focusable.includes(initialFocusElement)) {
          initialFocusElement.focus();
          return true;
        }
        
        // Priorité 3: Premier bouton/lien dans le contenu principal (pas la nav)
        const mainContent = document.querySelector('main');
        if (mainContent) {
          const mainFocusable = mainContent.querySelector(
            'button, a[href], [tabindex]:not([tabindex="-1"])'
          ) as HTMLElement;
          if (mainFocusable && focusable.includes(mainFocusable)) {
            mainFocusable.focus();
            return true;
          }
        }
        
        // Fallback: Premier élément focusable
        focusable[0]?.focus();
        return true;
      }
      
      return false;
    };

    // Tenter le focus initial avec retry
    const initialFocusInterval = setInterval(() => {
      initialFocusAttempts++;
      if (tryInitialFocus() || initialFocusAttempts >= maxAttempts) {
        clearInterval(initialFocusInterval);
      }
    }, INITIAL_FOCUS_DELAY_MS);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      mutationObserver.disconnect();
      clearInterval(initialFocusInterval);
      document.body.classList.remove('tv-navigation-active');
      const existingStyle = document.getElementById('tv-navigation-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Ce composant ne rend rien visuellement
  return null;
}
