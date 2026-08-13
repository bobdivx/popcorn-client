import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { SettingsCard, type SettingsCardAccent } from './SettingsCard';

interface SettingsSubPageFrameProps {
  /** URL du bouton "retour" (navigation via <a href>) */
  backHref?: string;
  /** Handler du bouton "retour" (navigation via état local) */
  backOnClick?: () => void;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ComponentChildren;
  /** Accent de la carte (violet par défaut, amber pour CTA) */
  accent?: SettingsCardAccent;
}

/**
 * Frame standard pour les sous-pages des paramètres.
 * Carte Boost / C411 via SettingsCard.
 */
export function SettingsSubPageFrame({
  backHref,
  backOnClick,
  icon,
  title,
  description,
  children,
  accent = 'violet',
}: SettingsSubPageFrameProps) {
  const { t } = useI18n();

  const backEl = backHref ? (
    <a
      href={backHref}
      data-astro-prefetch
      class="sc-back"
      aria-label={t('common.back')}
    >
      <ArrowLeft className="w-4 h-4" aria-hidden />
      <span>{t('common.back')}</span>
    </a>
  ) : (
    <button
      type="button"
      onClick={backOnClick}
      class="sc-back"
      aria-label={t('common.back')}
    >
      <ArrowLeft className="w-4 h-4" aria-hidden />
      <span>{t('common.back')}</span>
    </button>
  );

  return (
    <div class="sc-frame-wrap">
      {backEl}
      <SettingsCard
        accent={accent}
        icon={icon}
        title={title}
        description={description}
      >
        {children}
      </SettingsCard>
    </div>
  );
}
