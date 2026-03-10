import type { ComponentChildren } from 'preact';
import { LoadingCard, type LoadingCardProps } from './LoadingCard';

type FullScreenLoadingOverlayProps = {
  /** Titre principal de la carte */
  title: LoadingCardProps['title'];
  /** Description optionnelle sous le titre */
  description?: LoadingCardProps['description'];
  /** Texte secondaire discret */
  descriptionSubtle?: LoadingCardProps['descriptionSubtle'];
  /** Contenu de l’icône centrale (sinon logo par défaut) */
  iconContent?: LoadingCardProps['iconContent'];
  /** Message d’info en bas de carte */
  infoMessage?: LoadingCardProps['infoMessage'];
  /** Contenu additionnel (étapes, boutons, etc.) */
  children?: ComponentChildren;
  /** Callback pour le bouton de fermeture */
  onClose?: () => void;
};

export function FullScreenLoadingOverlay({
  title,
  description,
  descriptionSubtle,
  iconContent,
  infoMessage,
  children,
  onClose,
}: FullScreenLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[9999] bg-page overflow-hidden">
      <div className="bg-page-gradient"></div>
      <div className="bg-page-grid"></div>
      <div className="bg-page-orbs">
        <div className="loading-orb loading-orb-1"></div>
        <div className="loading-orb loading-orb-2"></div>
        <div className="loading-orb loading-orb-3"></div>
      </div>
      <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-4 text-center">
        <div className="w-full max-w-[42rem] mb-4 flex justify-end">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-ghost text-base-content/70"
            >
              Fermer
            </button>
          )}
        </div>
        <div className="w-full max-w-[42rem]">
          <LoadingCard
            title={title}
            description={description}
            descriptionSubtle={descriptionSubtle}
            iconContent={iconContent}
            infoMessage={infoMessage}
            showProgressBar
            className="mx-auto"
          >
            {children}
          </LoadingCard>
        </div>
      </div>
    </div>
  );
}

