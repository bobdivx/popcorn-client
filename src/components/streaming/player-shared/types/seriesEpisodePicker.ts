/** Élément du rail « choisir un épisode » (overlay pause, style Netflix). */
export interface SeriesEpisodePickerItem {
  variantId: string;
  label: string;
  sublabel?: string;
  thumbnailUrl?: string | null;
}
