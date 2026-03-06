import type { ComponentChildren } from 'preact';
import { LoadingIcon } from './LoadingIcon';
import { Clock } from 'lucide-preact';

export interface LoadingCardProps {
  /** Titre principal (ex. "Chargement...") */
  title: string;
  /** Description ou sous-texte */
  description?: string;
  /** Texte secondaire plus discret */
  descriptionSubtle?: string;
  /** Afficher la barre de progression animée */
  showProgressBar?: boolean;
  /** Message info box en bas (ex. "Veuillez réessayer dans quelques minutes.") */
  infoMessage?: string;
  /** Contenu du cercle central : par défaut logo Popcorn */
  iconContent?: ComponentChildren;
  /** Enfants additionnels après la description (ex. étapes, liste) */
  children?: ComponentChildren;
  /** Classe sur le wrapper externe */
  className?: string;
}

/**
 * Carte de chargement type C411 : glass + glow + barre gradient + icon-container + titre/description.
 * Réutilisable pour écran initial, recherche, buffering, assistant upload.
 */
export function LoadingCard({
  title,
  description,
  descriptionSubtle,
  showProgressBar = true,
  infoMessage,
  iconContent,
  children,
  className = '',
}: LoadingCardProps) {
  const defaultIcon = (
    <img src="/popcorn_logo.png" alt="" class="w-full h-full object-contain" style={{ filter: 'drop-shadow(0 0 10px rgba(168, 85, 247, 0.5))' }} />
  );

  return (
    <div class={`ds-card-loading-wrapper ${className}`.trim()}>
      <div class="ds-card-loading-glow" />
      <div class="ds-card-loading">
        <div class="ds-card-loading-bar" />
        <div class="ds-card-loading-content text-center">
          <LoadingIcon>{iconContent ?? defaultIcon}</LoadingIcon>
          <h1 class="ds-loading-title">{title}</h1>
          {(description || descriptionSubtle) && (
            <p class="ds-loading-description">
              {description}
              {descriptionSubtle && (
                <>
                  <br />
                  <span class="ds-loading-description-subtle">{descriptionSubtle}</span>
                </>
              )}
            </p>
          )}
          {children}
          {showProgressBar && (
            <div class="ds-progress-container mb-8">
              <div class="ds-progress-bar" />
              <div class="ds-progress-wave" />
            </div>
          )}
          {infoMessage && (
            <div class="ds-loading-info-box">
              <div class="ds-loading-info-box-content">
                <Clock aria-hidden />
                <span class="text-sm">{infoMessage}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
