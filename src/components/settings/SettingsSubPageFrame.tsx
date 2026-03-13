import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

interface SettingsSubPageFrameProps {
  /** URL du bouton "retour" (navigation via <a href>) */
  backHref?: string;
  /** Handler du bouton "retour" (navigation via état local) */
  backOnClick?: () => void;
  icon: LucideIcon;
  title: string;
  description?: string;
  children: ComponentChildren;
}

/**
 * Frame standard pour les sous-pages des paramètres.
 * Remplace le pattern SubPageFrame copié-collé dans chaque SubMenuPanel.
 */
export function SettingsSubPageFrame({
  backHref,
  backOnClick,
  icon: Icon,
  title,
  description,
  children,
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
      <div class="sc-frame">
        <div class="sc-frame-header">
          <div class="sc-frame-icon">
            <Icon className="w-5 h-5" strokeWidth={1.8} aria-hidden />
          </div>
          <div>
            <div class="sc-frame-title">{title}</div>
            {description && <div class="sc-frame-desc">{description}</div>}
          </div>
        </div>
        <div class="sc-frame-body">{children}</div>
      </div>
    </div>
  );
}
