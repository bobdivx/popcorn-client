import { useEffect, useState } from 'preact/hooks';
import { getOidcAvailable, getOidcStartUrl } from '../lib/api/popcorn-web';
import { useI18n } from '../lib/i18n/useI18n';

type Props = {
  emphasize?: boolean;
  className?: string;
};

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
        if (!cancelled) setAvailable(false);
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
        : 'w-full bg-white/10 hover:bg-white/20 text-white border border-white/20'} font-medium py-2.5 sm:py-3 rounded text-sm sm:text-base transition-colors text-center block ${className}`}
    >
      {available === null ? t('loginForm.sso.checking') : t('loginForm.sso.continue')}
    </a>
  );
}
