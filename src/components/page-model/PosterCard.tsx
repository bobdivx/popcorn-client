import type { ContentItem } from '../../lib/client/types';
import { TitlePreviewCard } from './TitlePreviewCard';

interface PosterCardProps {
  item: ContentItem;
  onNavigate: (item: ContentItem) => void;
  badge?: string | null;
  badgeTone?: 'ok' | 'pending' | 'bad' | 'neutral';
}

/** Alias browse : même tuile portrait/paysage que les rangées Accueil / Films / Séries. */
export function PosterCard({ item, onNavigate, badge, badgeTone }: PosterCardProps) {
  return <TitlePreviewCard item={item} onNavigate={onNavigate} badge={badge} badgeTone={badgeTone} />;
}
