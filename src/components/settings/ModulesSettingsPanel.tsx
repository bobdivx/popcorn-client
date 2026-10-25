import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { loadCapabilities, useServerCapabilities } from '../../lib/capabilities';
import { TORRENT_FEATURES_ENABLED } from '../../lib/distribution';
import { serverApi } from '../../lib/client/server-api';
import type { InstalledModule } from '../../lib/client/server-api/modules';
import { HubAddTile, HubGrid, HubSkeleton, HubTile } from './hub/HubTile';
import { HubModal } from './hub/HubModal';
import {
  C,
  DataModuleTileIcon,
  FactList,
  Icon,
  type Notice,
  NoticeBanner,
  ProcessModuleTileIcon,
  ServerTileIcon,
  TrustKeysTileIcon,
  WarningBox,
  errorMessage,
  formatDate,
  inputClass,
  inputStyle,
  primaryBtn,
  primaryStyle,
  secondaryBtn,
  secondaryStyle,
  subHeadingStyle,
} from './modules/moduleUi';
import {
  ProcessInstallForm,
  ProcessJobProgress,
  ProcessModuleDetail,
  TrustKeysPanel,
  processStatus,
  processTx,
  useProcessModules,
} from './modules/ProcessModules';
import {
  ServerFeatureDetail,
  buildServerFeatures,
  featureSource,
  featureStatus,
  featureStatusLabel,
  featureTileIcon,
  featureTx,
} from './modules/ServerFeatures';

/**
 * Paramètres > Modules — même lanceur de tuiles que les autres pages du hub (HubTile / HubAddTile /
 * HubModal) : une tuile par module installé, une tuile « + Ajouter un module », une tuile par
 * fonction annoncée par le serveur (capacités, dynamiques), puis « Clés de confiance » et
 * « Serveur connecté ». Le détail s'ouvre en modale.
 *
 * Le lecteur Popcornn fonctionne seul (bibliothèque locale, Jellyfin, transcodage). Les fonctions
 * optionnelles sont des modules : aucun n'est installé ni proposé par défaut, l'administrateur colle
 * l'URL du dépôt de son choix. Modules « process » masqués si le serveur ne les gère pas.
 * Page absente de la version store (STORE_BLOCKED_ROUTE_PREFIXES).
 */
