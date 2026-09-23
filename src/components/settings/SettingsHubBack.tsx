import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';

/** Page parente. Un ?sub= revient à la même page sans ce paramètre, sinon un niveau de chemin. */
function parentSettingsHref(pathname: string, search = ''): string | null {
  const path = pathname.replace(/\/$/, '') || '/';
  if (path !== '/settings' && !path.startsWith('/settings/')) return null;
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  if (params.has('sub')) {
    params.delete('sub');
    const q = params.toString();
    const base = path === '/settings' ? '/settings/' : `${path}/`;
    return q ? `${base}?${q}` : base;
  }
  if (path === '/settings') return null;
  const parts = path.split('/').filter(Boolean);
  parts.pop();
  if (parts.length === 0) return null;
  return `/${parts.join('/')}/`;
}

export default function SettingsHubBack() {
  const { t } = useI18n();
  // Null au premier rendu (SSR et hydratation identiques), puis le chemin parent.
  const [href, setHref] = useState<string | null>(null);

  useEffect(() => {
    const sync = () => setHref(parentSettingsHref(window.location.pathname, window.location.search));
    sync();
    window.addEventListener('popstate', sync);
    document.addEventListener('astro:page-load', sync);

    const root = document.querySelector('[data-tv-settings-content]') as (HTMLElement & { _tvBack?: () => void }) | null;
    const go = () => {
      const next = parentSettingsHref(window.location.pathname, window.location.search);
      if (!next) return;
      const link = document.querySelector<HTMLAnchorElement>('[data-settings-back]');
      if (link) link.click();
      else window.location.assign(next);
    };
    if (root && parentSettingsHref(window.location.pathname, window.location.search)) {
      root.setAttribute('data-tv-back-handler', '');
      root._tvBack = go;
    }

    return () => {
      window.removeEventListener('popstate', sync);
      document.removeEventListener('astro:page-load', sync);
      if (root) {
        root.removeAttribute('data-tv-back-handler');
        delete root._tvBack;
      }
    };
  }, [href]);

  return (
    <div class={href ? 'hub-back-row' : undefined} data-tv-list-header={href ? true : undefined} hidden={!href}>
      {href ? (
        <a
          href={href}
          class="hub-back"
          data-settings-back
          data-focusable
          data-tv-page-action
          tabIndex={0}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          {t('common.back')}
        </a>
      ) : null}
    </div>
  );
}
