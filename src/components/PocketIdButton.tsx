import { useEffect, useState } from 'preact/hooks';
import { getOidcAvailable, getOidcStartUrl } from '../lib/api/popcorn-web';
import { useI18n } from '../lib/i18n/useI18n';

type Props = {
  emphasize?: boolean;
  className?: string;
};

function PocketIdMark() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="-250 -706 521 713"
      class="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M-250.368,-706.48C-166.912,-706.48 -83.456,-706.48 0,-706.48C149.377,-706.48 270.906,-584.953 270.906,-435.576C270.906,-376.876 252.438,-321.028 217.506,-274.062C183.258,-228.019 136.385,-194.563 81.955,-177.305C76.939,-175.715 71.924,-174.124 66.908,-172.534C54.955,-231.481 43.003,-290.429 31.05,-349.376C34.355,-350.974 37.661,-352.571 40.966,-354.169C73.345,-369.822 94.269,-403.156 94.269,-439.094C94.269,-491.073 51.982,-533.36 0,-533.36C-51.978,-533.36 -94.267,-491.073 -94.267,-439.094C-94.267,-403.156 -73.344,-369.822 -40.963,-354.169C-37.718,-352.6 -34.473,-351.032 -31.228,-349.463C-50.48,-230.815 -69.733,-112.167 -88.985,6.48C-142.779,6.48 -196.574,6.48 -250.368,6.48Z"
      />
    </svg>
  );
}

export default function PocketIdButton({ emphasize = false, className = '' }: Props) {
  const { t } = useI18n();
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    getOidcAvailable()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        // Laisser le bouton visible si le check échoue (bloqueur, réseau).
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (available === false) return null;

  const returnTo = typeof window !== 'undefined' ? window.location.href : '/login';
  const href = getOidcStartUrl(returnTo);

  return (
    <a
      href={href}
      className={`${emphasize
        ? 'w-full bg-primary hover:bg-primary-700 text-white'
        : 'w-full bg-white/10 hover:bg-white/20 text-white border border-white/20'} font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors text-center flex items-center justify-center gap-2 ${className}`}
    >
      <PocketIdMark />
      <span>{t('loginForm.sso.continue')}</span>
    </a>
  );
}
