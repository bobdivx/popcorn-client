import { useEffect, useState } from 'preact/hooks';
import { Clock, Moon, Sun } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import {
  THEME_CHANGED_EVENT,
  THEME_DAY_START_HOUR,
  THEME_NIGHT_START_HOUR,
  cycleThemePreference,
  readThemePreference,
  resolveTheme,
  saveTheme,
  type ThemePreference,
} from '../../lib/theme';

type Props = {
  variant?: 'icon' | 'menu';
};

export default function ThemeToggle({ variant = 'icon' }: Props) {
  const { t } = useI18n();
  const [preference, setPreference] = useState<ThemePreference>(() => readThemePreference());
  const resolved = resolveTheme(preference);

  useEffect(() => {
    const sync = () => setPreference(readThemePreference());
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(THEME_CHANGED_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const label =
    preference === 'auto'
      ? t('nav.themeAuto', { dayStart: THEME_DAY_START_HOUR, nightStart: THEME_NIGHT_START_HOUR })
      : resolved === 'light'
        ? t('nav.themeLight')
        : t('nav.themeDark');

  const Icon = preference === 'auto' ? Clock : resolved === 'light' ? Sun : Moon;

  const onClick = () => {
    const next = cycleThemePreference(preference);
    saveTheme(next);
    setPreference(next);
  };

  if (variant === 'menu') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-center gap-3 px-4 py-3.5 rounded-lg text-[var(--ds-text-primary)] hover:bg-[var(--ds-surface)] transition-all duration-200"
        tabIndex={0}
        data-focusable
        aria-label={label}
        title={label}
      >
        <Icon className="w-5 h-5 flex-shrink-0 opacity-80" />
        <span className="flex-1 text-left">{t('nav.theme')}</span>
        <span className="text-xs text-[var(--ds-text-tertiary)]">
          {t(`interfaceSettings.themeOptions.${preference}`)}
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="gtv-icon-btn ds-focus-glow ds-active-glow flex-shrink-0 relative inline-flex items-center justify-center transition-all duration-200 hover:scale-110"
      aria-label={label}
      title={label}
      tabIndex={0}
      data-focusable
    >
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 tv:w-6 tv:h-6 relative z-10" />
    </button>
  );
}
