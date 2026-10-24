import { useEffect, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { loadCapabilities, useServerCapabilities } from '../../lib/capabilities';
import { TORRENT_FEATURES_ENABLED } from '../../lib/distribution';
import { serverApi } from '../../lib/client/server-api';
import type { InstalledModule } from '../../lib/client/server-api/modules';
import ProcessModulesSection from './ProcessModulesSection';

/**
 * Paramètres > Modules.
 * Le lecteur Popcornn fonctionne seul (bibliothèque locale, Jellyfin, transcodage).
 * Les fonctions optionnelles sont des modules : aucun n'est installé ni proposé par défaut,
 * l'administrateur colle l'URL du dépôt de son choix (plusieurs dépôts possibles).
 * Page absente de la version store (STORE_BLOCKED_ROUTE_PREFIXES).
 */
const TEXT = {
  fr: {
    intro:
      "Popcornn est d'abord un lecteur : il lit ta bibliothèque (dossiers locaux, NAS, Jellyfin) sans rien d'autre. Les fonctions optionnelles sont des modules : aucun n'est installé ni proposé par défaut.",
    server: 'Serveur connecté',
    edition: 'Édition',
    editionCore: 'Lecteur seul',
    editionFull: 'Lecteur + modules intégrés',
    editionLegacy: 'Version antérieure aux modules',
    version: 'Version',
    unknown: 'Serveur injoignable : état des modules inconnu.',
    builtinTitle: 'Fonctions intégrées au serveur',
    builtinNone: 'Aucune fonction optionnelle compilée dans ce serveur.',
    torrent: 'Téléchargement torrent',
    indexers: 'Indexers',
    sync: 'Synchronisation des indexers',
    hiddenInBuild: 'non disponible dans cette version de l’application',
    refresh: 'Actualiser',
    addTitle: 'Ajouter un module',
    addHelp:
      "Colle l'URL d'un dépôt GitHub (https://github.com/propriétaire/dépôt) ou d'une archive .zip en HTTPS contenant un fichier popcorn-module.yaml. Pour un dépôt privé, ajoute un jeton d'accès en lecture seule : il reste sur le serveur et n'est jamais réaffiché.",
    url: 'URL du module',
    urlPlaceholder: 'https://github.com/…',
    token: "Jeton d'accès (facultatif)",
    tokenPlaceholder: 'Dépôt privé uniquement',
    ref: 'Branche ou tag (facultatif)',
    refPlaceholder: 'main',
    install: 'Installer',
    installing: 'Installation…',
    installed: 'Modules installés',
    none: 'Aucun module installé.',
    loading: 'Chargement…',
    source: 'Source',
    privateSource: 'jeton enregistré',
    definitions: (n: number) => `${n} définition${n > 1 ? 's' : ''} d'indexers`,
    inactive: 'inactif sur ce serveur',
    update: 'Mettre à jour',
    updating: 'Mise à jour…',
    remove: 'Désinstaller',
    confirmRemove: 'Confirmer',
    cancel: 'Annuler',
    removing: 'Suppression…',
    successInstall: (name: string, v: string) => `Module « ${name} » ${v} installé.`,
    successReplace: (name: string, v: string) => `Module « ${name} » mis à jour (${v}).`,
    successRemove: 'Module désinstallé.',
    warnings: 'Fichiers ignorés :',
    errUrl: 'Indique une URL commençant par https://',
    errOldServer:
      "Ce serveur ne gère pas encore l'installation de modules : mets-le à jour pour utiliser cette page.",
    errForbidden: "Accès refusé : seul l'administrateur du serveur peut gérer les modules.",
    errGeneric: 'Opération impossible. Réessaie dans quelques instants.',
    kinds: { data: 'Données', native: 'Intégré', http: 'Service' } as Record<string, string>,
  },
  en: {
    intro:
      'Popcornn is a player first: it plays your library (local folders, NAS, Jellyfin) with nothing else. Optional features are modules: none is installed or suggested by default.',
    server: 'Connected server',
    edition: 'Edition',
    editionCore: 'Player only',
    editionFull: 'Player + built-in modules',
    editionLegacy: 'Version older than modules',
    version: 'Version',
    unknown: 'Server unreachable: module status unknown.',
    builtinTitle: 'Built into the server',
    builtinNone: 'No optional feature compiled into this server.',
    torrent: 'Torrent downloads',
    indexers: 'Indexers',
    sync: 'Indexer sync',
    hiddenInBuild: 'not available in this version of the app',
    refresh: 'Refresh',
    addTitle: 'Add a module',
    addHelp:
      'Paste the URL of a GitHub repository (https://github.com/owner/repo) or of an HTTPS .zip archive containing a popcorn-module.yaml file. For a private repository, add a read-only access token: it stays on the server and is never shown again.',
    url: 'Module URL',
    urlPlaceholder: 'https://github.com/…',
    token: 'Access token (optional)',
    tokenPlaceholder: 'Private repository only',
    ref: 'Branch or tag (optional)',
    refPlaceholder: 'main',
    install: 'Install',
    installing: 'Installing…',
    installed: 'Installed modules',
    none: 'No module installed.',
    loading: 'Loading…',
    source: 'Source',
    privateSource: 'token saved',
    definitions: (n: number) => `${n} indexer definition${n > 1 ? 's' : ''}`,
    inactive: 'inactive on this server',
    update: 'Update',
    updating: 'Updating…',
    remove: 'Uninstall',
    confirmRemove: 'Confirm',
    cancel: 'Cancel',
    removing: 'Removing…',
    successInstall: (name: string, v: string) => `Module “${name}” ${v} installed.`,
    successReplace: (name: string, v: string) => `Module “${name}” updated (${v}).`,
    successRemove: 'Module uninstalled.',
    warnings: 'Skipped files:',
    errUrl: 'Enter a URL starting with https://',
    errOldServer: 'This server cannot install modules yet: update it to use this page.',
    errForbidden: 'Access denied: only the server administrator can manage modules.',
    errGeneric: 'Operation failed. Please try again shortly.',
    kinds: { data: 'Data', native: 'Built-in', http: 'Service' } as Record<string, string>,
  },
};

type Tx = (typeof TEXT)['fr'];

const C = {
  accent: 'var(--ed-accent, #f2545b)',
  bg: 'var(--ed-bg, #0c0d10)',
  ink: 'var(--ed-ink, #f4f1ec)',
  display: "var(--ed-font-display, 'Josefin Sans', 'Jost', sans-serif)",
  body: "var(--ed-font-body, 'Jost', sans-serif)",
};

const headingStyle: JSX.CSSProperties = {
  fontFamily: C.display,
  fontWeight: 300,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.ink,
};

const cardClass = 'rounded-2xl border border-white/10 p-5 tv:p-7';
const cardStyle: JSX.CSSProperties = { backgroundColor: 'rgba(244, 241, 236, 0.03)' };
const focusRing = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2545b]/70 focus:ring-4 focus:ring-[#f2545b]/50';
const inputClass = `w-full min-h-[44px] tv:min-h-[56px] rounded-xl border border-white/15 px-4 tv:px-6 text-sm tv:text-lg ${focusRing}`;
const inputStyle: JSX.CSSProperties = { backgroundColor: C.bg, color: C.ink, fontFamily: C.body };
const primaryBtn = `inline-flex items-center justify-center gap-2 min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full text-sm tv:text-lg font-medium disabled:opacity-50 ${focusRing}`;
const primaryStyle: JSX.CSSProperties = { backgroundColor: C.accent, color: C.ink, fontFamily: C.body };
const secondaryBtn = `inline-flex items-center justify-center gap-2 min-h-[40px] tv:min-h-[52px] px-4 tv:px-6 rounded-full border border-white/20 text-sm tv:text-base disabled:opacity-50 ${focusRing}`;
const secondaryStyle: JSX.CSSProperties = { color: C.ink, fontFamily: C.body, backgroundColor: 'transparent' };

function Icon({ name }: { name: 'plus' | 'refresh' | 'trash' | 'lock' | 'module' }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.6,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'plus':
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
        </svg>
      );
    case 'lock':
      return (
        <svg {...common} width={14} height={14}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
        </svg>
      );
  }
}

