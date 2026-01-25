import { useEffect, useRef, useState } from 'preact/hooks';

interface UseFocusDynamicsOptions {
  /**
   * Durée avant d'appliquer l'animation (en ms)
   */
  delay?: number;
  /**
   * ID unique pour cette carte (pour éviter les conflits)
   */
  cardId?: string;
  /**
   * Callback appelé quand la carte est focusée
   */
  onFocus?: () => void;
  /**
   * Callback appelé quand la carte perd le focus
   */
  onBlur?: () => void;
  /**
   * Désactiver l'animation Pinned Left
   */
  disabled?: boolean;
}

/**
 * Hook pour gérer l'animation Focus Dynamique "Pinned Left"
 * 
 * Comportement :
 * - La carte focusée glisse magnétiquement vers la gauche (translateX(-10%))
 * - Scale 1.2x au focus
 * - Les autres cartes s'estompent à 40% d'opacité
 * - Scroll automatique vers la gauche pour ancrer la carte
 */
export function useFocusDynamics({
  delay = 0,
  cardId,
  onFocus,
  onBlur,
  disabled = false,
}: UseFocusDynamicsOptions = {}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (disabled) return;

    // Vérifier périodiquement que la ref est disponible
    const checkInterval = setInterval(() => {
      if (cardRef.current) {
        clearInterval(checkInterval);
        initializeFocusDynamics(cardRef.current);
      }
    }, 50);

    // Timeout de sécurité après 2 secondes
    const safetyTimeout = setTimeout(() => {
      clearInterval(checkInterval);
    }, 2000);

    function initializeFocusDynamics(element: HTMLElement) {
      // Trouver le conteneur parent (CarouselRow ou similaire)
      const findContainer = (el: HTMLElement): HTMLElement | null => {
        let parent = el.parentElement;
        while (parent && parent !== document.body) {
          if (parent.classList.contains('carousel-container') || 
              parent.hasAttribute('data-carousel') ||
              (parent.scrollWidth > parent.clientWidth && parent.classList.contains('overflow-x-auto'))) {
            return parent;
          }
          parent = parent.parentElement;
        }
        return null;
      };

      containerRef.current = findContainer(element);

      const handleFocus = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = window.setTimeout(() => {
          setIsFocused(true);
          onFocus?.();

          // Appliquer animation Pinned Left
          element.style.willChange = 'transform, opacity';
          element.classList.add('focus-pinned-left');
          element.style.transform = 'scale(1.2) translate3d(-10%, 0, 0)';
          element.style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
          element.style.zIndex = '20';

          // Scroll vers la gauche pour ancrer la carte
          if (containerRef.current) {
            element.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'nearest',
              inline: 'start' // Ancrage à gauche
            });
          }

          // Estomper les autres cartes à 40% d'opacité
          if (containerRef.current) {
            const siblings = Array.from(containerRef.current.children) as HTMLElement[];
            siblings.forEach((sibling) => {
              if (sibling !== element && sibling.contains(element) === false && !element.contains(sibling)) {
                const card = sibling.querySelector('[data-torrent-card]') || 
                            sibling.querySelector('.torrent-poster') || 
                            sibling;
                if (card && card !== element && !element.contains(card)) {
                  (card as HTMLElement).style.opacity = '0.4';
                  (card as HTMLElement).style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
                }
              }
            });
          }
        }, delay);
      };

      const handleBlur = () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        setIsFocused(false);
        onBlur?.();

        // Réinitialiser les styles
        element.style.willChange = '';
        element.classList.remove('focus-pinned-left');
        element.style.transform = '';
        element.style.transition = '';
        element.style.zIndex = '';

        // Réinitialiser l'opacité des autres cartes
        if (containerRef.current) {
          const siblings = Array.from(containerRef.current.children) as HTMLElement[];
          siblings.forEach((sibling) => {
            if (sibling !== element && sibling.contains(element) === false && !element.contains(sibling)) {
              const card = sibling.querySelector('[data-torrent-card]') || 
                          sibling.querySelector('.torrent-poster') || 
                          sibling;
              if (card && card !== element && !element.contains(card)) {
                (card as HTMLElement).style.opacity = '';
                (card as HTMLElement).style.transition = '';
              }
            }
          });
        }
      };

      // Utiliser focusin/focusout qui remontent (bubble) dans le DOM
      // Cela permet de détecter le focus sur les enfants (ex: <a> dans FocusableCard)
      element.addEventListener('focusin', handleFocus);
      element.addEventListener('focusout', handleBlur);
      
      // Aussi écouter focus/blur direct pour les cas où l'élément est lui-même focusé
      element.addEventListener('focus', handleFocus);
      element.addEventListener('blur', handleBlur);

      // Gérer aussi le focus via mouse (pour compatibilité)
      const handleMouseEnter = () => {
        // Chercher un élément focusable enfant ou utiliser l'élément lui-même
        const focusTarget = element.querySelector('a, button, [tabindex]') as HTMLElement || element;
        if (document.activeElement !== focusTarget && document.activeElement !== element) {
          focusTarget.focus();
        }
      };

      element.addEventListener('mouseenter', handleMouseEnter);

      return () => {
        element.removeEventListener('focusin', handleFocus);
        element.removeEventListener('focusout', handleBlur);
        element.removeEventListener('focus', handleFocus);
        element.removeEventListener('blur', handleBlur);
        element.removeEventListener('mouseenter', handleMouseEnter);
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }
      };
    }

    return () => {
      clearInterval(checkInterval);
      clearTimeout(safetyTimeout);
    };
  }, [delay, cardId, onFocus, onBlur, disabled]);

  return {
    cardRef,
    isFocused,
    containerRef,
  };
}