import { useEffect } from 'preact/hooks';

/**
 * Fournisseur de navigation TV global
 * Gère la navigation au clavier/D-pad pour toute l'application
 * Compatible avec webOS, Android TV, et autres plateformes TV
 */
export function TVNavigationProvider() {
  useEffect(() => {
    // Sélecteur pour les éléments focusables
    const FOCUSABLE_SELECTOR = 
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
      'textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable]';

    // Obtenir tous les éléments focusables visibles
    const getFocusableElements = (): HTMLElement[] => {
      return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
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
            isInDirection = centerY < currentCenterY - 5;
            primaryDistance = currentCenterY - centerY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'down':
            isInDirection = centerY > currentCenterY + 5;
            primaryDistance = centerY - currentCenterY;
            secondaryDistance = Math.abs(centerX - currentCenterX);
            break;
          case 'left':
            isInDirection = centerX < currentCenterX - 5;
            primaryDistance = currentCenterX - centerX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
          case 'right':
            isInDirection = centerX > currentCenterX + 5;
            primaryDistance = centerX - currentCenterX;
            secondaryDistance = Math.abs(centerY - currentCenterY);
            break;
        }

        if (!isInDirection) continue;

        // Score : priorité à la direction primaire, pénalité pour la distance secondaire
        const score = primaryDistance + secondaryDistance * 2;

        if (score < bestScore) {
          bestScore = score;
          bestElement = el;
        }
      }

      return bestElement;
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

      // Si aucun élément n'a le focus, focus le premier
      if (!activeElement || !focusableElements.includes(activeElement)) {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          focusableElements[0]?.focus();
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
    const style = document.createElement('style');
    style.id = 'tv-navigation-styles';
    style.textContent = `
      /* Focus visible pour navigation TV */
      *:focus-visible {
        outline: 3px solid #a855f7 !important;
        outline-offset: 2px !important;
        box-shadow: 0 0 0 6px rgba(168, 85, 247, 0.3) !important;
      }
      
      /* Animation de focus */
      a:focus-visible, button:focus-visible, [tabindex]:focus-visible {
        transform: scale(1.02);
        transition: transform 0.15s ease, outline 0.15s ease, box-shadow 0.15s ease;
      }
      
      /* Cartes avec focus */
      .torrent-poster:focus-visible,
      [data-focusable]:focus-visible {
        transform: scale(1.05);
        z-index: 10;
      }
    `;
    
    if (!document.getElementById('tv-navigation-styles')) {
      document.head.appendChild(style);
    }

    // Écouter les événements clavier
    document.addEventListener('keydown', handleKeyDown, true);

    // Focus initial après chargement
    const initialFocus = setTimeout(() => {
      const focusable = getFocusableElements();
      // Ne pas voler le focus si l'utilisateur a déjà focalisé quelque chose
      if (document.activeElement === document.body && focusable.length > 0) {
        // Chercher un élément principal à focus (nav, premier lien, etc.)
        const mainNav = document.querySelector('nav a, nav button') as HTMLElement;
        if (mainNav && focusable.includes(mainNav)) {
          mainNav.focus();
        }
      }
    }, 500);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      clearTimeout(initialFocus);
      const existingStyle = document.getElementById('tv-navigation-styles');
      if (existingStyle) {
        existingStyle.remove();
      }
    };
  }, []);

  // Ce composant ne rend rien visuellement
  return null;
}

export default TVNavigationProvider;
