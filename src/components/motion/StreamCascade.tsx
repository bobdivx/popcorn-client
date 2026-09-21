import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { animate, stagger } from 'motion';
import { isTVPlatform } from '../../lib/utils/device-detection';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type StreamCascadeProps = {
  children: ComponentChildren;
  className?: string;
  /** CSS selector for children to stagger */
  itemSelector?: string;
  y?: number;
};

/**
 * Cascade entrance for streaming chrome (titles, badges, action wrappers).
 * Safe on TV: uses opacity + translate on non-focusable wrappers only.
 */
export default function StreamCascade({
  children,
  className = '',
  itemSelector = '[data-stream-item]',
  y = 18,
}: StreamCascadeProps) {
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

    // TV: still allow subtle opacity cascade on detail/hero chrome (outside carousels)
    const duration = isTVPlatform() ? 0.35 : 0.55;
    const distance = isTVPlatform() ? Math.min(y, 10) : y;

    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = `translateY(${distance}px)`;
    });

    const controls = animate(
      items,
      { opacity: 1, transform: 'translateY(0px)' },
      {
        duration,
        delay: stagger(0.07, { startDelay: 0.04 }),
        ease: [0.22, 1, 0.36, 1],
      },
    );

    return () => controls.stop();
  }, [itemSelector, y]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
