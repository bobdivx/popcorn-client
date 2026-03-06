import { useEffect, useRef } from 'preact/hooks';

interface UseTVNavigationOptions {
  /**
   * Sélecteur CSS pour les éléments focusables
   */
  selector?: string;
  /**
   * Désactiver la navigation automatique
   */
  disabled?: boolean;
  /**
   * Callback appelé lors du changement de focus
   */
  onFocusChange?: (element: HTMLElement | null) => void;
  /**
   * Navigation verticale uniquement (pour colonnes)
   */
  verticalOnly?: boolean;
  /**
   * Navigation horizontale uniquement (pour lignes/carrousels)
   */
  horizontalOnly?: boolean;
}

/**
 * Hook pour gérer la navigation TV au clavier/D-pad
 * Optimisé pour Android TV avec gestion intelligente du focus
 */
export function useTVNavigation({
  selector = 'button, a, [tabindex]:not([tabindex="-1"]), input, select, textarea, [data-focusable]',
  disabled = false,
  onFocusChange,
  verticalOnly = false,
  horizontalOnly = false,
}: UseTVNavigationOptions = {}) {
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (disabled) return;

    const container = containerRef.current || document;
    let currentFocusIndex = -1;
    let focusableElements: HTMLElement[] = [];

    const updateFocusableElements = () => {
      focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(selector)
      ).filter((el) => {
        const style = window.getComputedStyle(el);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          !el.hasAttribute('disabled') &&
          !el.hasAttribute('aria-hidden') &&
          el.tabIndex >= 0 &&
          el.offsetWidth > 0 &&
          el.offsetHeight > 0
        );
      });
    };

    const getCurrentFocusIndex = (): number => {
      const activeElement = document.activeElement as HTMLElement;
      if (!activeElement || !container.contains(activeElement)) return -1;
      return focusableElements.indexOf(activeElement);
    };

    const setFocus = (index: number) => {
      if (index < 0 || index >= focusableElements.length) return;

      const element = focusableElements[index];
      element.focus();
      
      // ScrollIntoView avec options optimisées pour TV
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'nearest',
        inline: 'nearest'
      });
      
      onFocusChange?.(element);
      currentFocusIndex = index;
    };

    const handleKeyDown = (evt: Event) => {
      const e = evt as KeyboardEvent;
      // Ignorer si une modal est ouverte (géré par le système de modals)
      if (document.querySelector('[role="dialog"]:not([aria-hidden="true"])')) {
        return;
      }

      updateFocusableElements();

      if (focusableElements.length === 0) return;

      const currentIndex = getCurrentFocusIndex();
      if (currentIndex === -1 && focusableElements.length > 0) {
        // Si aucun élément n'a le focus, focus le premier
        setFocus(0);
        e.preventDefault();
        return;
      }

      let newIndex = currentIndex;

      switch (e.key) {
        case 'ArrowUp':
          if (horizontalOnly) break;
          
          if (verticalOnly || currentIndex > 0) {
            // Pour la navigation verticale, on cherche le meilleur élément au-dessus
            const currentRect = focusableElements[currentIndex].getBoundingClientRect();
            let bestIndex = -1;
            let minDistance = Infinity;

            for (let i = currentIndex - 1; i >= 0; i--) {
              const rect = focusableElements[i].getBoundingClientRect();
              const centerY = (rect.top + rect.bottom) / 2;
              const currentCenterY = (currentRect.top + currentRect.bottom) / 2;

              if (centerY < currentCenterY) {
                const horizontalDistance = Math.abs(rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2));
                const verticalDistance = currentCenterY - centerY;
                const distance = horizontalDistance * 0.3 + verticalDistance;
                
                if (distance < minDistance) {
                  minDistance = distance;
                  bestIndex = i;
                }
              }
            }

            if (bestIndex !== -1) {
              newIndex = bestIndex;
            } else {
              newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
            }
          } else {
            newIndex = focusableElements.length - 1;
          }
          e.preventDefault();
          setFocus(newIndex);
          break;

        case 'ArrowDown':
          if (horizontalOnly) break;
          
          if (verticalOnly || currentIndex < focusableElements.length - 1) {
            const currentRect = focusableElements[currentIndex].getBoundingClientRect();
            let bestIndex = -1;
            let minDistance = Infinity;

            for (let i = currentIndex + 1; i < focusableElements.length; i++) {
              const rect = focusableElements[i].getBoundingClientRect();
              const centerY = (rect.top + rect.bottom) / 2;
              const currentCenterY = (currentRect.top + currentRect.bottom) / 2;

              if (centerY > currentCenterY) {
                const horizontalDistance = Math.abs(rect.left + rect.width / 2 - (currentRect.left + currentRect.width / 2));
                const verticalDistance = centerY - currentCenterY;
                const distance = horizontalDistance * 0.3 + verticalDistance;
                
                if (distance < minDistance) {
                  minDistance = distance;
                  bestIndex = i;
                }
              }
            }

            if (bestIndex !== -1) {
              newIndex = bestIndex;
            } else {
              newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
            }
          } else {
            newIndex = 0;
          }
          e.preventDefault();
          setFocus(newIndex);
          break;

        case 'ArrowLeft':
          if (verticalOnly) break;
          
          newIndex = currentIndex > 0 ? currentIndex - 1 : focusableElements.length - 1;
          e.preventDefault();
          setFocus(newIndex);
          break;

        case 'ArrowRight':
          if (verticalOnly) break;
          
          newIndex = currentIndex < focusableElements.length - 1 ? currentIndex + 1 : 0;
          e.preventDefault();
          setFocus(newIndex);
          break;

        case 'Home':
          e.preventDefault();
          setFocus(0);
          break;

        case 'End':
          e.preventDefault();
          setFocus(focusableElements.length - 1);
          break;
      }
    };

    container.addEventListener('keydown', handleKeyDown as any, true);

    // Initialiser les éléments focusables
    updateFocusableElements();

    // Observer les changements DOM pour mettre à jour les éléments focusables
    const observer = new MutationObserver(() => {
      updateFocusableElements();
    });

    if (container !== document) {
      observer.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['disabled', 'tabindex', 'aria-hidden'],
      });
    }

    return () => {
      container.removeEventListener('keydown', handleKeyDown as any, true);
      observer.disconnect();
    };
  }, [selector, disabled, onFocusChange, verticalOnly, horizontalOnly]);

  return {
    containerRef,
  };
}
