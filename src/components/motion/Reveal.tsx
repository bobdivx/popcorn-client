import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren, JSX } from 'preact';
import { animate, inView } from 'motion';

type RevealProps = {
  children: ComponentChildren;
  className?: string;
  delay?: number;
  y?: number;
  scale?: number;
  duration?: number;
  as?: keyof JSX.IntrinsicElements;
};

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function Reveal({
  children,
  className = '',
  delay = 0,
  y = 28,
  scale = 1,
  duration = 0.6,
  as = 'div',
}: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const Tag = as as any;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (prefersReducedMotion()) {
      el.style.opacity = '1';
      el.style.transform = 'none';
      return;
    }

    el.style.opacity = '0';
    el.style.transform = `translateY(${y}px) scale(${scale === 1 ? 0.98 : scale})`;
    el.style.willChange = 'opacity, transform';

    let done = false;
    const stop = inView(
      el,
      () => {
        if (done) return;
        done = true;
        animate(
          el,
          { opacity: 1, transform: 'translateY(0px) scale(1)' },
          {
            duration,
            delay,
            ease: [0.22, 1, 0.36, 1],
          },
        ).finished.then(() => {
          el.style.willChange = 'auto';
        });
      },
      { amount: 0.18 },
    );

    return () => stop();
  }, [delay, y, scale, duration]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
