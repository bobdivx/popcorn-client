import type { ComponentChildren } from 'preact';
import { HeroSection } from '../dashboard/components/HeroSection';
import type { ContentItem } from '../../lib/client/types';

interface PageContainerProps {
  pageId: string;
  heroItems?: ContentItem[];
  onHeroPlay?: (item: ContentItem) => void;
  heroPrimaryButtonLabel?: string;
  heroPrimaryButtonIcon?: ComponentChildren;
  children: ComponentChildren;
}

export function PageContainer({
  pageId,
  heroItems = [],
  onHeroPlay,
  heroPrimaryButtonLabel,
  heroPrimaryButtonIcon,
  children,
}: PageContainerProps) {
  return (
    <div className="min-h-screen bg-black text-white" data-page={pageId}>
      {heroItems.length > 0 && onHeroPlay ? (
        <HeroSection
          items={heroItems}
          onPlay={onHeroPlay}
          primaryButtonLabel={heroPrimaryButtonLabel}
          primaryButtonIcon={heroPrimaryButtonIcon}
          size="large"
        />
      ) : null}

      {children}
    </div>
  );
}
