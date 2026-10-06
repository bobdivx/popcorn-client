import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { HubModal, closeSettingsSub } from './hub/HubModal';

interface SettingsSubPageFrameProps {
  backHref?: string;
  backOnClick?: () => void;
  icon?: LucideIcon;
  title: string;
  description?: string;
  children: ComponentChildren;
  accent?: string;
}

/**
 * Détail d’un réglage : modale au-dessus de la grille.
 * `icon` et `accent` restent acceptés pour les appelants existants.
 */
export function SettingsSubPageFrame({
  backHref,
  backOnClick,
  title,
  description,
  children,
}: SettingsSubPageFrameProps) {
  const close = () => closeSettingsSub(backHref, backOnClick);
  return (
    <HubModal open title={title} description={description} onClose={close} size="xl">
      {children}
    </HubModal>
  );
}
