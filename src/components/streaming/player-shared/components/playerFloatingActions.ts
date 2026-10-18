/**
 * Boutons flottants du lecteur (Passer le générique, Épisode suivant, Reprise) — hors TV.
 *
 * Hauteur FIXE au-dessus de la barre de commandes, que le chrome soit affiché ou non :
 * sur mobile, le 1er toucher affiche le chrome ; si le bouton changeait alors de hauteur,
 * il sautait sous le doigt et le tap tombait à côté (il fallait taper deux fois).
 */
export const PLAYER_FLOATING_ACTION_BOTTOM = 'calc(11rem + env(safe-area-inset-bottom, 0px))';

const stop = (e: Event) => e.stopPropagation();

/**
 * Le toucher d'un bouton flottant ne doit pas remonter jusqu'au conteneur du lecteur
 * (révélation / bascule des contrôles au toucher, gestes double-tap).
 */
export const stopPlayerTapPropagation = {
  onTouchStart: stop,
  onPointerDown: stop,
  onMouseDown: stop,
} as const;
