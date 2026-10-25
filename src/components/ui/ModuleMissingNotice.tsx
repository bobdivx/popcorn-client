import { useI18n } from '../../lib/i18n/useI18n';
import { canAccess } from '../../lib/permissions';
import { modulesPageHref } from '../../lib/module-errors';

/**
 * Fonction devenue module, absente / inactive sur le serveur connecté (capacité à `false` ou
 * réponse `404 module_not_installed`) : message clair au lieu d'une erreur brute, avec un lien
 * vers Paramètres > Modules pour l'administrateur.
 * Design éditorial : corail #f2545b sur #0c0d10, titre Josefin Sans 300 capitales, corps Jost,
 * icône SVG, ni flou ni halo. Tailles `tv:` pour webOS.
 */
const LABELS: Record<string, { fr: string; en: string }> = {
  sharing: { fr: 'Partage', en: 'Sharing' },
  friends: { fr: 'Partage', en: 'Sharing' },
  requests: { fr: 'Demandes', en: 'Requests' },
  indexers: { fr: 'Indexers', en: 'Indexers' },
  torrent: { fr: 'Téléchargement torrent', en: 'Torrent downloads' },
  sync: { fr: 'Synchronisation des indexers', en: 'Indexer sync' },
};

export default function ModuleMissingNotice({
  capability,
  compact = false,
}: {
  /** Capacité manquante (`sharing`, `requests`…). */
  capability: string;
  /** Variante bandeau (dans une page qui reste utilisable). */
  compact?: boolean;
}) {
  const { language } = useI18n();
  const en = language === 'en';
  const label = LABELS[capability]?.[en ? 'en' : 'fr'] ?? capability;
  let admin = false;
  try {
    admin = canAccess('settings.server' as any);
  } catch {
    admin = false;
  }
  const needsIndexers = capability === 'requests';
  const title = en ? 'Feature unavailable' : 'Fonction indisponible';
  const body = en
    ? `“${label}” is provided by a module that is not installed or not enabled on this server.${needsIndexers ? ' Requests need the Indexers module.' : ''}`
    : `« ${label} » est fournie par un module qui n’est pas installé ou pas activé sur ce serveur.${needsIndexers ? ' Les demandes nécessitent le module Indexers.' : ''}`;
  const hint = admin
    ? null
    : en
      ? 'Ask the server administrator to enable it.'
      : 'Demande à l’administrateur du serveur de l’activer.';

  return (
    <div
      role="status"
      class={`flex gap-4 rounded-xl border ${compact ? 'px-4 py-3' : 'px-5 py-5 tv:px-8 tv:py-7'} mx-auto max-w-2xl`}
      style={{
        borderColor: 'rgba(242, 84, 91, 0.6)',
        backgroundColor: 'rgba(242, 84, 91, 0.06)',
        color: 'var(--ed-ink, #f4f1ec)',
        fontFamily: "var(--ed-font-body, 'Jost', sans-serif)",
      }}
    >
      <span class="shrink-0 mt-0.5" style={{ color: 'var(--ed-accent, #f2545b)' }} aria-hidden>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      </span>
      <div class="grid gap-2 min-w-0">
        {!compact && (
          <p
            class="text-base tv:text-2xl"
            style={{
              fontFamily: "var(--ed-font-display, 'Josefin Sans', 'Jost', sans-serif)",
              fontWeight: 300,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            {title}
          </p>
        )}
        <p class="text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.75)' }}>
          {body}
        </p>
        {hint && (
          <p class="text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
            {hint}
          </p>
        )}
        {admin && (
          <div>
            <a
              href={modulesPageHref(capability)}
              data-focusable
              class="inline-flex items-center gap-2 min-h-[40px] tv:min-h-[52px] px-4 tv:px-6 rounded-full border text-sm tv:text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2545b]/70"
              style={{ borderColor: 'var(--ed-accent, #f2545b)', color: 'var(--ed-ink, #f4f1ec)' }}
            >
              {en ? 'Manage modules' : 'Gérer les modules'}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden>
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
