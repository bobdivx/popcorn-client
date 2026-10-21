import type { ComponentChildren } from 'preact';
import type { LoadingCardProps } from './LoadingCard';
import { DsLoader } from './DsLoader';

type FullScreenLoadingOverlayProps = {
  /** Titre principal (affiché sous le bloc « Chargement », comme sous-titre) */
  title: LoadingCardProps['title'];
  /** Description optionnelle sous le titre */
  description?: LoadingCardProps['description'];
  /** Texte secondaire discret */
  descriptionSubtle?: LoadingCardProps['descriptionSubtle'];
  /** Conservé pour compatibilité (l'écran éditorial n'affiche pas d'icône). */
  iconContent?: LoadingCardProps['iconContent'];
  /** Message d’info en bas */
  infoMessage?: LoadingCardProps['infoMessage'];
  /** Contenu additionnel (étapes, boutons, etc.) */
  children?: ComponentChildren;
  /** Callback pour le bouton de fermeture */
  onClose?: () => void;
};

/**
 * Overlay plein écran = MÊME rendu que l'écran de chargement unique (#popcorn-loading-fallback,
 * Layout.astro) : fond éditorial, « POPCORNN / CHARGEMENT / trait » exactement au centre de
 * l'écran (horizontal + vertical, texte compris). Les infos secondaires (statut, erreurs,
 * actions) sont placées SOUS le bloc centré, sans jamais le décaler — ce qui évitait le texte
 * « pas centré » de l'ancienne carte (LoadingCard + rangée « Fermer » en flux).
 */
export function FullScreenLoadingOverlay({
  title,
  description,
  descriptionSubtle,
  infoMessage,
  children,
  onClose,
}: FullScreenLoadingOverlayProps) {
  return (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden"
      style={{ background: '#0c0d10', color: '#f4f1ec' }}
      data-unified-loader
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="absolute z-10 btn btn-xs btn-ghost text-white/70"
          style={{ top: 'calc(1rem + var(--safe-area-inset-top, 0px))', right: '1rem' }}
        >
          Fermer
        </button>
      )}
      <div className="absolute inset-0 flex items-center justify-center">
        <DsLoader size="lg" />
      </div>
      <div
        className="absolute left-0 right-0 flex flex-col items-center gap-3 px-6 text-center overflow-y-auto"
        style={{ top: 'calc(50% + 5.5rem)', maxHeight: 'calc(50% - 6rem)' }}
      >
        {title ? <p className="ed-loader__label">{title}</p> : null}
        {description ? <div className="text-sm text-white/70 max-w-lg">{description}</div> : null}
        {descriptionSubtle ? <div className="text-xs text-white/50 max-w-lg">{descriptionSubtle}</div> : null}
        {children ? <div className="w-full max-w-lg mx-auto">{children}</div> : null}
        {infoMessage ? <div className="text-xs text-white/50 max-w-lg">{infoMessage}</div> : null}
      </div>
    </div>
  );
}
