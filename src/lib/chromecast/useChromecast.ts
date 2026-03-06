/**
 * Hook Chromecast pour le lecteur direct.
 * Retourne une interface permettant d'afficher le bouton Cast et de lancer un cast.
 * Pour l'instant : stub (Chromecast non disponible), à implémenter si besoin.
 */
export interface UseChromecastReturn {
  isAvailable: boolean;
  isCasting: boolean;
  castMedia: (src: string, title: string, currentTime: number) => void;
}

export function useChromecast(): UseChromecastReturn {
  return {
    isAvailable: false,
    isCasting: false,
    castMedia: () => {},
  };
}
