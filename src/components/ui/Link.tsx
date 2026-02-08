/**
 * Composant Link qui préserve toujours le port dans les URLs
 * Utilise window.location.origin pour garantir que le port est inclus
 */

import { getFullUrl } from '../../lib/utils/navigation.js';

interface LinkProps extends Omit<JSX.HTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string;
  children?: preact.ComponentChildren;
}

/**
 * Composant Link qui préserve le port dans les URLs
 * À utiliser à la place de <a href="..."> pour les liens internes
 */
export default function Link({ href, children, ...props }: LinkProps) {
  // Si c'est une URL absolue (http:// ou https://), l'utiliser telle quelle
  if (href.startsWith('http://') || href.startsWith('https://')) {
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }

  // Pour les liens relatifs, utiliser getFullUrl pour préserver le port
  const fullUrl = getFullUrl(href);
  
  return (
    <a href={fullUrl} {...props}>
      {children}
    </a>
  );
}
