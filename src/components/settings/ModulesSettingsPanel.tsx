import { useI18n } from '../../lib/i18n/useI18n';
import { loadCapabilities, useServerCapabilities } from '../../lib/capabilities';
import { TORRENT_FEATURES_ENABLED } from '../../lib/distribution';

/**
 * Paramètres > Modules.
 * Le lecteur Popcornn fonctionne seul (bibliothèque locale, Jellyfin, transcodage).
 * Les fonctions optionnelles sont des modules : aucun n'est installé par défaut.
 * Cette page affiche ce que le serveur connecté annonce (GET /api/client/capabilities).
 */
const TEXT = {
  fr: {
    intro:
      "Popcornn est d'abord un lecteur : il lit ta bibliothèque (dossiers locaux, NAS, Jellyfin) sans rien d'autre. Les fonctions optionnelles sont des modules, aucun n'est installé par défaut.",
    server: 'Serveur connecté',
    edition: 'Édition',
    editionCore: 'Lecteur seul',
    editionFull: 'Lecteur + modules intégrés',
    editionLegacy: 'Version antérieure aux modules',
    version: 'Version',
    unknown: 'Serveur injoignable : état des modules inconnu.',
    installed: 'Modules actifs',
    none: 'Aucun module installé.',
    torrent: 'Téléchargement torrent',
    indexers: 'Indexers',
    sync: 'Synchronisation des indexers',
    builtin: 'intégré au serveur',
    hiddenInBuild: 'non disponible dans cette version de l’application',
    host: "L'installation de modules depuis l'URL d'un dépôt n'est pas encore disponible dans l'application.",
    refresh: 'Actualiser',
  },
  en: {
    intro:
      'Popcornn is a player first: it plays your library (local folders, NAS, Jellyfin) with nothing else. Optional features are modules, and none is installed by default.',
    server: 'Connected server',
    edition: 'Edition',
    editionCore: 'Player only',
    editionFull: 'Player + built-in modules',
    editionLegacy: 'Version older than modules',
    version: 'Version',
    unknown: 'Server unreachable: module status unknown.',
    installed: 'Active modules',
    none: 'No module installed.',
    torrent: 'Torrent downloads',
    indexers: 'Indexers',
    sync: 'Indexer sync',
    builtin: 'built into the server',
    hiddenInBuild: 'not available in this version of the app',
    host: 'Installing modules from a repository URL is not available in the app yet.',
    refresh: 'Refresh',
  },
};

export default function ModulesSettingsPanel() {
  const { language } = useI18n();
  const tx = language === 'en' ? TEXT.en : TEXT.fr;
  const caps = useServerCapabilities();

  const active: string[] = [];
  if (caps) {
    if (caps.features.torrent) active.push('torrent');
    if (caps.features.indexers) active.push('indexers');
    if (caps.features.sync) active.push('sync');
  }
  const editionLabel = !caps
    ? '—'
    : caps.legacy || caps.edition === 'legacy'
      ? tx.editionLegacy
      : caps.edition === 'core'
        ? tx.editionCore
        : tx.editionFull;

  return (
    <div class="space-y-6">
      <p class="text-sm text-white/70 max-w-2xl">{tx.intro}</p>

      <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <div class="flex items-center justify-between gap-4">
          <h2 class="text-base font-semibold text-white">{tx.server}</h2>
          <button
            type="button"
            class="rounded-full px-4 py-1.5 text-sm font-medium text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f2545b]"
            style={{ backgroundColor: '#f2545b' }}
            onClick={() => void loadCapabilities({ force: true })}
          >
            {tx.refresh}
          </button>
        </div>
        {caps ? (
          <dl class="mt-4 grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm">
            <dt class="text-white/50">{tx.edition}</dt>
            <dd class="text-white">{editionLabel}</dd>
            {caps.serverVersion && (
              <>
                <dt class="text-white/50">{tx.version}</dt>
                <dd class="text-white">{caps.serverVersion}</dd>
              </>
            )}
          </dl>
        ) : (
          <p class="mt-4 text-sm text-white/60">{tx.unknown}</p>
        )}
      </section>

      <section class="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        <h2 class="text-base font-semibold text-white">{tx.installed}</h2>
        {caps && active.length > 0 ? (
          <ul class="mt-4 space-y-2 text-sm">
            {active.map((id) => (
              <li key={id} class="flex items-center gap-3">
                <span class="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#f2545b' }} />
                <span class="text-white">{tx[id as 'torrent' | 'indexers' | 'sync']}</span>
                <span class="text-white/50">
                  — {TORRENT_FEATURES_ENABLED ? tx.builtin : tx.hiddenInBuild}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="mt-4 text-sm text-white/60">{caps ? tx.none : '—'}</p>
        )}
        <p class="mt-4 text-xs text-white/40">{tx.host}</p>
      </section>
    </div>
  );
}
