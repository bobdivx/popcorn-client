import type { ComponentChildren } from 'preact';
import { HeroSection } from '../dashboard/components/HeroSection';
import type { ContentItem } from '../../lib/client/types';

interface PageContainerProps {
  pageId: string;
  heroItems?: ContentItem[];
  onHeroPlay?: (item: ContentItem) => void;
  /** Action du bouton principal du hero (OK télécommande) — défaut : fiche média. */
  onHeroPrimaryAction?: (item: ContentItem) => void | Promise<void>;
  heroPrimaryButtonLabel?: string;
  heroPrimaryButtonIcon?: ComponentChildren;
  children: ComponentChildren;
}

export function PageContainer({
  pageId,
  heroItems = [],
  onHeroPlay,
  onHeroPrimaryAction,
  heroPrimaryButtonLabel,
  heroPrimaryButtonIcon,
  children,
}: PageContainerProps) {
  return (
    <div className="min-h-screen bg-black text-white relative" data-page={pageId}>
      {heroItems.length > 0 && onHeroPlay ? (
        <HeroSection
          items={heroItems}
          onPlay={onHeroPlay}
          onPrimaryAction={onHeroPrimaryAction}
          primaryButtonLabel={heroPrimaryButtonLabel}
          primaryButtonIcon={heroPrimaryButtonIcon}
          size="large"
        />
      ) : null}

      {children}
    </div>
  );
}