function errorMessage(res: { error?: string; message?: string }, tx: Tx): string {
  if (res.error === 'Forbidden' || res.error === 'Unauthorized') return tx.errForbidden;
  const msg = (res.message || '').trim();
  if (!msg || /^Erreur \d+$/.test(msg)) return tx.errGeneric;
  return msg;
}

function formatDate(iso: string, language: string): string {
  try {
    return new Date(iso).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ModulesSettingsPanel() {
  const { language } = useI18n();
  const tx: Tx = language === 'en' ? (TEXT.en as unknown as Tx) : TEXT.fr;
  const caps = useServerCapabilities();

  const [modules, setModules] = useState<InstalledModule[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string; details?: string[] } | null>(null);

  const refreshList = async () => {
    const res = await serverApi.listModules();
    if (res.success && res.data) {
      setModules(Array.isArray(res.data.modules) ? res.data.modules : []);
      setListError(null);
      setUnsupported(false);
    } else if (res.error === 'NotFound') {
      setModules([]);
      setUnsupported(true);
    } else {
      setModules([]);
      setListError(errorMessage(res, tx));
    }
  };

  useEffect(() => {
    void refreshList();
  }, []);

  const afterChange = async () => {
    await refreshList();
    await loadCapabilities({ force: true });
  };

  const onInstall = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const u = url.trim();
    if (!/^https:\/\/\S+$/i.test(u)) {
      setNotice({ kind: 'error', text: tx.errUrl });
      return;
    }
    setBusy('install');
    setNotice(null);
    const res = await serverApi.installModule({ url: u, token, ref: gitRef });
    setBusy(null);
    if (res.success && res.data) {
      const m = res.data.module;
      setNotice({
        kind: 'ok',
        text: res.data.replaced ? tx.successReplace(m.name, m.version) : tx.successInstall(m.name, m.version),
        details: res.data.warnings?.length ? res.data.warnings : undefined,
      });
      setUrl('');
      setToken('');
      setGitRef('');
      await afterChange();
    } else {
      setNotice({ kind: 'error', text: res.error === 'NotFound' ? tx.errOldServer : errorMessage(res, tx) });
    }
  };

  const onUpdate = async (m: InstalledModule) => {
    if (busy) return;
    setBusy(`update:${m.id}`);
    setNotice(null);
    const res = await serverApi.updateModule(m.id);
    setBusy(null);
    if (res.success && res.data) {
      const nm = res.data.module;
      setNotice({
        kind: 'ok',
        text: tx.successReplace(nm.name, nm.version),
        details: res.data.warnings?.length ? res.data.warnings : undefined,
      });
      await afterChange();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onRemove = async (m: InstalledModule) => {
    if (busy) return;
    setBusy(`remove:${m.id}`);
    setNotice(null);
    const res = await serverApi.uninstallModule(m.id);
    setBusy(null);
    setConfirmId(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.successRemove });
      await afterChange();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const builtin: Array<'torrent' | 'indexers' | 'sync'> = [];
  if (caps) {
    if (caps.features.torrent) builtin.push('torrent');
    if (caps.features.indexers) builtin.push('indexers');
    if (caps.features.sync) builtin.push('sync');
  }
  const editionLabel = !caps
    ? '—'
    : caps.legacy || caps.edition === 'legacy'
      ? tx.editionLegacy
      : caps.edition === 'core'
        ? tx.editionCore
        : tx.editionFull;

  return (
    <div class="space-y-6 tv:space-y-8" style={{ fontFamily: C.body, color: C.ink }}>
      <p class="text-sm tv:text-lg max-w-2xl" style={{ color: 'rgba(244, 241, 236, 0.7)' }}>
        {tx.intro}
      </p>

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          class="rounded-xl border px-4 py-3 text-sm tv:text-lg"
          style={{
            borderColor: notice.kind === 'error' ? C.accent : 'rgba(244, 241, 236, 0.2)',
            color: C.ink,
            backgroundColor: notice.kind === 'error' ? 'rgba(242, 84, 91, 0.1)' : 'rgba(244, 241, 236, 0.04)',
          }}
        >
          <p>{notice.text}</p>
          {notice.details && (
            <>
              <p class="mt-2 text-xs tv:text-base" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
                {tx.warnings}
              </p>
              <ul class="mt-1 list-disc pl-5 text-xs tv:text-base" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
                {notice.details.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <section class={cardClass} style={cardStyle} aria-labelledby="modules-add-title">
        <h2 id="modules-add-title" class="text-lg tv:text-2xl" style={headingStyle}>
          {tx.addTitle}
        </h2>
        <p class="mt-2 text-sm tv:text-lg max-w-2xl" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
          {tx.addHelp}
        </p>
        <form class="mt-5 grid gap-4 tv:gap-6" onSubmit={onInstall} autoComplete="off">
          <label class="grid gap-1.5">
            <span class="text-sm tv:text-lg">{tx.url}</span>
            <input
              type="url"
              inputMode="url"
              data-focusable
              required
              class={inputClass}
              style={inputStyle}
              placeholder={tx.urlPlaceholder}
              value={url}
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5">
              <span class="text-sm tv:text-lg">{tx.token}</span>
              <input
                type="password"
                data-focusable
                class={inputClass}
                style={inputStyle}
                placeholder={tx.tokenPlaceholder}
                value={token}
                autoComplete="new-password"
                autoCapitalize="none"
                spellcheck={false}
                onInput={(e) => setToken((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
            <label class="grid gap-1.5">
              <span class="text-sm tv:text-lg">{tx.ref}</span>
              <input
                type="text"
                data-focusable
                class={inputClass}
                style={inputStyle}
                placeholder={tx.refPlaceholder}
                value={gitRef}
                autoComplete="off"
                autoCapitalize="none"
                spellcheck={false}
                onInput={(e) => setGitRef((e.currentTarget as HTMLInputElement).value)}
              />
            </label>
          </div>
          <div>
            <button type="submit" data-focusable class={primaryBtn} style={primaryStyle} disabled={!!busy || unsupported}>
              <Icon name="plus" />
              {busy === 'install' ? tx.installing : tx.install}
            </button>
          </div>
        </form>
      </section>

      <section class={cardClass} style={cardStyle} aria-labelledby="modules-installed-title">
        <div class="flex items-center justify-between gap-4">
          <h2 id="modules-installed-title" class="text-lg tv:text-2xl" style={headingStyle}>
            {tx.installed}
          </h2>
          <button
            type="button"
            data-focusable
            class={secondaryBtn}
            style={secondaryStyle}
            disabled={!!busy}
            onClick={() => void afterChange()}
          >
            <Icon name="refresh" />
            {tx.refresh}
          </button>
        </div>
        {unsupported && <p class="mt-4 text-sm tv:text-lg" style={{ color: C.accent }}>{tx.errOldServer}</p>}
        {listError && (
          <p role="alert" class="mt-4 text-sm tv:text-lg" style={{ color: C.accent }}>
            {listError}
          </p>
        )}
        {modules === null ? (
          <p class="mt-4 text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
            {tx.loading}
          </p>
        ) : modules.length === 0 ? (
          !unsupported &&
          !listError && (
            <p class="mt-4 text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
              {tx.none}
            </p>
          )
        ) : (
          <ul class="mt-4 divide-y divide-white/10">
            {modules.map((m) => {
              const confirming = confirmId === m.id;
              return (
                <li key={m.id} class="py-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="flex gap-3 min-w-0">
                    <span class="mt-0.5 shrink-0" style={{ color: C.accent }}>
                      <Icon name="module" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-base tv:text-xl">
                        <span>{m.name}</span>
                        <span class="ml-2 text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.55)' }}>
                          {m.version}
                        </span>
                      </p>
                      <p class="mt-0.5 text-xs tv:text-base" style={{ color: 'rgba(244, 241, 236, 0.55)' }}>
                        {(tx.kinds[m.kind] ?? m.kind) + ' · ' + m.id}
                        {typeof m.definitions_count === 'number' ? ` · ${tx.definitions(m.definitions_count)}` : ''}
                        {!m.active ? ` · ${tx.inactive}` : ''}
                      </p>
                      {m.description && (
                        <p class="mt-1 text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.7)' }}>
                          {m.description}
                        </p>
                      )}
                      <p
                        class="mt-1 text-xs tv:text-base break-all flex items-center gap-1.5"
                        style={{ color: 'rgba(244, 241, 236, 0.45)' }}
                      >
                        <span>
                          {tx.source} : {m.source_url}
                          {m.source_ref ? ` @ ${m.source_ref}` : ''}
                          {' · '}
                          {formatDate(m.updated_at, language)}
                        </span>
                        {m.has_token && (
                          <span class="inline-flex items-center gap-1 shrink-0" title={tx.privateSource}>
                            <Icon name="lock" />
                            {tx.privateSource}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 shrink-0">
                    {confirming ? (
                      <>
                        <button
                          type="button"
                          data-focusable
                          class={primaryBtn}
                          style={primaryStyle}
                          disabled={!!busy}
                          onClick={() => void onRemove(m)}
                        >
                          <Icon name="trash" />
                          {busy === `remove:${m.id}` ? tx.removing : tx.confirmRemove}
                        </button>
                        <button
                          type="button"
                          data-focusable
                          class={secondaryBtn}
                          style={secondaryStyle}
                          disabled={!!busy}
                          onClick={() => setConfirmId(null)}
                        >
                          {tx.cancel}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          data-focusable
                          class={secondaryBtn}
                          style={secondaryStyle}
                          disabled={!!busy}
                          onClick={() => void onUpdate(m)}
                        >
                          <Icon name="refresh" />
                          {busy === `update:${m.id}` ? tx.updating : tx.update}
                        </button>
                        <button
                          type="button"
                          data-focusable
                          class={secondaryBtn}
                          style={secondaryStyle}
                          disabled={!!busy}
                          onClick={() => setConfirmId(m.id)}
                        >
                          <Icon name="trash" />
                          {tx.remove}
                        </button>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Modules exécutables signés : masqué si le serveur ne les gère pas (et en version store). */}
      <ProcessModulesSection />

      <section class={cardClass} style={cardStyle} aria-labelledby="modules-server-title">
        <h2 id="modules-server-title" class="text-lg tv:text-2xl" style={headingStyle}>
          {tx.server}
        </h2>
        {caps ? (
          <dl class="mt-4 grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm tv:text-lg">
            <dt style={{ color: 'rgba(244, 241, 236, 0.5)' }}>{tx.edition}</dt>
            <dd>{editionLabel}</dd>
            {caps.serverVersion && (
              <>
                <dt style={{ color: 'rgba(244, 241, 236, 0.5)' }}>{tx.version}</dt>
                <dd>{caps.serverVersion}</dd>
              </>
            )}
            <dt style={{ color: 'rgba(244, 241, 236, 0.5)' }}>{tx.builtinTitle}</dt>
            <dd>
              {builtin.length === 0
                ? tx.builtinNone
                : builtin.map((id) => tx[id]).join(', ') + (TORRENT_FEATURES_ENABLED ? '' : ` (${tx.hiddenInBuild})`)}
            </dd>
          </dl>
        ) : (
          <p class="mt-4 text-sm tv:text-lg" style={{ color: 'rgba(244, 241, 236, 0.6)' }}>
            {tx.unknown}
          </p>
        )}
      </section>
    </div>
  );
}
