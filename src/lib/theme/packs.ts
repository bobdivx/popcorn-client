/**
 * Bibliothèque de langages visuels (ui packs).
 * Le thème clair/sombre reste `theme` (light|dark|auto = selon l’heure).
 * Un pack définit la peau : tokens, densité, contrôles.
 *
 * Tous les packs partagent le même layout (mobile <768, tablette 768–1023, PC ≥1024).
 * Le sélecteur est Paramètres → Interface → Thème. Tesla est le pack par défaut.
 */

export const UI_PACK_IDS = ['classic', 'tesla'] as const;
export type UiPackId = (typeof UI_PACK_IDS)[number];

export type UiPack = {
  id: UiPackId;
  name: { fr: string; en: string };
  description: { fr: string; en: string };
  /** Aperçu des 3 couleurs (fond, accent, texte) */
  swatch: { bg: string; accent: string; text: string };
};

/** Pack actuel de l’app — conservé tel quel. */
export const CLASSIC_PACK: UiPack = {
  id: 'classic',
  name: { fr: 'Popcornn', en: 'Popcornn' },
  description: {
    fr: 'Ancien thème : sombre, violet, cartes.',
    en: 'Previous theme: dark, violet, cards.',
  },
  swatch: { bg: '#121212', accent: '#a855f7', text: '#ffffff' },
};

/** Pack Tesla — accent bleu, clair et sombre. */
export const TESLA_PACK: UiPack = {
  id: 'tesla',
  name: { fr: 'Tesla', en: 'Tesla' },
  description: {
    fr: 'Accent bleu, surfaces Tesla. Suit le thème clair ou sombre.',
    en: 'Blue accent, Tesla surfaces. Follows light or dark theme.',
  },
  swatch: { bg: '#111113', accent: '#3b6ae1', text: '#f4f4f5' },
};

export const UI_PACKS: readonly UiPack[] = [CLASSIC_PACK, TESLA_PACK];

export const DEFAULT_UI_PACK: UiPackId = 'tesla';

export function isUiPackId(value: unknown): value is UiPackId {
  return value === 'classic' || value === 'tesla';
}

export function getUiPack(id: UiPackId): UiPack {
  return UI_PACKS.find((p) => p.id === id) ?? CLASSIC_PACK;
}
