import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { animate, stagger } from 'motion';

type HeroEntranceProps = {
  children: ComponentChildren;
  className?: string;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Orchestrates a cinematic first-paint entrance for hero children marked with data-hero-item */
export default function HeroEntrance({ children, className = '' }: HeroEntranceProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-hero-item]'));

    if (prefersReducedMotion()) {
      items.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(36px)';
      el.style.willChange = 'opacity, transform';
    });

    const controls = animate(
      items,
      { opacity: 1, transform: 'translateY(0px)' },
      {
        duration: 0.7,
        delay: stagger(0.1, { startDelay: 0.08 }),
        ease: [0.22, 1, 0.36, 1],
      },
    );

    return () => {
      controls.stop();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