const TEXT = {
  fr: {
    title: 'Modules',
    intro:
      "Popcornn est d'abord un lecteur : il lit ta bibliothèque (dossiers locaux, NAS, Jellyfin) sans rien d'autre. Les fonctions optionnelles sont des modules : aucun n'est installé ni proposé par défaut.",
    installedSection: 'Modules installés',
    securitySection: 'Serveur et sécurité',
    server: 'Serveur connecté',
    edition: 'Édition',
    editionCore: 'Lecteur seul',
    editionFull: 'Lecteur + modules intégrés',
    editionLegacy: 'Version antérieure aux modules',
    version: 'Version',
    unknown: 'Serveur injoignable : état des modules inconnu.',
    unknownShort: 'Injoignable',
    refresh: 'Actualiser',
    addTitle: 'Ajouter un module',
    addDesc: 'Choisis le type de module, puis colle l’URL de son dépôt.',
    typeLabel: 'Type de module',
    typeData: 'Module de données',
    typeDataHint: 'Définitions, listes… (popcorn-module.yaml)',
    typeProcess: 'Module exécutable',
    typeProcessHint: 'Programme signé lancé par le serveur',
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
    none: 'Aucun module installé.',
    source: 'Source',
    privateSource: 'jeton enregistré',
    kind: 'Type',
    identifier: 'Identifiant',
    state: 'État',
    provides: 'Fournit',
    updatedAt: 'Mis à jour le',
    definitionsLabel: "Définitions d'indexers",
    definitions: (n: number) => `${n} définition${n > 1 ? 's' : ''} d'indexers`,
    active: 'Actif',
    inactive: 'Inactif sur ce serveur',
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
    title: 'Modules',
    intro:
      'Popcornn is a player first: it plays your library (local folders, NAS, Jellyfin) with nothing else. Optional features are modules: none is installed or suggested by default.',
    installedSection: 'Installed modules',
    securitySection: 'Server and security',
    server: 'Connected server',
    edition: 'Edition',
    editionCore: 'Player only',
    editionFull: 'Player + built-in modules',
    editionLegacy: 'Version older than modules',
    version: 'Version',
    unknown: 'Server unreachable: module status unknown.',
    unknownShort: 'Unreachable',
    refresh: 'Refresh',
    addTitle: 'Add a module',
    addDesc: 'Pick the module type, then paste the URL of its repository.',
    typeLabel: 'Module type',
    typeData: 'Data module',
    typeDataHint: 'Definitions, lists… (popcorn-module.yaml)',
    typeProcess: 'Executable module',
    typeProcessHint: 'Signed program run by the server',
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
    none: 'No module installed.',
    source: 'Source',
    privateSource: 'token saved',
    kind: 'Type',
    identifier: 'Identifier',
    state: 'State',
    provides: 'Provides',
    updatedAt: 'Updated on',
    definitionsLabel: 'Indexer definitions',
    definitions: (n: number) => `${n} indexer definition${n > 1 ? 's' : ''}`,
    active: 'Active',
    inactive: 'Inactive on this server',
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

type View =
  | { type: 'add' }
  | { type: 'data'; id: string }
  | { type: 'process'; id: string }
  | { type: 'trust' }
  | { type: 'server' }
  | { type: 'feature'; key: string }
  | null;

const MODAL_CLASS = 'modules-hub-overlay';

export default function ModulesSettingsPanel() {
  const { language } = useI18n();
  const tx: Tx = language === 'en' ? (TEXT.en as unknown as Tx) : TEXT.fr;
  const ptx = processTx(language);
  const caps = useServerCapabilities();

  const [modules, setModules] = useState<InstalledModule[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [unsupported, setUnsupported] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [view, setView] = useState<View>(null);
  const [addType, setAddType] = useState<'data' | 'process'>('data');

  // Formulaire « module de données »
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [gitRef, setGitRef] = useState('');

  const pm = useProcessModules(ptx, setNotice);

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refreshList = async () => {
    const res = await serverApi.listModules();
    if (!alive.current) return;
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

  const refreshAll = async () => {
    setBusy('refresh');
    await Promise.all([refreshList(), pm.supported ? pm.refresh() : Promise.resolve()]);
    await loadCapabilities({ force: true });
    if (alive.current) setBusy(null);
  };

  const open = (v: View) => {
    setNotice(null);
    setConfirmId(null);
    setView(v);
  };
  const close = () => {
    setConfirmId(null);
    setView(null);
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
    if (!alive.current) return;
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
    if (!alive.current) return;
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
    if (!alive.current) return;
    setBusy(null);
    setConfirmId(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.successRemove });
      setView(null);
      await afterChange();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const editionLabel = !caps
    ? '—'
    : caps.legacy || caps.edition === 'legacy'
      ? tx.editionLegacy
      : caps.edition === 'core'
        ? tx.editionCore
        : tx.editionFull;

  const kindLabel = (kind: string) => tx.kinds[kind] ?? kind;
  const processModules = pm.ready ? pm.list?.modules ?? [] : [];
  const trustCount = pm.trust?.keys.length ?? 0;
  const loading = modules === null;
  const empty = !loading && modules.length === 0 && processModules.length === 0;
  // Choix du type seulement si le serveur gère les deux ; sinon le seul formulaire disponible.
  const processChoice = pm.ready && !unsupported;
  const effectiveAddType: 'data' | 'process' = processChoice ? addType : pm.ready && unsupported ? 'process' : 'data';
  const canAdd = !unsupported || pm.ready;

  const ftx = featureTx(language);
  const features = caps ? buildServerFeatures(caps, modules, processModules, language) : [];
  const feature = view?.type === 'feature' ? features.find((f) => f.key === view.key) ?? null : null;

  const dataModule = view?.type === 'data' ? modules?.find((m) => m.id === view.id) ?? null : null;
  const processModule = view?.type === 'process' ? processModules.find((m) => m.id === view.id) ?? null : null;

  const sectionTitle = (id: string, label: string) => (
    <h2 id={id} class="modules-hub-section-title text-base tv:text-xl" style={subHeadingStyle}>
      {label}
    </h2>
  );

  return (
    <div class="hub-page modules-hub" style={{ fontFamily: C.body, color: C.ink }}>
      <header class="hub-header flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="hub-title">{tx.title}</h1>
          <p class="hub-subtitle max-w-2xl">{tx.intro}</p>
        </div>
        <button
          type="button"
          data-focusable
          data-tv-page-action
          class={secondaryBtn}
          style={secondaryStyle}
          disabled={!!busy}
          onClick={() => void refreshAll()}
        >
          <Icon name="refresh" />
          {tx.refresh}
        </button>
      </header>

      <div class="grid gap-4 tv:gap-6 mb-6 tv:mb-8 empty:hidden">
        {!view && <NoticeBanner notice={notice} detailsLabel={tx.warnings} />}
        {pm.ready && pm.list?.allow_unsigned && (
          <WarningBox>
            <p>{ptx.devUnsigned}</p>
          </WarningBox>
        )}
        {!view && pm.jobRunning && <ProcessJobProgress job={pm.job} tx={ptx} />}
        {unsupported && (
          <p role="alert" class="text-sm tv:text-lg" style={{ color: C.accent }}>
            {tx.errOldServer}
          </p>
        )}
        {listError && (
          <p role="alert" class="text-sm tv:text-lg" style={{ color: C.accent }}>
            {listError}
          </p>
        )}
        {pm.ready && pm.listError && (
          <p role="alert" class="text-sm tv:text-lg" style={{ color: C.accent }}>
            {pm.listError}
          </p>
        )}
      </div>

      <section aria-labelledby="modules-installed-title" class="grid gap-4 tv:gap-6">
        {sectionTitle('modules-installed-title', tx.installedSection)}
        {loading ? (
          <HubSkeleton count={3} />
        ) : (
          <HubGrid>
            {modules.map((m) => (
              <HubTile
                key={`data:${m.id}`}
                title={m.name}
                icon={DataModuleTileIcon}
                status={m.active ? 'connected' : 'disabled'}
                statusLabel={m.active ? tx.active : tx.inactive}
                meta={`${kindLabel(m.kind)} · ${m.version}`}
                onClick={() => open({ type: 'data', id: m.id })}
              />
            ))}
            {processModules.map((m) => (
              <HubTile
                key={`process:${m.id}`}
                title={m.id}
                icon={ProcessModuleTileIcon}
                status={processStatus(m.state)}
                statusLabel={ptx.states[m.state] ?? m.state}
                meta={`${ptx.kind} · ${m.version || '—'}`}
                onClick={() => open({ type: 'process', id: m.id })}
              />
            ))}
            {canAdd && <HubAddTile label={tx.addTitle} onClick={() => open({ type: 'add' })} />}
          </HubGrid>
        )}
        {empty && !unsupported && !listError && <p class="hub-empty">{tx.none}</p>}
      </section>

      <section aria-labelledby="modules-features-title" class="mt-8 tv:mt-12 grid gap-4 tv:gap-6">
        {sectionTitle('modules-features-title', ftx.section)}
        {!caps ? (
          <p class="hub-empty">{tx.unknown}</p>
        ) : features.length === 0 ? (
          <p class="hub-empty">{ftx.none}</p>
        ) : (
          <HubGrid>
            {features.map((f) => (
              <HubTile
                key={`feature:${f.key}`}
                title={f.name}
                icon={featureTileIcon(f.icon)}
                status={featureStatus(f.state)}
                statusLabel={featureStatusLabel(f.state, ftx)}
                meta={featureSource(f, ftx, caps.serverVersion)}
                onClick={() => open({ type: 'feature', key: f.key })}
              />
            ))}
          </HubGrid>
        )}
      </section>

      <section aria-labelledby="modules-security-title" class="mt-8 tv:mt-12 grid gap-4 tv:gap-6">
        {sectionTitle('modules-security-title', tx.securitySection)}
        <HubGrid>
          {pm.ready && (
            <HubTile
              title={ptx.trustTitle}
              icon={TrustKeysTileIcon}
              hint={ptx.trustHint(trustCount)}
              onClick={() => open({ type: 'trust' })}
            />
          )}
          <HubTile
            title={tx.server}
            icon={ServerTileIcon}
            hint={caps ? editionLabel : tx.unknownShort}
            meta={caps?.serverVersion || undefined}
            onClick={() => open({ type: 'server' })}
          />
        </HubGrid>
      </section>

      {/* Ajouter un module */}
      {view?.type === 'add' && (
        <HubModal open title={tx.addTitle} description={tx.addDesc} onClose={close} size="xl" className={MODAL_CLASS}>
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} detailsLabel={tx.warnings} />
            {processChoice && (
              <div role="radiogroup" aria-label={tx.typeLabel} class="grid gap-3 sm:grid-cols-2" data-tv-list>
                {(['data', 'process'] as const).map((type) => {
                  const selected = effectiveAddType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      data-focusable
                      data-tv-list-item
                      class={`modules-type-choice flex items-center gap-3 rounded-xl border px-4 py-3 tv:px-6 tv:py-5 text-left ${selected ? 'is-selected' : ''}`}
                      onClick={() => {
                        setNotice(null);
                        setAddType(type);
                      }}
                    >
                      <span class="shrink-0" style={{ color: C.accent }}>
                        <Icon name={type === 'data' ? 'module' : 'chip'} size={22} />
                      </span>
                      <span class="min-w-0">
                        <span class="block text-sm tv:text-lg" style={subHeadingStyle}>
                          {type === 'data' ? tx.typeData : tx.typeProcess}
                        </span>
                        <span class="block text-xs tv:text-base" style={{ color: C.muted }}>
                          {type === 'data' ? tx.typeDataHint : tx.typeProcessHint}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {effectiveAddType === 'data' ? (
              <div class="grid gap-5 tv:gap-7">
                <p class="text-sm tv:text-lg max-w-2xl" style={{ color: C.muted }}>
                  {tx.addHelp}
                </p>
                <form class="grid gap-4 tv:gap-6" onSubmit={onInstall} autoComplete="off">
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
                    <button
                      type="submit"
                      data-focusable
                      class={primaryBtn}
                      style={primaryStyle}
                      disabled={!!busy || unsupported}
                    >
                      <Icon name="plus" />
                      {busy === 'install' ? tx.installing : tx.install}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <ProcessInstallForm pm={pm} tx={ptx} setNotice={setNotice} />
            )}
          </div>
        </HubModal>
      )}

      {/* Détail d'un module de données */}
      {dataModule && (
        <HubModal
          open
          title={dataModule.name}
          description={dataModule.description || undefined}
          onClose={close}
          size="xl"
          className={MODAL_CLASS}
        >
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} detailsLabel={tx.warnings} />
            <FactList
              rows={[
                [tx.state, dataModule.active ? tx.active : <span style={{ color: C.accent }}>{tx.inactive}</span>],
                [tx.version, dataModule.version],
                [tx.kind, kindLabel(dataModule.kind)],
                [tx.identifier, dataModule.id, 'break-all'],
                typeof dataModule.definitions_count === 'number' && [
                  tx.definitionsLabel,
                  tx.definitions(dataModule.definitions_count),
                ],
                dataModule.provides?.length > 0 && [tx.provides, dataModule.provides.join(', ')],
                [
                  tx.source,
                  <span class="inline-flex flex-wrap items-center gap-x-2">
                    <span class="break-all">
                      {dataModule.source_url}
                      {dataModule.source_ref ? ` @ ${dataModule.source_ref}` : ''}
                    </span>
                    {dataModule.has_token && (
                      <span class="inline-flex items-center gap-1 shrink-0" style={{ color: C.faint }} title={tx.privateSource}>
                        <Icon name="lock" size={14} />
                        {tx.privateSource}
                      </span>
                    )}
                  </span>,
                  'text-xs tv:text-base',
                ],
                [tx.updatedAt, formatDate(dataModule.updated_at, language)],
              ]}
            />
            <div class="flex flex-wrap gap-2">
              {confirmId === dataModule.id ? (
                <>
                  <button
                    type="button"
                    data-focusable
                    class={primaryBtn}
                    style={primaryStyle}
                    disabled={!!busy}
                    onClick={() => void onRemove(dataModule)}
                  >
                    <Icon name="trash" />
                    {busy === `remove:${dataModule.id}` ? tx.removing : tx.confirmRemove}
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
                    onClick={() => void onUpdate(dataModule)}
                  >
                    <Icon name="refresh" />
                    {busy === `update:${dataModule.id}` ? tx.updating : tx.update}
                  </button>
                  <button
                    type="button"
                    data-focusable
                    class={secondaryBtn}
                    style={secondaryStyle}
                    disabled={!!busy}
                    onClick={() => setConfirmId(dataModule.id)}
                  >
                    <Icon name="trash" />
                    {tx.remove}
                  </button>
                </>
              )}
            </div>
          </div>
        </HubModal>
      )}

      {/* Détail d'un module exécutable */}
      {processModule && (
        <HubModal open title={processModule.id} onClose={close} size="xl" className={MODAL_CLASS}>
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} />
            <ProcessModuleDetail
              key={processModule.id}
              m={processModule}
              pm={pm}
              tx={ptx}
              language={language}
              setNotice={setNotice}
              onRemoved={() => setView(null)}
            />
          </div>
        </HubModal>
      )}

      {/* Clés de confiance */}
      {view?.type === 'trust' && pm.ready && (
        <HubModal open title={ptx.trustTitle} description={ptx.trustDesc} onClose={close} size="xl" className={MODAL_CLASS}>
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} />
            <TrustKeysPanel pm={pm} tx={ptx} language={language} setNotice={setNotice} />
          </div>
        </HubModal>
      )}

      {/* Fonction du serveur */}
      {feature && (
        <HubModal
          open
          title={feature.name}
          description={featureSource(feature, ftx, caps?.serverVersion ?? null)}
          onClose={close}
          size="lg"
          className={MODAL_CLASS}
        >
          <ServerFeatureDetail
            feature={feature}
            tx={ftx}
            stateLabel={featureStatusLabel(feature.state, ftx)}
            serverVersion={caps?.serverVersion ?? null}
            torrentEnabled={TORRENT_FEATURES_ENABLED}
            onOpenModule={(p) => open(p.type === 'process' ? { type: 'process', id: p.id } : { type: 'data', id: p.id })}
            onAddModule={canAdd ? () => open({ type: 'add' }) : undefined}
          />
        </HubModal>
      )}

      {/* Serveur connecté */}
      {view?.type === 'server' && (
        <HubModal open title={tx.server} onClose={close} size="lg" className={MODAL_CLASS}>
          {caps ? (
            <FactList
              rows={[
                [tx.edition, editionLabel],
                !!caps.serverVersion && [tx.version, caps.serverVersion],
                pm.ready && !!pm.list?.platform && [ptx.platform, pm.list.platform],
              ]}
            />
          ) : (
            <p class="text-sm tv:text-lg" style={{ color: C.muted }}>
              {tx.unknown}
            </p>
          )}
        </HubModal>
      )}
    </div>
  );
}
