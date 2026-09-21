import { useEffect, useRef } from 'preact/hooks';
import { animate, stagger } from 'motion';
import LoginForm from '../LoginForm';

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function LoginPageShell({ serverLinkLabel }: { serverLinkLabel: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-login-item]'));

    if (prefersReducedMotion()) {
      items.forEach((el) => {
        el.style.opacity = '1';
        el.style.transform = 'none';
      });
      return;
    }

    items.forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(28px)';
    });

    const entrance = animate(
      items,
      { opacity: 1, transform: 'translateY(0px)' },
      {
        duration: 0.65,
        delay: stagger(0.12, { startDelay: 0.05 }),
        ease: [0.22, 1, 0.36, 1],
      },
    );

    return () => {
      entrance.stop();
    };
  }, []);

  return (
    <div
      ref={ref}
      className="relative flex flex-col justify-center items-center min-h-screen bg-black px-4 py-16 overflow-hidden [html[data-tv-platform='true']_&]:p-8 [html[data-tv-platform='true']_&]:py-12"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(168,85,247,0.2),_transparent_55%)]"
        aria-hidden="true"
      />
      <div
        data-login-orb
        className="pointer-events-none absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-primary-600/20 rounded-full blur-3xl animate-pulse-violet"
        aria-hidden="true"
      />

      <div data-login-item className="mb-8 relative z-10 [html[data-tv-platform='true']_&]:mb-12">
        <img
          src="/popcorn_logo.png"
          alt="Popcornn"
          className="w-20 h-20 sm:w-24 sm:h-24 object-contain mx-auto drop-shadow-[0_0_32px_rgba(168,85,247,0.4)]"
          loading="eager"
        />
      </div>

      <div data-login-item className="relative z-10 w-full flex justify-center">
        <LoginForm />
      </div>

      <div data-login-item className="mt-6 text-center relative z-10">
        <a
          href="/settings/server"
          className="text-gray-400 hover:text-white text-sm transition-colors underline"
        >
          {serverLinkLabel}
        </a>
      </div>
    </div>
  );
}
