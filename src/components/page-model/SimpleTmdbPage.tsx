import type { ComponentChildren } from 'preact';
import type { ContentItem } from '../../lib/client/types';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { CarouselSection } from './CarouselSection';
import { PageContainer } from './PageContainer';
import { PageHeader } from './PageHeader';
import { PosterCard } from './PosterCard';
import { LazyResumePoster } from '../dashboard/components/LazyResumePoster';
import type { EnrichedResumeItem } from '../dashboard/hooks/useResumeWatching';

interface SimpleTmdbSection {
  id: string;
  title: string;
  items: ContentItem[];
  /** Type d'affichage : 'resume' utilise ResumePoster (barre de progression + badges TMDB). */
  kind?: 'standard' | 'resume';
  /** Affiché avant les suggestions (reprendre, téléchargements, récemment téléchargés). */
  priority?: boolean;
}

interface SimpleTmdbPageProps {
  pageId: string;
  title: string;
  subtitle?: string;
  heroItems: ContentItem[];
  sections: SimpleTmdbSection[];
  loading: boolean;
  error: string | null;
  onNavigate: (item: ContentItem) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  /** Bloc optionnel rendu à droite du titre (ex. bouton bascule Bibliothèque). */
  headerAction?: ComponentChildren;
  /** Contenu optionnel injecté en haut de la page (ex. SuggestionsSection). */
  children?: ComponentChildren;
}

export function SimpleTmdbPage({
  pageId,
  title,
  subtitle,
  heroItems,
  sections,
  loading,
  error,
  onNavigate,
  emptyTitle,
  emptyDescription,
  headerAction,
  children,
}: SimpleTmdbPageProps) {
  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page={pageId}>
        <PageHeader title={title} subtitle={subtitle} headerAction={headerAction} />
        <div className="pt-4 sm:pt-6">
          <TorrentCardsShadowLoader rows={3} showHero />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page={pageId}>
        <PageHeader title={title} subtitle={subtitle} headerAction={headerAction} />
        <div className="flex min-h-[40vh] items-center justify-center px-4 text-red-400">{error}</div>
      </div>
    );
  }

  const visibleSections = sections.filter((section) => section.items.length > 0);
  const prioritySections = visibleSections.filter((section) => section.priority);
  const restSections = visibleSections.filter((section) => !section.priority);
  const hasContent = visibleSections.length > 0;

  const renderSection = (section: SimpleTmdbSection, index: number) => (
    <div
      key={section.id}
      className="animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0"
      style={{ animationDelay: `${index * 150}ms` }}
    >
      <CarouselSection title={section.title}>
        {section.kind === 'resume'
          ? section.items.map((item) => (
              <div
                key={item.id}
                className="flex-shrink-0 w-[140px] sm:w-[160px] md:w-[180px] lg:w-[280px] xl:w-[320px] tv:w-[400px]"
              >
                <LazyResumePoster item={item as EnrichedResumeItem} />
              </div>
            ))
          : section.items.map((item) => (
              <PosterCard key={item.id} item={item} onNavigate={onNavigate} />
            ))}
      </CarouselSection>
    </div>
  );

  return (
    <PageContainer
      pageId={pageId}
      heroItems={heroItems}
      onHeroPlay={onNavigate}
    >
      <PageHeader title={title} subtitle={subtitle} headerAction={headerAction} />
      <div className="pb-8 tv:pb-12 pt-2 tv:pt-4 overflow-visible">
        {hasContent ? (
          <>
            {prioritySections.map((section, index) => renderSection(section, index))}
            {children && (
              <div
                className="animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0"
                style={{ animationDelay: `${prioritySections.length * 150}ms` }}
              >
                {children}
              </div>
            )}
            {restSections.map((section, index) =>
              renderSection(section, prioritySections.length + (children ? 1 : 0) + index)
            )}
          </>
        ) : (
          <>
            {children && (
              <div className="animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0" style={{ animationDelay: '0ms' }}>
                {children}
              </div>
            )}
            <section className="mx-4 sm:mx-6 lg:mx-16 tv:mx-24 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0">
              <p className="text-lg font-semibold text-white">{emptyTitle}</p>
              {emptyDescription ? (
                <p className="mx-auto mt-2 max-w-2xl text-sm text-white/60">{emptyDescription}</p>
              ) : null}
            </section>
          </>
        )}
      </div>
    </PageContainer>
  );
}
