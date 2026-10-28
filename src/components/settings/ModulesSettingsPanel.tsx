import { useEffect, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../lib/i18n/useI18n';
import { refreshCapabilitiesNow, supportsModuleToggle, useServerCapabilities } from '../../lib/capabilities';
import { isRouteUnsupported } from '../../lib/module-errors';
import { STORE_MODULES_ENABLED, TORRENT_FEATURES_ENABLED } from '../../lib/distribution';
import { serverApi } from '../../lib/client/server-api';
import type { InstalledModule } from '../../lib/client/server-api/modules';
import { HubAddTile, HubGrid, HubSkeleton, HubTile } from './hub/HubTile';
import { HubModal } from './hub/HubModal';
import {
  C,
  checkboxClass,
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
import { installFromCatalog, storeTx, useModuleCatalog } from './modules/ModuleStore';
import { FieldHint, ModuleCatalogView, catalogTx } from './modules/ModuleCatalog';
import { checkAccessToken, checkModuleUrl } from './modules/moduleCatalogModel';
import type { CatalogModule } from '../../lib/client/server-api/modules';
import {
  ServerFeatureDetail,
  buildServerFeatures,
  visibleServerFeatures,
  featureSource,
  featureStatus,
  featureStatusLabel,
  featureTileIcon,
  featureTx,
  moduleSettingsLinks,
  processModuleName,
} from './modules/ServerFeatures';

/**
 * Paramètres > Modules — même lanceur de tuiles que les autres pages du hub (HubTile / HubAddTile /
 * HubModal) : une tuile par module installé, une tuile « + Ajouter un module », une tuile par
 * fonction annoncée par le serveur (capacités, dynamiques), puis « Clés de confiance » et
 * « Serveur connecté ». Le détail s'ouvre en modale.
 *
 * Le lecteur Popcornn fonctionne seul (bibliothèque locale, Jellyfin, transcodage). Les fonctions
 * optionnelles sont des modules : aucun n'est installé par défaut. La tuile « + » ouvre d'abord le
 * catalogue officiel (modules signés par la clé officielle Popcornn, voir ModuleStore, installation
 * en un clic) ; « Ajouter depuis GitHub (URL) » ouvre l'ajout par URL pour les modules particuliers
 * (indexers inclus, jamais au catalogue). Modules « process » et catalogue
 * masqués si le serveur ne les gère pas.
 * Page absente de la version store (STORE_BLOCKED_ROUTE_PREFIXES).
 */
const TEXT = {
  fr: {
    title: 'Modules',
    intro:
      "Popcornn est d'abord un lecteur : il lit ta bibliothèque (dossiers locaux, NAS) sans rien d'autre. Les fonctions optionnelles sont des modules : aucun n'est installé par défaut, ajoute ceux dont tu as besoin avec « Ajouter un module ».",
    installedSection: 'Modules installés',
    securitySection: 'Serveur et sécurité',
    server: 'Serveur connecté',
    edition: 'Édition',
    editionCore: 'Lecteur seul',
    editionStore: 'Édition Microsoft Store',
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
    enable: 'Activer',
    disable: 'Désactiver',
    enabling: 'Activation…',
    restart: 'Redémarrer',
    restarting: 'Redémarrage…',
    successRestart: (name: string) => `Module « ${name} » relancé.`,
    disabling: 'Désactivation…',
    disabledState: 'Désactivé',
    settings: 'Réglages',
    settingsSection: 'Réglages des fonctions fournies',
    successEnable: (name: string) => `Module « ${name} » activé.`,
    successDisable: (name: string) => `Module « ${name} » désactivé : ses fonctions sont masquées.`,
    uninstallTitle: (name: string) => `Désinstaller « ${name} » ?`,
    uninstallDesc:
      'Le module est retiré du serveur : les menus et pages des fonctions qu’il fournit disparaissent aussitôt. Tu pourras le réinstaller depuis son URL.',
    removeData: 'Supprimer aussi ses données (réglages, base du module)',
    errToggleUnsupported:
      "Ce serveur ne gère pas encore l'activation / désactivation des modules : mets-le à jour pour utiliser ces boutons.",
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
      'Popcornn is a player first: it plays your library (local folders, NAS) with nothing else. Optional features are modules: none is installed by default, add the ones you need with “Add a module”.',
    installedSection: 'Installed modules',
    securitySection: 'Server and security',
    server: 'Connected server',
    edition: 'Edition',
    editionCore: 'Player only',
    editionStore: 'Microsoft Store edition',
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
    enable: 'Enable',
    disable: 'Disable',
    enabling: 'Enabling…',
    restart: 'Restart',
    restarting: 'Restarting…',
    successRestart: (name: string) => `Module “${name}” restarted.`,
    disabling: 'Disabling…',
    disabledState: 'Disabled',
    settings: 'Settings',
    settingsSection: 'Settings of the provided features',
    successEnable: (name: string) => `Module “${name}” enabled.`,
    successDisable: (name: string) => `Module “${name}” disabled: its features are hidden.`,
    uninstallTitle: (name: string) => `Uninstall “${name}”?`,
    uninstallDesc:
      'The module is removed from the server: the menus and pages of the features it provides disappear right away. You can reinstall it from its URL.',
    removeData: 'Also delete its data (settings, module database)',
    errToggleUnsupported: 'This server cannot enable / disable modules yet: update it to use these buttons.',
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
  | { type: 'store' }
  | { type: 'add' }
  | { type: 'data'; id: string }
  | { type: 'process'; id: string }
  | { type: 'trust' }
  | { type: 'server' }
  | { type: 'feature'; key: string }
  | null;

type ModuleRef = { type: 'data' | 'process'; id: string; name: string };

const MODAL_CLASS = 'modules-hub-overlay';

/** Libellés des capacités manquantes (`/settings/modules/?missing=…`). */
const MISSING_LABELS: Record<string, { fr: string; en: string }> = {
  torrent: { fr: 'Téléchargement torrent', en: 'Torrent downloads' },
  indexers: { fr: 'Indexers', en: 'Indexers' },
  requests: { fr: 'Demandes (nécessite Indexers)', en: 'Requests (needs Indexers)' },
  sharing: { fr: 'Partage', en: 'Sharing' },
  ai: { fr: 'IA', en: 'AI' },
  discover: { fr: 'Découverte', en: 'Discover' },
  webos_deployment: { fr: 'Déploiement webOS', en: 'webOS deployment' },
  car_lab: { fr: 'Voiture', en: 'Car' },
  car: { fr: 'Voiture', en: 'Car' },
};

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
  /** Routes enable / disable absentes (404 / 405 reçue) : boutons masqués pour la session. */
  const [toggleUnsupported, setToggleUnsupported] = useState(false);
  /** Désinstallation en attente de confirmation (depuis une tuile). */
  const [pendingUninstall, setPendingUninstall] = useState<ModuleRef | null>(null);
  const [removeData, setRemoveData] = useState(false);

  // Formulaire « module de données »
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [gitRef, setGitRef] = useState('');

  const pm = useProcessModules(ptx, setNotice);
  const stx = storeTx(language);
  // Catalogue relu (cache serveur) à chaque changement de la liste des modules process.
  const store = useModuleCatalog(caps, pm.supported, pm.list);

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

  // Arrivée depuis une page d'un module absent (`?missing=torrent`…) : dire ce qui manque.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const missing = new URLSearchParams(window.location.search).get('missing');
    if (!missing || !/^[a-z0-9_-]{1,40}$/i.test(missing)) return;
    const en = language === 'en';
    const label = MISSING_LABELS[missing]?.[en ? 'en' : 'fr'] ?? missing;
    setNotice({
      kind: 'error',
      text: en
        ? `This page needs the “${label}” module, which is not installed or not active on this server. Install or start it below.`
        : `Cette page nécessite le module « ${label} », non installé ou inactif sur ce serveur. Installez-le ou démarrez-le ci-dessous.`,
    });
  }, []);

  /**
   * Après une action : listes rechargées et capacités invalidées / relues tout de suite (sans
   * attendre le TTL) → menus et pages se mettent à jour. `delayed` : un module « process » annonce
   * ses fonctions une fois démarré → seconde lecture 3 s plus tard.
   */
  const afterChange = async (opts: { delayed?: boolean } = {}) => {
    await Promise.all([refreshList(), pm.supported ? pm.refresh() : Promise.resolve()]);
    await refreshCapabilitiesNow();
    if (opts.delayed) {
      setTimeout(() => {
        if (!alive.current) return;
        void (pm.supported ? pm.refresh() : Promise.resolve());
        void refreshCapabilitiesNow();
      }, 3000);
    }
  };

  const onCatalogInstall = async (m: CatalogModule) => {
    setBusy(`catalog:${m.id}`);
    setNotice(null);
    await installFromCatalog(m, {
      stx,
      errTx: ptx,
      setNotice,
      startJob: pm.startJob,
      afterChange: () => afterChange({ delayed: true }),
    });
    if (alive.current) setBusy(null);
  };

  const refreshAll = async () => {
    setBusy('refresh');
    await Promise.all([refreshList(), pm.supported ? pm.refresh() : Promise.resolve(), store.supported ? store.refresh() : Promise.resolve()]);
    await refreshCapabilitiesNow();
    if (alive.current) setBusy(null);
  };

  const canToggle = supportsModuleToggle(caps) && !toggleUnsupported;

  const onToggle = async (m: ModuleRef, enable: boolean) => {
    if (busy) return;
    setBusy(`toggle:${m.type}:${m.id}`);
    setNotice(null);
    const res = await serverApi.setModuleEnabled(m.id, enable);
    if (!alive.current) return;
    setBusy(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: enable ? tx.successEnable(m.name) : tx.successDisable(m.name) });
      await afterChange({ delayed: m.type === 'process' && enable });
    } else if (isRouteUnsupported(res)) {
      setToggleUnsupported(true);
      setNotice({ kind: 'error', text: tx.errToggleUnsupported });
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  /** Relance d'un module « process » en échec (revérifie signature et binaire). */
  const onRestart = async (m: ModuleRef) => {
    if (busy) return;
    setBusy(`restart:${m.id}`);
    setNotice(null);
    const res = await serverApi.processModuleAction(m.id, 'restart');
    if (!alive.current) return;
    setBusy(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.successRestart(m.name) });
      await afterChange({ delayed: true });
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const askUninstall = (m: ModuleRef) => {
    if (busy) return;
    setNotice(null);
    setRemoveData(false);
    setPendingUninstall(m);
  };

  const onConfirmUninstall = async () => {
    const m = pendingUninstall;
    if (!m || busy) return;
    setBusy(`remove:${m.id}`);
    setNotice(null);
    let res: { success: boolean; error?: string; message?: string };
    if (m.type === 'data') {
      res = await serverApi.uninstallModule(m.id);
    } else {
      // Route générique (serveur récent), sinon route historique des modules « process ».
      res = canToggle ? await serverApi.uninstallModule(m.id, removeData) : { success: false, error: 'NotFound' };
      if (!res.success && isRouteUnsupported(res)) res = await serverApi.uninstallProcessModule(m.id, removeData);
    }
    if (!alive.current) return;
    setBusy(null);
    if (res.success) {
      setPendingUninstall(null);
      setRemoveData(false);
      setConfirmId(null);
      setView(null);
      setNotice({ kind: 'ok', text: tx.successRemove });
      await afterChange();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
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
      : caps.edition === 'store'
        ? tx.editionStore
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
  /**
   * Édition Microsoft Store (build `msstore` ou serveur `catalog_only`) : modules du catalogue
   * signé seulement, pas d'ajout depuis une URL directe.
   */
  const catalogOnly = STORE_MODULES_ENABLED || caps?.modules.catalogOnly === true;
  /** « + » : d'abord le catalogue officiel ; serveur sans catalogue → ajout par URL directement. */
  const openAdd = () => {
    if (store.supported || catalogOnly) {
      void store.reload();
      open({ type: 'store' });
    } else {
      open({ type: 'add' });
    }
  };
  const ctx = catalogTx(language);
  const dataUrlCheck = checkModuleUrl(url, 'data');
  const dataTokenCheck = checkAccessToken(token);
  /** Formulaires d'ajout par URL (module de données / exécutable), partagés par le catalogue et la modale « add ». */
  const urlForms = (
    <div class="grid gap-5 tv:gap-7">
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
                aria-invalid={dataUrlCheck.level === 'error'}
                aria-describedby="data-url-hint"
                onInput={(e) => setUrl((e.currentTarget as HTMLInputElement).value)}
              />
              <FieldHint check={dataUrlCheck} id="data-url-hint" />
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
                  aria-invalid={dataTokenCheck.level === 'error'}
                  aria-describedby="data-token-hint"
                  onInput={(e) => setToken((e.currentTarget as HTMLInputElement).value)}
                />
                <FieldHint check={dataTokenCheck} id="data-token-hint" />
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
                disabled={!!busy || unsupported || dataUrlCheck.level === 'error' || dataTokenCheck.level === 'error'}
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
  );

  const ftx = featureTx(language);
  const features = caps ? visibleServerFeatures(buildServerFeatures(caps, modules, processModules, language)) : [];
  const feature = view?.type === 'feature' ? features.find((f) => f.key === view.key) ?? null : null;

  const dataModule = view?.type === 'data' ? modules?.find((m) => m.id === view.id) ?? null : null;
  const processModule = view?.type === 'process' ? processModules.find((m) => m.id === view.id) ?? null : null;

  /** Liens vers les réglages des fonctions fournies par un module (tuile + fiche). */
  const settingsLinksOf = (m: ModuleRef) => moduleSettingsLinks(features, m.type, m.id);

  /** Boutons rapides d'une tuile de module : réglages, activer / désactiver, désinstaller. */
  const tileActions = (m: ModuleRef, enabled: boolean, failed = false) => {
    const links = settingsLinksOf(m);
    const toggling = busy === `toggle:${m.type}:${m.id}`;
    return (
      <>
        {failed && (
          <button type="button" data-focusable class="hub-tile-action" disabled={!!busy} onClick={() => void onRestart(m)}>
            <Icon name="restart" />
            {busy === `restart:${m.id}` ? tx.restarting : tx.restart}
          </button>
        )}
        {links.length === 1 ? (
          <a href={links[0].href} data-focusable class="hub-tile-action" title={links[0].label}>
            <Icon name="settings" />
            {tx.settings}
          </a>
        ) : links.length > 1 ? (
          <button
            type="button"
            data-focusable
            class="hub-tile-action"
            onClick={() => open(m.type === 'process' ? { type: 'process', id: m.id } : { type: 'data', id: m.id })}
          >
            <Icon name="settings" />
            {tx.settings}
          </button>
        ) : null}
        {canToggle && (
          <button
            type="button"
            data-focusable
            class="hub-tile-action"
            aria-pressed={enabled}
            disabled={!!busy}
            onClick={() => void onToggle(m, !enabled)}
          >
            <Icon name={enabled ? 'stop' : 'play'} />
            {toggling ? (enabled ? tx.disabling : tx.enabling) : enabled ? tx.disable : tx.enable}
          </button>
        )}
        <button
          type="button"
          data-focusable
          class="hub-tile-action hub-tile-action--danger"
          disabled={!!busy}
          onClick={() => askUninstall(m)}
        >
          <Icon name="trash" />
          {tx.remove}
        </button>
      </>
    );
  };

  /** Section « Réglages des fonctions fournies » d'une fiche module. */
  const settingsSection = (m: ModuleRef) => {
    const links = settingsLinksOf(m);
    if (links.length === 0) return null;
    return (
      <div class="grid gap-2">
        <p class="text-xs tv:text-base" style={{ color: C.faint }}>
          {tx.settingsSection}
        </p>
        <div class="flex flex-wrap gap-2">
          {links.map((l) => (
            <a key={l.key} href={l.href} data-focusable class={secondaryBtn} style={secondaryStyle}>
              <Icon name="settings" />
              {l.label}
            </a>
          ))}
        </div>
      </div>
    );
  };

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
        {!view && !pendingUninstall && <NoticeBanner notice={notice} detailsLabel={tx.warnings} />}
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
            {modules.map((m) => {
              const enabled = m.enabled !== false;
              const ref: ModuleRef = { type: 'data', id: m.id, name: m.name };
              return (
                <HubTile
                  key={`data:${m.id}`}
                  title={m.name}
                  icon={DataModuleTileIcon}
                  status={!enabled ? 'disabled' : m.active ? 'connected' : 'limited'}
                  statusLabel={!enabled ? tx.disabledState : m.active ? tx.active : tx.inactive}
                  meta={`${kindLabel(m.kind)} · ${m.version}`}
                  onClick={() => open({ type: 'data', id: m.id })}
                  actions={tileActions(ref, enabled)}
                />
              );
            })}
            {processModules.map((m) => {
              const enabled = m.enabled !== false;
              const name = processModuleName(m, language);
              const ref: ModuleRef = { type: 'process', id: m.id, name };
              const stoppedByAdmin = !enabled && (m.state === 'stopped' || !m.state);
              return (
                <HubTile
                  key={`process:${m.id}`}
                  title={name}
                  icon={ProcessModuleTileIcon}
                  status={stoppedByAdmin ? 'disabled' : processStatus(m.state)}
                  statusLabel={stoppedByAdmin ? tx.disabledState : ptx.states[m.state] ?? m.state}
                  meta={`${ptx.kind} · ${m.version || '—'}`}
                  onClick={() => open({ type: 'process', id: m.id })}
                  actions={tileActions(ref, enabled, m.state === 'failed')}
                />
              );
            })}
            {canAdd && <HubAddTile label={tx.addTitle} onClick={openAdd} />}
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

      {/* Ajouter un module : catalogue de modules (cartes, recherche, filtres) + module particulier par URL */}
      {view?.type === 'store' && (
        <HubModal open animated title={ctx.title} description={stx.intro} onClose={close} size="xl" className={`${MODAL_CLASS} modules-catalog-overlay`}>
          <ModuleCatalogView
            modules={store.catalog?.modules ?? []}
            loading={store.loading}
            error={store.error}
            stx={stx}
            ctx={ctx}
            job={pm.job}
            jobRunning={pm.jobRunning}
            busy={busy}
            onInstall={(m) => void onCatalogInstall(m)}
            onRefresh={() => void store.refresh()}
            notice={<NoticeBanner notice={notice} detailsLabel={tx.warnings} />}
            urlSection={catalogOnly ? undefined : urlForms}
          />
        </HubModal>
      )}

      {/* Ajouter un module par URL (serveur sans catalogue) */}
      {view?.type === 'add' && !catalogOnly && (
        <HubModal open animated title={tx.addTitle} description={tx.addDesc} onClose={close} size="xl" className={MODAL_CLASS}>
          <div class="grid gap-5 tv:gap-7">
            {store.supported && (
              <button
                type="button"
                data-focusable
                class={`${secondaryBtn} justify-self-start`}
                style={secondaryStyle}
                onClick={() => open({ type: 'store' })}
              >
                <Icon name="rollback" />
                {stx.backToCatalog}
              </button>
            )}
            <NoticeBanner notice={notice} detailsLabel={tx.warnings} />
            {urlForms}
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
                [
                  tx.state,
                  dataModule.enabled === false ? (
                    <span style={{ color: C.muted }}>{tx.disabledState}</span>
                  ) : dataModule.active ? (
                    tx.active
                  ) : (
                    <span style={{ color: C.accent }}>{tx.inactive}</span>
                  ),
                ],
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
            {settingsSection({ type: 'data', id: dataModule.id, name: dataModule.name })}
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
                  {canToggle && (
                    <button
                      type="button"
                      data-focusable
                      class={secondaryBtn}
                      style={secondaryStyle}
                      aria-pressed={dataModule.enabled !== false}
                      disabled={!!busy}
                      onClick={() =>
                        void onToggle(
                          { type: 'data', id: dataModule.id, name: dataModule.name },
                          dataModule.enabled === false
                        )
                      }
                    >
                      <Icon name={dataModule.enabled === false ? 'play' : 'stop'} />
                      {busy === `toggle:data:${dataModule.id}`
                        ? dataModule.enabled === false
                          ? tx.enabling
                          : tx.disabling
                        : dataModule.enabled === false
                          ? tx.enable
                          : tx.disable}
                    </button>
                  )}
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
        <HubModal open title={processModuleName(processModule, language)} onClose={close} size="xl" className={MODAL_CLASS}>
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} />
            {settingsSection({ type: 'process', id: processModule.id, name: processModuleName(processModule, language) })}
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
            onAddModule={canAdd ? openAdd : undefined}
          />
        </HubModal>
      )}

      {/* Confirmation de désinstallation (depuis une tuile) */}
      {pendingUninstall && (
        <HubModal
          open
          title={tx.uninstallTitle(pendingUninstall.name)}
          description={tx.uninstallDesc}
          onClose={() => {
            if (busy) return;
            setPendingUninstall(null);
            setRemoveData(false);
          }}
          size="lg"
          className={MODAL_CLASS}
        >
          <div class="grid gap-5 tv:gap-7">
            <NoticeBanner notice={notice} />
            {pendingUninstall.type === 'process' && (
              <label class="flex items-center gap-3 text-sm tv:text-lg cursor-pointer">
                <input
                  type="checkbox"
                  data-focusable
                  class={checkboxClass}
                  checked={removeData}
                  onChange={(e) => setRemoveData((e.currentTarget as HTMLInputElement).checked)}
                />
                <span>{tx.removeData}</span>
              </label>
            )}
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                data-focusable
                class={primaryBtn}
                style={primaryStyle}
                disabled={!!busy}
                onClick={() => void onConfirmUninstall()}
              >
                <Icon name="trash" />
                {busy === `remove:${pendingUninstall.id}` ? tx.removing : tx.confirmRemove}
              </button>
              <button
                type="button"
                data-focusable
                class={secondaryBtn}
                style={secondaryStyle}
                disabled={!!busy}
                onClick={() => {
                  setPendingUninstall(null);
                  setRemoveData(false);
                }}
              >
                {tx.cancel}
              </button>
            </div>
          </div>
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
