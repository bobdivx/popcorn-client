import type { ContentItem } from '../../lib/client/types';
import TorrentCardsShadowLoader from '../ui/TorrentCardsShadowLoader';
import { CarouselSection } from './CarouselSection';
import { PageContainer } from './PageContainer';
import { PageHeader } from './PageHeader';
import { PosterCard } from './PosterCard';

interface SimpleTmdbSection {
  id: string;
  title: string;
  items: ContentItem[];
}

interface SimpleTmdbPageProps {
  pageId: string;
  title: string;
  subtitle: string;
  heroItems: ContentItem[];
  sections: SimpleTmdbSection[];
  loading: boolean;
  error: string | null;
  onNavigate: (item: ContentItem) => void;
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
}: SimpleTmdbPageProps) {
  if (loading) {
    return (
      <div className="min-h-[60vh] bg-black pt-4 sm:pt-6">
        <TorrentCardsShadowLoader rows={3} showHero />
      </div>
    );
  }

  if (error) {
    return <div className="flex min-h-[40vh] items-center justify-center px-4 text-red-400">{error}</div>;
  }

  return (
    <PageContainer pageId={pageId} heroItems={heroItems} onHeroPlay={onNavigate}>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="pb-8 tv:pb-12 pt-2 tv:pt-4 overflow-visible animate-[fade-in-up_0.6s_ease-out_forwards] opacity-0">
        {sections.map((section) =>
          section.items.length > 0 ? (
            <CarouselSection key={section.id} title={section.title}>
              {section.items.map((item) => (
                <PosterCard key={item.id} item={item} onNavigate={onNavigate} />
              ))}
            </CarouselSection>
          ) : null
        )}
      </div>
    </PageContainer>
  );
}
