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
    scrollContainerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
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
      className={`mb-8 sm:mb-10 md:mb-12 ${className} opacity-0`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center mb-2 sm:mb-3 px-3 sm:px-4 md:px-6 lg:px-8">
        <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-white">{title}</h2>
        {(isHovered || (scrollContainerRef.current?.scrollLeft || 0) > 0) && (
          <div className="hidden xs:flex gap-1.5 sm:gap-2 ml-auto">
            <button
              onClick={() => scroll('left')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full bg-black/80 hover:bg-black border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Défiler vers la gauche"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => scroll('right')}
              className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full bg-black/80 hover:bg-black border border-white/30 flex items-center justify-center text-white transition-all hover:scale-110 backdrop-blur-sm focus:outline-none focus:ring-2 focus:ring-white/50"
              aria-label="Défiler vers la droite"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <div
        ref={scrollContainerRef}
        className="flex gap-1 sm:gap-1.5 md:gap-2 overflow-x-auto overflow-y-hidden scrollbar-hide px-3 sm:px-4 md:px-6 lg:px-8"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
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
