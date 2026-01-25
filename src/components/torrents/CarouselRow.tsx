import { useRef, useState, useCallback, useEffect } from 'preact/hooks';

interface CarouselRowProps {
  title: string;
  children: preact.ComponentChildren;
  className?: string;
}

export default function CarouselRow({ title, children, className = '' }: CarouselRowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const scroll = useCallback((direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    const scrollAmount = scrollContainerRef.current.clientWidth * 0.75;
    
    // Utiliser courbe de Bézier organique pour défilement fluide
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  }, []);

  // Gestion Focus Pinned Left - glissement magnétique vers la gauche
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      
      // Vérifier si l'élément focusé est dans ce carrousel
      if (!container.contains(target)) return;
      
      // Trouver la carte (element avec data-torrent-card ou parent proche)
      const card = target.closest('[data-torrent-card]') || target.closest('.torrent-poster');
      if (!card) return;

      // Attendre un court délai pour que le focus soit stable
      setTimeout(() => {
        // Scroll vers la gauche pour ancrer la carte (Pinned Left)
        card.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'start', // Ancrage à gauche - comportement "Pinned Left"
        });

        // Appliquer transition avec courbe de Bézier organique
        (card as HTMLElement).style.transition = 'transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
      }, 50);
    };

    // Écouter les événements focusin sur le conteneur
    container.addEventListener('focusin', handleFocusIn);

    return () => {
      container.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // Navigation clavier pour défilement horizontal dans le carrousel (TV)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      if (!container.contains(activeElement)) return;
      
      // Trouver toutes les cartes focusables dans ce carrousel
      const focusableCards = Array.from(container.querySelectorAll<HTMLElement>(
        '[data-torrent-card] a, [data-torrent-card] button, ' +
        '.torrent-poster a, .torrent-poster button, ' +
        '[tabindex]:not([tabindex="-1"])'
      )).filter(el => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      
      // Trouver l'index de l'élément actuel
      const currentCard = activeElement.closest('[data-torrent-card], .torrent-poster');
      const currentIndex = focusableCards.findIndex(el => 
        el === activeElement || el.closest('[data-torrent-card], .torrent-poster') === currentCard
      );
      
      if (currentIndex === -1) return;
      
      // Navigation horizontale : passer à la carte suivante/précédente
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        const prevIndex = Math.max(0, currentIndex - 1);
        const prevElement = focusableCards[prevIndex];
        if (prevElement) {
          prevElement.focus();
          prevElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        const nextIndex = Math.min(focusableCards.length - 1, currentIndex + 1);
        const nextElement = focusableCards[nextIndex];
        if (nextElement) {
          nextElement.focus();
          nextElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
        }
      }
      // ArrowUp/ArrowDown : laisser TVNavigationProvider gérer pour changer de rangée
    };

    container.addEventListener('keydown', handleKeyDown, true);
    return () => {
      container.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  const [isHovered, setIsHovered] = useState(false);

  // Animation au scroll avec Intersection Observer
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      if (containerRef.current) {
        containerRef.current.classList.add('animate-fade-in-up');
      }
      return;
    }

    const element = containerRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade-in-up');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        rootMargin: '0px 0px -50px 0px',
        threshold: 0.1,
      }
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const childrenArray = Array.isArray(children) ? children : [children];

  return (
    <div 
      ref={containerRef}
      className={`mb-8 sm:mb-10 md:mb-12 tv:mb-16 ${className} opacity-0`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center mb-2 sm:mb-3 tv:mb-4 px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16">
        <h2 className="text-lg sm:text-xl md:text-2xl tv:text-3xl font-bold text-white">{title}</h2>
        {(isHovered || (scrollContainerRef.current?.scrollLeft || 0) > 0) && (
          <div className="hidden xs:flex gap-1.5 sm:gap-2 tv:gap-4 ml-auto">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full glass-panel hover:bg-glass-hover border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la gauche"
              tabIndex={0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 tv:w-14 tv:h-14 rounded-full glass-panel hover:bg-glass-hover border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 focus:outline-none focus:ring-4 focus:ring-primary-600 focus:ring-opacity-50 min-h-[28px] tv:min-h-[56px]"
              aria-label="Défiler vers la droite"
              tabIndex={0}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5 tv:h-7 tv:w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        data-carousel
        className="flex gap-1 sm:gap-1.5 md:gap-2 lg:gap-4 xl:gap-6 tv:gap-8 overflow-x-auto overflow-y-hidden scrollbar-hide px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 scroll-smooth carousel-container"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          scrollBehavior: 'smooth',
        }}
      >
        {childrenArray.map((child, index) => (
          <div key={index} className="flex-shrink-0">
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}
