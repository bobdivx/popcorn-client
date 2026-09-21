import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { animate, inView } from 'motion';
import { isTVPlatform } from '../../lib/utils/device-detection';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

type BrowseRowRevealProps = {
  children: ComponentChildren;
  className?: string;
  /** data attribute already used by TV nav */
  rowId?: string;
};

/**
 * Reveal a browse row on scroll (opacity / blur only).
 * Skips animation on TV — nav/perf CSS kills carousel anims and transform on slots is unsafe.
 */
export default function BrowseRowReveal({ children, className = '', rowId }: BrowseRowRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (isTVPlatform() || prefersReducedMotion()) {
      el.classList.add('browse-row-seen');
      return;
    }

    el.classList.add('browse-row-pending');
    let done = false;

    const markSeen = () => {
      if (done) return;
      done = true;
      el.classList.remove('browse-row-pending');
      el.classList.add('browse-row-seen');
      animate(
        el,
        { opacity: 1, filter: 'blur(0px)' },
        { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
      );
    };

    const stop = inView(el, () => markSeen(), { amount: 0.08 });
    // Fallback: never leave a row invisible if IO is slow/blocked
    const fallback = window.setTimeout(markSeen, 1200);

    return () => {
      stop();
      window.clearTimeout(fallback);
    };
  }, []);

  return (
    <div
      ref={ref}
      data-browse-row
      data-browse-row-id={rowId}
      className={`browse-row-reveal ${className}`}
    >
      {children}
    </div>
  );
}
