import { ArrowLeft } from 'lucide-preact';
import { useI18n } from '../../lib/i18n/useI18n';

type Props = {
  titleKey: string;
  subtitleKey?: string;
  backHref?: string;
  children?: preact.ComponentChildren;
};

export default function TranslatedPageHeader({ titleKey, subtitleKey, backHref, children }: Props) {
  const { t } = useI18n();
  
  return (
    <div className="mb-6 sm:mb-8 md:mb-10">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6 mb-3 sm:mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl tv:text-6xl font-black text-white tracking-tight">
            {t(titleKey)}
          </h1>
          {subtitleKey ? (
            <p className="text-gray-400 text-xs sm:text-sm md:text-base lg:text-lg tv:text-xl mt-2">
              {t(subtitleKey)}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 md:gap-4 w-full sm:w-auto">
          {children}
          {backHref ? (
            <a
              href={backHref}
              className="btn btn-ghost text-xs sm:text-sm md:text-base lg:text-lg px-3 sm:px-4 md:px-6 py-2 sm:py-3 min-h-[44px] sm:min-h-[48px] focus:outline-none focus:ring-4 focus:ring-primary-600/50 hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              {t('pageHeader.back')}
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
