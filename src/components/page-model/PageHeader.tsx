import type { ComponentChildren } from 'preact';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Bloc optionnel (ex. bascule Catalogue / Bibliothèque). Aligné à gauche sur TV. */
  headerAction?: ComponentChildren;
}

export function PageHeader({ title, subtitle, headerAction }: PageHeaderProps) {
  return (
    <div className="tv-page-header px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 pt-4 sm:pt-6 pb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="tv-page-title-block min-w-0">
          <h1 className={`tv-page-title text-2xl sm:text-3xl md:text-4xl tv:text-5xl font-bold text-white ${subtitle ? 'mb-2' : ''}`}>{title}</h1>
          {subtitle ? <p className="tv-page-subtitle text-gray-400 text-sm sm:text-base">{subtitle}</p> : null}
        </div>
        {headerAction ? <div className="tv-page-header-action flex-shrink-0 self-start">{headerAction}</div> : null}
      </div>
    </div>
  );
}
