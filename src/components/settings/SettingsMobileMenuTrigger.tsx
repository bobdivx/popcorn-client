import { useI18n } from '../../lib/i18n/useI18n';
import { PanelLeft } from 'lucide-preact';

export default function SettingsMobileMenuTrigger() {
  const { t } = useI18n();

  const handleClick = () => {
    document.dispatchEvent(new CustomEvent('open-settings-drawer'));
  };

  return (
    <>
      {/* Sur mobile : bouton fixe toujours visible sous le header pour ouvrir le menu */}
      <div
        className="lg:hidden fixed left-0 z-[28] top-[calc(3.75rem+var(--safe-area-inset-top,0px))] sm:top-[calc(5rem+var(--safe-area-inset-top,0px))] md:top-[calc(5.5rem+var(--safe-area-inset-top,0px))] pt-2 pl-[max(0.75rem,env(safe-area-inset-left,0px))]"
        aria-hidden
      >
        <button
          type="button"
          id="settings-mobile-menu-trigger"
          onClick={handleClick}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] min-w-[44px] rounded-xl bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)] text-[var(--ds-text-primary)] shadow-lg shadow-black/20 hover:bg-white/10 active:bg-white/15 transition-colors touch-manipulation focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)]"
          aria-label={t('settingsMenu.openMenu')}
        >
          <PanelLeft className="w-5 h-5 sm:w-6 sm:h-6 flex-shrink-0" aria-hidden />
          <span className="sr-only sm:not-sr-only sm:inline text-sm font-medium">{t('nav.menu')}</span>
        </button>
      </div>
      {/* Placeholder pour éviter que le contenu passe sous le bouton fixe */}
      <div className="lg:hidden h-14 shrink-0" aria-hidden />
    </>
  );
}
