import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { animate, inView, stagger } from 'motion';

type StaggerProps = {
  children: ComponentChildren;
  className?: string;
  itemSelector?: string;
  delay?: number;
  staggerDelay?: number;
  y?: number;
  duration?: number;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Stagger({
  children,
  className = '',
  itemSelector = '[data-stagger-item]',
  delay = 0,
  staggerDelay = 0.09,
  y = 24,
  duration = 0.55,
}: StaggerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const items = Array.from(root.querySelectorAll<HTMLElement>(itemSelector));
    if (!items.length) return;

    if (prefersReducedMotion()) {
      items.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = `translateY(${y}px)`;
      el.style.willChange = 'opacity, transform';
    });

    let done = false;
    const stop = inView(
      root,
      () => {
        if (done) return;
        done = true;
        animate(
          items,
          { opacity: 1, transform: 'translateY(0px)' },
          {
            duration,
            delay: stagger(staggerDelay, { startDelay: delay }),
            ease: [0.22, 1, 0.36, 1],
          },
        ).finished.then(() => {
          items.forEach((el) => {
            el.style.willChange = 'auto';
          });
        });
      },
      { amount: 0.15 },
    );

    return () => stop();
  }, [itemSelector, delay, staggerDelay, y, duration]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
