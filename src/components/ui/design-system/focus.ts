/**
 * Classes réutilisables pour le focus et l’état actif (halo blanc, norme design).
 * Une seule classe à ajouter sur les éléments focusables (boutons, liens, cartes).
 * Voir design-system.css : .ds-focus-glow, .ds-active-glow
 */

/** Classe pour le focus : bordure blanche scintillante (animation ds-halo-pulse) */
export const focusGlowClass = 'ds-focus-glow';

/** Classe pour le clic : halo blanc + léger scale */
export const activeGlowClass = 'ds-active-glow';

/** Focus + actif (boutons, cartes cliquables) */
export const focusAndActiveGlowClass = `${focusGlowClass} ${activeGlowClass}`;
