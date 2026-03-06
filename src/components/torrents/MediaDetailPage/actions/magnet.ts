import type { MediaDetailPageProps } from '../types';

export interface MagnetOptions {
  torrent: MediaDetailPageProps['torrent'];
  setMagnetCopied: (value: boolean) => void;
}

/**
 * Copie le lien magnet dans le presse-papiers
 */
export async function handleCopyMagnet(options: MagnetOptions): Promise<void> {
  const { torrent, setMagnetCopied } = options;
  
  let magnetUri = torrent._externalMagnetUri || null;

  if (!magnetUri && torrent._externalLink && torrent._externalLink.startsWith('magnet:')) {
    magnetUri = torrent._externalLink;
  }

  if (magnetUri) {
    try {
      await navigator.clipboard.writeText(magnetUri);
      setMagnetCopied(true);
      setTimeout(() => setMagnetCopied(false), 2000);
    } catch (err) {
      const textarea = document.createElement('textarea');
      textarea.value = magnetUri;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        setMagnetCopied(true);
        setTimeout(() => setMagnetCopied(false), 2000);
      } catch (e) {
        alert('Impossible de copier le lien magnet. Lien: ' + magnetUri);
      }
      document.body.removeChild(textarea);
    }
  } else {
    alert('Aucun lien magnet disponible pour ce torrent');
  }
}
