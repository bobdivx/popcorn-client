import type { ComponentChildren } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';

interface DsPageHeaderProps {
  titleKey: string;
  subtitleKey?: string;
  children?: ComponentChildren;
}

export default function DsPageHeader({ titleKey, subtitleKey, children }: DsPageHeaderProps) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4 sm:mb-6 md:mb-8">
      <div className="min-w-0 flex-1">
        <h1 className="ds-title-page truncate text-xl sm:text-2xl md:text-3xl">{t(titleKey)}</h1>
        {subtitleKey && (
          <p className="ds-text-secondary mt-0.5 sm:mt-1 text-sm sm:text-base">{t(subtitleKey)}</p>
        )}
      </div>
      {children && (
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0 w-full sm:w-auto">
          {children}
        </div>
      )}
    </div>
  );
}
