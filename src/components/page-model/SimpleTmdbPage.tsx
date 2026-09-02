import type { ComponentChildren } from 'preact';
import type { ContentItem } from '../../lib/client/types';
import { getDisplayTitle } from '../../lib/utils/title-display';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { CarouselSection } from './CarouselSection';
import { PageContainer } from './PageContainer';
import { PageHeader } from './PageHeader';
import { TitlePreviewCard } from './TitlePreviewCard';
import { contentItemKey } from '../dashboard/utils/browsePriority';
import type { EnrichedResumeItem } from '../dashboard/hooks/useResumeWatching';

interface SimpleTmdbSection {
  id: string;
  title: string;
  items: ContentItem[];
  /** Type d'affichage : 'resume' = barre de progression + méta sous la carte focus. */
  kind?: 'standard' | 'resume';
  /** Affiché avant les suggestions (reprendre, téléchargements, récemment téléchargés). */
  priority?: boolean;
}

interface SimpleTmdbPageProps {
  pageId: string;
  /** Titre de page ; vide = pas de bandeau titre (accueil type billboard). */
  title?: string;
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

function resumeMetaLine(item: EnrichedResumeItem): string {
  const title = getDisplayTitle(item);
  if (item.type === 'tv' && item.currentSeason != null && item.currentEpisode != null) {
    return `S${item.currentSeason} E${item.currentEpisode} · ${title}`;
  }
  return title;
}

function resumeMetaSubLine(item: EnrichedResumeItem): string | null {
  const pos = item.positionSeconds;
  const dur = item.durationSeconds;
  if (typeof pos === 'number' && typeof dur === 'number' && dur > pos && dur > 0) {
    const remainMin = Math.max(1, Math.round((dur - pos) / 60));
    return `Encore ${remainMin} min`;
  }
  return null;
}

export function SimpleTmdbPage({
  pageId,
  title = '',
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
  const showPageHeader = Boolean((title && title.trim()) || headerAction);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page={pageId}>
        {showPageHeader ? (
          <PageHeader title={title || ''} subtitle={subtitle} headerAction={headerAction} />
        ) : null}
        <div className="pt-4 sm:pt-6">
          <TorrentCardsShadowLoader rows={3} showHero />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white relative" data-page={pageId}>
        {showPageHeader ? (
          <PageHeader title={title || ''} subtitle={subtitle} headerAction={headerAction} />
        ) : null}
        <div className="flex min-h-[40vh] items-center justify-center px-4 text-red-400">{error}</div>
      </div>
    );
  }

  const visibleSections = sections.filter((section) => section.items.length > 0);
  const prioritySections = visibleSections.filter((section) => section.priority);
  const restSections = visibleSections.filter((section) => !section.priority);
  const hasContent = visibleSections.length > 0;

  const renderSection = (section: SimpleTmdbSection) => (
    <div key={section.id} data-browse-row>
      <CarouselSection title={section.title}>
        {section.items.map((item) => {
          if (section.kind === 'resume') {
            const resume = item as EnrichedResumeItem;
            return (
              <TitlePreviewCard
                key={`${section.id}:${contentItemKey(item)}`}
                item={item}
                onNavigate={onNavigate}
                progress={resume.progress}
                metaLine={resumeMetaLine(resume)}
                metaSubLine={resumeMetaSubLine(resume)}
              />
            );
          }
          return (
            <TitlePreviewCard
              key={`${section.id}:${contentItemKey(item)}`}
              item={item}
              onNavigate={onNavigate}
            />
          );
        })}
      </CarouselSection>
    </div>
  );

  return (
    <PageContainer
      pageId={pageId}
      heroItems={heroItems}
      onHeroPlay={onNavigate}
    >
      {showPageHeader ? (
        <PageHeader title={title || ''} subtitle={subtitle} headerAction={headerAction} />
      ) : null}
      <div className={`pb-8 tv:pb-12 overflow-visible ${showPageHeader ? 'pt-2 tv:pt-4' : 'pt-1'}`}>
        {hasContent ? (
          <>
            {prioritySections.map((section) => renderSection(section))}
            {children ? <div>{children}</div> : null}
            {restSections.map((section) => renderSection(section))}
          </>
        ) : (
          <>
            {children ? <div>{children}</div> : null}
            <section className="mx-4 sm:mx-6 lg:mx-16 tv:mx-24 rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
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
