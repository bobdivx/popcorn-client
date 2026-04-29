import type { ComponentChildren } from 'preact';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Bloc optionnel positionné à droite du titre (ex. bouton bascule Bibliothèque). */
  headerAction?: ComponentChildren;
}

export function PageHeader({ title, subtitle, headerAction }: PageHeaderProps) {
  return (
    <div className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-4 sm:pt-6 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className={`text-2xl sm:text-3xl md:text-4xl tv:text-5xl font-bold text-white ${subtitle ? 'mb-2' : ''}`}>{title}</h1>
          {subtitle ? <p className="text-gray-400 text-sm sm:text-base">{subtitle}</p> : null}
        </div>
        {headerAction ? <div className="flex-shrink-0">{headerAction}</div> : null}
      </div>
    </div>
  );
}
