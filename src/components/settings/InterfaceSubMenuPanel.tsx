import { useState, useEffect } from 'preact/hooks';
import { Globe, Moon, ChevronRight, ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { DsCard, DsCardSection } from '../ui/design-system';
import UiPreferencesPanel from './UiPreferencesPanel';

const BASE_URL = '/settings/ui-preferences';
const ACCENT_ICON_BG = 'var(--ds-accent-violet-muted)';
const ACCENT_ICON_COLOR = 'var(--ds-accent-violet)';

type InterfaceItem = {
  id: string;
  titleKey: string;
  descriptionKey: string;
  icon: typeof Globe;
  sub: string;
};

const INTERFACE_ITEMS: InterfaceItem[] = [
  { id: 'language', titleKey: 'account.language', descriptionKey: 'settingsMenu.interface.languageDescription', icon: Globe, sub: 'language' },
  { id: 'theme', titleKey: 'interfaceSettings.theme', descriptionKey: 'settingsMenu.interface.themeDescription', icon: Moon, sub: 'theme' },
];

function getSubFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const sub = params.get('sub');
  return sub === 'language' || sub === 'theme' ? sub : null;
}

export default function InterfaceSubMenuPanel() {
  const { t } = useI18n();
  const [sub, setSub] = useState<string | null>(getSubFromUrl);

  useEffect(() => {
    setSub(getSubFromUrl());
  }, []);

  useEffect(() => {
    const update = () => setSub(getSubFromUrl());
    window.addEventListener('popstate', update);
    document.addEventListener('astro:page-load', update);
    return () => {
      window.removeEventListener('popstate', update);
      document.removeEventListener('astro:page-load', update);
    };
  }, []);

  if (!canAccess('settings.ui_preferences' as any)) return null;

  if (sub === 'language') {
    const item = INTERFACE_ITEMS.find((i) => i.id === 'language')!;
    const Icon = item.icon;
    return (
      <div className="space-y-6">
        <a
          href={BASE_URL}
          data-astro-prefetch
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span>{t('common.back')}</span>
        </a>
        <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
            <span
              className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
              style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
              aria-hidden
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
              <span className="ds-text-tertiary text-sm">{t(item.descriptionKey)}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 min-w-0">
            <UiPreferencesPanel section="language" embedded />
          </div>
        </div>
      </div>
    );
  }

  if (sub === 'theme') {
    const item = INTERFACE_ITEMS.find((i) => i.id === 'theme')!;
    const Icon = item.icon;
    return (
      <div className="space-y-6">
        <a
          href={BASE_URL}
          data-astro-prefetch
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--ds-accent-violet)] hover:underline focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 rounded"
          aria-label={t('common.back')}
        >
          <ArrowLeft className="w-4 h-4" aria-hidden />
          <span>{t('common.back')}</span>
        </a>
        <div className="rounded-[var(--ds-radius-lg)] overflow-hidden bg-[var(--ds-surface-elevated)] border border-[var(--ds-border)]">
          <div className="px-4 py-3 sm:px-5 sm:py-4 border-b border-[var(--ds-border)] flex items-center gap-3">
            <span
              className="inline-flex w-10 h-10 rounded-xl flex-shrink-0 items-center justify-center"
              style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
              aria-hidden
            >
              <Icon className="w-5 h-5" strokeWidth={1.8} />
            </span>
            <div>
              <h2 className="ds-title-card text-[var(--ds-text-primary)]">{t(item.titleKey)}</h2>
              <span className="ds-text-tertiary text-sm">{t(item.descriptionKey)}</span>
            </div>
          </div>
          <div className="p-4 sm:p-5 min-w-0">
            <UiPreferencesPanel section="theme" embedded />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-5 ds-card-animate-stagger" role="list">
      {INTERFACE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <a
            key={item.id}
            href={`${BASE_URL}?sub=${item.sub}`}
            data-astro-prefetch="hover"
            data-settings-card
            className="block min-w-0 rounded-[var(--ds-radius-lg)] overflow-hidden transition-all hover:scale-[1.01] hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-[var(--ds-accent-violet)] focus:ring-offset-2 focus:ring-offset-[var(--ds-surface)] focus-visible:overflow-visible"
          >
            <DsCard variant="elevated" className="h-full">
              <DsCardSection className="flex flex-col h-full min-h-[120px]">
                <div className="flex items-start justify-between gap-3">
                  <span
                    className="inline-flex w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex-shrink-0 items-center justify-center"
                    style={{ backgroundColor: ACCENT_ICON_BG, color: ACCENT_ICON_COLOR }}
                    aria-hidden
                  >
                    <Icon className="w-5 h-5 sm:w-6 sm:h-6" strokeWidth={1.8} />
                  </span>
                  <ChevronRight className="w-5 h-5 text-[var(--ds-text-tertiary)] flex-shrink-0 mt-0.5" aria-hidden />
                </div>
                <h2 className="ds-title-card text-[var(--ds-text-primary)] text-base sm:text-lg mt-3 truncate">
                  {t(item.titleKey)}
                </h2>
                <span className="ds-text-tertiary text-sm mt-3">{t(item.descriptionKey)}</span>
                <span className="mt-auto pt-4 text-xs font-medium text-[var(--ds-accent-violet)] flex items-center gap-1" aria-hidden>
                  {t('common.open')}
                </span>
              </DsCardSection>
            </DsCard>
          </a>
        );
      })}
    </div>
  );
}
