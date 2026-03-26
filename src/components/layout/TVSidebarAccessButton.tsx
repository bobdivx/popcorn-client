import { useState, useEffect } from 'preact/hooks';
import { Menu } from 'lucide-preact';
import { isTVPlatform } from '../../lib/utils/device-detection';
import { useI18n } from '../../lib/i18n/useI18n';
import { focusTVSidebarFirst } from '../../lib/tv/focus-tv-sidebar';

/**
 * Bouton fixe « Menu » à l’entrée de la zone de contenu (après le rail TV).
 * Permet d’atteindre la navigation latérale sans devoir tout traverser au pad.
 * N’apparaît que lorsque la barre latérale est réellement montée (utilisateur connecté).
 */
export default function TVSidebarAccessButton() {
  const { t } = useI18n();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isTVPlatform()) return;
    const id = window.setInterval(() => {
      if (document.querySelector('[data-tv-app-sidebar]')) {
        setShow(true);
        window.clearInterval(id);
      }
    }, 50);
    const timeout = window.setTimeout(() => window.clearInterval(id), 10000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(timeout);
    };
  }, []);

  if (!show) return null;

  return (
    <button
      type="button"
      data-tv-sidebar-opener
      data-focusable
      className="fixed z-[45] flex items-center gap-2 rounded-2xl glass-panel-lg backdrop-blur-md border border-white/15 px-3 py-2.5 tv:px-4 tv:py-3 text-white/95 shadow-lg tv:min-h-[52px] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 left-[calc(max(6rem,96px)+0.75rem)] top-[max(0.75rem,env(safe-area-inset-top,0px))]"
      aria-label={t('nav.openSideNav')}
      onClick={() => focusTVSidebarFirst()}
    >
      <Menu className="w-5 h-5 tv:w-6 tv:h-6 flex-shrink-0" aria-hidden strokeWidth={2} />
      <span className="text-sm tv:text-base font-semibold pr-0.5">{t('nav.menu')}</span>
    </button>
  );
}
