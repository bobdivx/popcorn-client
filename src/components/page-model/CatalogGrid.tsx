import type { ContentItem } from '../../lib/client/types';
import { useI18n } from '../../lib/i18n/useI18n';
import { TitlePreviewCard } from './TitlePreviewCard';

interface CatalogGridProps {
  title: string;
  items: ContentItem[];
  onNavigate: (item: ContentItem) => void;
}

/** Grille catalogue : tous les titres d'un genre, navigable à la télécommande. */
export function CatalogGrid({ title, items, onNavigate }: CatalogGridProps) {
  const { t } = useI18n();
  return (
    <section className="px-3 sm:px-4 md:px-6 lg:px-8 xl:px-12 tv:px-16 mb-10">
      <h2 className="mb-4 text-xl sm:text-2xl tv:text-3xl font-bold text-white">{title}</h2>
      {items.length === 0 ? (
        <p className="py-8 text-white/55">{t('search.noResults')}</p>
      ) : (
        <div
          data-tv-list
          className="grid justify-start gap-x-3 gap-y-5 tv:gap-x-4 tv:gap-y-6"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 168px))' }}
        >
          {items.map((item) => (
            <div key={item.id} data-tv-list-item className="min-w-0">
              <TitlePreviewCard item={item} onNavigate={onNavigate} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
