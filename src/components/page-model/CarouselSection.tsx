import type { ComponentChildren } from 'preact';
import CarouselRow from '../torrents/CarouselRow';

interface CarouselSectionProps {
  title: string;
  children: ComponentChildren;
}

export function CarouselSection({ title, children }: CarouselSectionProps) {
  return (
    <CarouselRow title={title} autoScroll={false}>
      {children}
    </CarouselRow>
  );
}
