import type { JSX } from 'preact';
import DOMPurify from 'isomorphic-dompurify';
import { bbcodeToHtml, looksLikeBbcode } from '../../lib/bbcode-to-html';

const PREVIEW_CLASS =
  'w-full max-h-[35vh] overflow-auto rounded-lg border border-base-300 bg-base-300/80 p-4 text-sm text-base-content/90 prose prose-sm max-w-none dark:prose-invert prose-headings:my-2 prose-headings:font-semibold prose-h1:text-2xl prose-h1:sm:text-3xl prose-h1:font-bold prose-h1:tracking-tight prose-h1:mb-3 prose-h1:text-base-content prose-h2:mt-4 prose-h2:mb-2 prose-h2:pb-1 prose-h2:border-b prose-h2:border-base-content/20 prose-p:my-1 prose-pre:my-2 prose-pre:text-xs prose-pre:bg-base-200 prose-pre:rounded prose-img:max-h-48 prose-img:rounded prose-strong:text-base-content [&_.bbcode-center]:flex [&_.bbcode-center]:flex-col [&_.bbcode-center]:items-center [&_.bbcode-center_img]:block [&_.bbcode-center_img]:mx-auto [&_.popcorn-footer-logo]:max-h-6 [&_.popcorn-footer-logo]:w-auto [&_.popcorn-footer-logo]:align-middle [&_.popcorn-separator-banner]:block [&_.popcorn-separator-banner]:w-full [&_.popcorn-separator-banner]:max-h-16 [&_.popcorn-separator-banner]:min-h-[56px] [&_.popcorn-separator-banner]:object-contain [&_.popcorn-separator-banner]:my-2';

/**
 * Enlève les séquences {} résiduelles (placeholders mal rendus par le backend)
 * et sanitise le HTML pour éviter les vulnérabilités XSS (côté client et SSR).
 */
function sanitizePreviewHtml(html: string): string {
  const cleanedHtml = html.replace(/\{\}/g, '');

  return DOMPurify.sanitize(cleanedHtml, {
    ALLOWED_TAGS: [
      'b', 'i', 'u', 's', 'em', 'strong', 'a', 'p', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'blockquote',
      'code', 'pre', 'img', 'span', 'div', 'center'
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'width', 'height', 'style', 'target', 'rel']
  });
}

export interface DescriptionPreviewProps {
  /** HTML déjà rendu par le backend (prioritaire si non vide). */
  html?: string | null;
  /** Description brute (BBCode ou texte) si le backend n'envoie pas d'HTML. */
  raw?: string | null;
  /** Accessible label pour le conteneur. */
  'aria-label'?: string;
  /** Classe CSS additionnelle. */
  className?: string;
}

/**
 * Affiche la prévisualisation de la description envoyée au tracker.
 * Si `html` est fourni et non vide, l'affiche telle quelle.
 * Sinon, si `raw` ressemble à du BBCode, le convertit en HTML puis l'affiche.
 * Sinon affiche `raw` dans un bloc <pre>.
 */
export function DescriptionPreview({
  html,
  raw,
  'aria-label': ariaLabel,
  className = '',
}: DescriptionPreviewProps): JSX.Element {
  const hasHtml = html != null && html.trim() !== '';
  const hasRaw = raw != null && raw.trim() !== '';

  if (hasHtml) {
    return (
      <div
        className={`${PREVIEW_CLASS} ${className}`.trim()}
        role="document"
        aria-label={ariaLabel}
        dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(html) }}
      />
    );
  }

  if (hasRaw && looksLikeBbcode(raw)) {
    const converted = bbcodeToHtml(raw);
    return (
      <div
        className={`${PREVIEW_CLASS} ${className}`.trim()}
        role="document"
        aria-label={ariaLabel}
        dangerouslySetInnerHTML={{ __html: sanitizePreviewHtml(converted) }}
      />
    );
  }

  if (hasRaw) {
    return (
      <pre
        className={`w-full max-h-[35vh] overflow-auto rounded-lg border border-base-300 bg-base-300/80 p-4 text-xs font-mono text-base-content/90 whitespace-pre-wrap break-words ${className}`.trim()}
        role="document"
        aria-label={ariaLabel}
      >
        {raw}
      </pre>
    );
  }

  return (
    <pre
      className={`w-full max-h-[35vh] overflow-auto rounded-lg border border-base-300 bg-base-300/80 p-4 text-xs font-mono text-base-content/50 italic ${className}`.trim()}
      role="document"
      aria-label={ariaLabel}
    >
      —
    </pre>
  );
}
