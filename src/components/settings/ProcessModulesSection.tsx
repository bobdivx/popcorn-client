import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { useI18n } from '../../lib/i18n/useI18n';
import { loadCapabilities, useServerCapabilities } from '../../lib/capabilities';
import { IS_STORE_BUILD } from '../../lib/distribution';
import { serverApi } from '../../lib/client/server-api';
import {
  isProcessModulesUnsupported,
  type ProcessJobEvent,
  type ProcessLogLine,
  type ProcessModule,
  type ProcessModulesList,
  type ProcessPreview,
  type TrustKeys,
} from '../../lib/client/server-api/modules';

/**
 * Paramètres > Modules > Modules « process » : binaires signés (minisign + sha256) que le serveur
 * télécharge, vérifie, lance et supervise (popcorn-modules docs/RUNTIME.md §8.1).
 *
 * - Masqué si le serveur ne connaît pas ces routes (capabilities sans `modules.process`, ou 404/405).
 * - Absent de la version store (IS_STORE_BUILD) ; routes bloquées aussi par le garde réseau.
 * - Suivi par sondage (pas d'EventSource : pas d'en-tête d'authentification, et plus sûr sur webOS).
 * - Aucune clé de confiance par défaut : l'administrateur n'ajoute que des clés qu'il a vérifiées.
 */
const TEXT = {
  fr: {
    title: 'Modules exécutables',
    intro:
      'Programmes signés que le serveur télécharge, vérifie (signature minisign et empreinte SHA-256), puis lance et surveille. Aucun n’est installé par défaut.',
    devUnsigned:
      'Mode développement actif (POPCORN_MODULES_ALLOW_UNSIGNED) : ce serveur accepte des modules non signés. À désactiver hors développement.',
    platform: 'Plateforme du serveur',
    installTitle: 'Installer un module',
    installHelp:
      'Colle l’URL du dépôt GitHub du module (la dernière release est utilisée) ou l’URL directe de son fichier release.json. La signature est lue à côté (release.json.minisig).',
    releaseUrl: 'URL du module',
    releaseUrlPlaceholder: 'https://github.com/propriétaire/dépôt',
    publicKey: 'Clé publique minisign (facultatif)',
    publicKeyHelp: 'Seulement pour une clé pas encore approuvée, telle que publiée par l’auteur du module (fichier .pub).',
    token: 'Jeton d’accès (facultatif)',
    tokenPlaceholder: 'Dépôt privé uniquement',
    check: 'Vérifier',
    checking: 'Vérification…',
    previewTitle: 'Vérification',
    module: 'Module',
    version: 'Version',
    update: (from: string) => `mise à jour depuis ${from}`,
    size: 'Taille',
    sha256: 'Empreinte SHA-256',
    signature: 'Signature',
    signedTrusted: (label: string) => `signée par une clé de confiance (${label})`,
    signedUnknown: 'signée par une clé inconnue',
    unsigned: 'non signée',
    keyId: 'Identifiant de la clé',
    offeredKey: 'Clé proposée',
    unknownKeyWarn:
      'Cette clé n’est pas dans ta liste de confiance. Compare son identifiant avec celui publié par l’auteur du module avant de continuer.',
    noOfferedKey:
      'Clé inconnue et aucune clé publique fournie : ajoute la clé de l’auteur dans « Clés de confiance » ou colle-la dans le champ ci-dessus.',
    unsignedWarn: 'Module non signé : son origine ne peut pas être vérifiée.',
    acceptKey: 'J’ai vérifié cette clé et je lui fais confiance pour ce module',
    reinstall: 'Réinstaller cette version',
    install: 'Installer',
    installUpdate: 'Mettre à jour',
    cancel: 'Annuler',
    steps: {
      downloading: 'Téléchargement',
      verifying: 'Vérification de l’empreinte',
      installing: 'Installation',
      installed: 'Installé',
      starting: 'Démarrage',
      running: 'En marche',
      rollback: 'Échec : retour à la version précédente',
      done: 'Terminé',
      error: 'Erreur',
    } as Record<string, string>,
    doneInstall: (id: string, v: string) => `Module « ${id} » ${v} installé et démarré.`,
    listTitle: 'Modules installés',
    refresh: 'Actualiser',
    none: 'Aucun module exécutable installé.',
    loading: 'Chargement…',
    states: {
      starting: 'démarrage',
      running: 'en marche',
      degraded: 'dégradé',
      stopped: 'arrêté',
      failed: 'en échec',
    } as Record<string, string>,
    restarts: (n: number) => `${n} redémarrage${n > 1 ? 's' : ''}`,
    lastError: 'Dernière erreur',
    signedBy: 'Clé',
    unsignedModule: 'non signé',
    versions: 'Versions installées',
    start: 'Démarrer',
    stop: 'Arrêter',
    restart: 'Redémarrer',
    checkUpdate: 'Mettre à jour',
    rollbackBtn: 'Version précédente',
    confirmRollback: 'Confirmer le retour',
    uninstall: 'Désinstaller',
    confirmUninstall: 'Confirmer',
    removeData: 'Supprimer aussi ses données',
    logs: 'Journal',
    hideLogs: 'Masquer le journal',
    noLogs: 'Aucune ligne pour le moment.',
    settings: 'Réglages',
    hideSettings: 'Masquer les réglages',
    settingsHelp: 'Réglages du module au format JSON (objet). Ils sont transmis au module.',
    save: 'Enregistrer',
    saved: 'Réglages enregistrés.',
    errJson: 'JSON invalide : indique un objet, par exemple { "clé": "valeur" }.',
    actionDone: {
      start: 'Module démarré.',
      stop: 'Module arrêté.',
      restart: 'Module redémarré.',
      rollback: (v: string) => `Retour à la version ${v}.`,
      uninstall: 'Module désinstallé.',
    },
    trustTitle: 'Clés de confiance',
    trustWarn:
      'Aucune clé n’est fournie par défaut : Popcornn ne fait confiance à personne d’office. N’ajoute que des clés dont tu as vérifié l’origine (publiées par l’auteur du module). Un module signé par une clé de confiance s’exécute sur ton serveur avec ses droits.',
    trustNone: 'Aucune clé de confiance : tout module signé demandera ton approbation.',
    keyLabel: 'Nom',
    keyLabelPlaceholder: 'Auteur ou dépôt',
    keyValue: 'Clé publique minisign',
    keyValuePlaceholder: 'RWQ… (contenu du fichier .pub)',
    addKey: 'Ajouter la clé',
    keyAdded: (id: string) => `Clé ${id} ajoutée.`,
    removeKey: 'Retirer',
    confirmRemoveKey: 'Confirmer le retrait',
    keyRemoved: 'Clé retirée.',
    keyModules: 'Modules liés',
    addedAt: 'Ajoutée le',
    errUrl: 'Indique une URL commençant par https://',
    errKey: 'Colle une clé publique minisign.',
    errForbidden: 'Accès refusé : seul l’administrateur du serveur peut gérer les modules.',
    errGeneric: 'Opération impossible. Réessaie dans quelques instants.',
    errJobLost: 'Suivi de l’opération perdu : actualise la liste.',
  },
  en: {
    title: 'Executable modules',
    intro:
      'Signed programs that the server downloads, verifies (minisign signature and SHA-256 hash), then runs and monitors. None is installed by default.',
    devUnsigned:
      'Development mode on (POPCORN_MODULES_ALLOW_UNSIGNED): this server accepts unsigned modules. Turn it off outside development.',
    platform: 'Server platform',
    installTitle: 'Install a module',
    installHelp:
      'Paste the URL of the module’s GitHub repository (the latest release is used) or the direct URL of its release.json file. The signature is read next to it (release.json.minisig).',
    releaseUrl: 'Module URL',
    releaseUrlPlaceholder: 'https://github.com/owner/repo',
    publicKey: 'Minisign public key (optional)',
    publicKeyHelp: 'Only for a key not approved yet, as published by the module author (.pub file).',
    token: 'Access token (optional)',
    tokenPlaceholder: 'Private repository only',
    check: 'Check',
    checking: 'Checking…',
    previewTitle: 'Verification',
    module: 'Module',
    version: 'Version',
    update: (from: string) => `update from ${from}`,
    size: 'Size',
    sha256: 'SHA-256 hash',
    signature: 'Signature',
    signedTrusted: (label: string) => `signed by a trusted key (${label})`,
    signedUnknown: 'signed by an unknown key',
    unsigned: 'unsigned',
    keyId: 'Key ID',
    offeredKey: 'Offered key',
    unknownKeyWarn:
      'This key is not in your trust list. Compare its ID with the one published by the module author before going on.',
    noOfferedKey:
      'Unknown key and no public key given: add the author’s key under “Trusted keys” or paste it in the field above.',
    unsignedWarn: 'Unsigned module: its origin cannot be verified.',
    acceptKey: 'I checked this key and trust it for this module',
    reinstall: 'Reinstall this version',
    install: 'Install',
    installUpdate: 'Update',
    cancel: 'Cancel',
    steps: {
      downloading: 'Downloading',
      verifying: 'Checking hash',
      installing: 'Installing',
      installed: 'Installed',
      starting: 'Starting',
      running: 'Running',
      rollback: 'Failed: back to the previous version',
      done: 'Done',
      error: 'Error',
    } as Record<string, string>,
    doneInstall: (id: string, v: string) => `Module “${id}” ${v} installed and started.`,
    listTitle: 'Installed modules',
    refresh: 'Refresh',
    none: 'No executable module installed.',
    loading: 'Loading…',
    states: {
      starting: 'starting',
      running: 'running',
      degraded: 'degraded',
      stopped: 'stopped',
      failed: 'failed',
    } as Record<string, string>,
    restarts: (n: number) => `${n} restart${n > 1 ? 's' : ''}`,
    lastError: 'Last error',
    signedBy: 'Key',
    unsignedModule: 'unsigned',
    versions: 'Installed versions',
    start: 'Start',
    stop: 'Stop',
    restart: 'Restart',
    checkUpdate: 'Update',
    rollbackBtn: 'Previous version',
    confirmRollback: 'Confirm rollback',
    uninstall: 'Uninstall',
    confirmUninstall: 'Confirm',
    removeData: 'Also delete its data',
    logs: 'Log',
    hideLogs: 'Hide log',
    noLogs: 'No lines yet.',
    settings: 'Settings',
    hideSettings: 'Hide settings',
    settingsHelp: 'Module settings as JSON (object). They are passed to the module.',
    save: 'Save',
    saved: 'Settings saved.',
    errJson: 'Invalid JSON: enter an object, e.g. { "key": "value" }.',
    actionDone: {
      start: 'Module started.',
      stop: 'Module stopped.',
      restart: 'Module restarted.',
      rollback: (v: string) => `Back to version ${v}.`,
      uninstall: 'Module uninstalled.',
    },
    trustTitle: 'Trusted keys',
    trustWarn:
      'No key is provided by default: Popcornn trusts nobody out of the box. Only add keys whose origin you checked (published by the module author). A module signed by a trusted key runs on your server with its permissions.',
    trustNone: 'No trusted key: every signed module will ask for your approval.',
    keyLabel: 'Name',
    keyLabelPlaceholder: 'Author or repository',
    keyValue: 'Minisign public key',
    keyValuePlaceholder: 'RWQ… (content of the .pub file)',
    addKey: 'Add key',
    keyAdded: (id: string) => `Key ${id} added.`,
    removeKey: 'Remove',
    confirmRemoveKey: 'Confirm removal',
    keyRemoved: 'Key removed.',
    keyModules: 'Bound modules',
    addedAt: 'Added on',
    errUrl: 'Enter a URL starting with https://',
    errKey: 'Paste a minisign public key.',
    errForbidden: 'Access denied: only the server administrator can manage modules.',
    errGeneric: 'Operation failed. Please try again shortly.',
    errJobLost: 'Lost track of the operation: refresh the list.',
  },
};

type Tx = (typeof TEXT)['fr'];

const C = {
  accent: 'var(--ed-accent, #f2545b)',
  bg: 'var(--ed-bg, #0c0d10)',
  ink: 'var(--ed-ink, #f4f1ec)',
  display: "var(--ed-font-display, 'Josefin Sans', 'Jost', sans-serif)",
  body: "var(--ed-font-body, 'Jost', sans-serif)",
  muted: 'rgba(244, 241, 236, 0.6)',
  faint: 'rgba(244, 241, 236, 0.45)',
};

const headingStyle: JSX.CSSProperties = {
  fontFamily: C.display,
  fontWeight: 300,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: C.ink,
};
const subHeadingStyle: JSX.CSSProperties = { ...headingStyle, letterSpacing: '0.06em' };

const cardClass = 'rounded-2xl border border-white/10 p-5 tv:p-7';
const cardStyle: JSX.CSSProperties = { backgroundColor: 'rgba(244, 241, 236, 0.03)' };
const focusRing = 'focus:outline-none focus-visible:ring-4 focus-visible:ring-[#f2545b]/70 focus:ring-4 focus:ring-[#f2545b]/50';
const inputClass = `w-full min-h-[44px] tv:min-h-[56px] rounded-xl border border-white/15 px-4 tv:px-6 text-sm tv:text-lg ${focusRing}`;
const textareaClass = `w-full rounded-xl border border-white/15 px-4 py-3 tv:px-6 text-sm tv:text-lg font-mono ${focusRing}`;
const inputStyle: JSX.CSSProperties = { backgroundColor: C.bg, color: C.ink, fontFamily: C.body };
const monoStyle: JSX.CSSProperties = { backgroundColor: C.bg, color: C.ink };
const primaryBtn = `inline-flex items-center justify-center gap-2 min-h-[44px] tv:min-h-[56px] px-5 tv:px-8 rounded-full text-sm tv:text-lg font-medium disabled:opacity-50 ${focusRing}`;
const primaryStyle: JSX.CSSProperties = { backgroundColor: C.accent, color: C.ink, fontFamily: C.body };
const secondaryBtn = `inline-flex items-center justify-center gap-2 min-h-[40px] tv:min-h-[52px] px-4 tv:px-6 rounded-full border border-white/20 text-sm tv:text-base disabled:opacity-50 ${focusRing}`;
const secondaryStyle: JSX.CSSProperties = { color: C.ink, fontFamily: C.body, backgroundColor: 'transparent' };
const checkboxClass = `h-5 w-5 tv:h-7 tv:w-7 shrink-0 accent-[#f2545b] ${focusRing}`;

type IconName =
  | 'search'
  | 'download'
  | 'play'
  | 'stop'
  | 'restart'
  | 'rollback'
  | 'trash'
  | 'log'
  | 'settings'
  | 'key'
  | 'warning'
  | 'chip'
  | 'refresh';

function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 1.6,
    'stroke-linecap': 'round' as const,
    'stroke-linejoin': 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="6" />
          <path d="M20 20l-4.5-4.5" />
        </svg>
      );
    case 'download':
      return (
        <svg {...common}>
          <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
        </svg>
      );
    case 'play':
      return (
        <svg {...common}>
          <path d="M8 5l11 7-11 7z" />
        </svg>
      );
    case 'stop':
      return (
        <svg {...common}>
          <rect x="6" y="6" width="12" height="12" rx="1.5" />
        </svg>
      );
    case 'restart':
    case 'refresh':
      return (
        <svg {...common}>
          <path d="M20 11a8 8 0 1 0-2.3 5.7" />
          <path d="M20 5v6h-6" />
        </svg>
      );
    case 'rollback':
      return (
        <svg {...common}>
          <path d="M9 14L4 9l5-5" />
          <path d="M4 9h10a6 6 0 0 1 0 12h-3" />
        </svg>
      );
    case 'trash':
      return (
        <svg {...common}>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12h10l1-12M9 7V4h6v3" />
        </svg>
      );
    case 'log':
      return (
        <svg {...common}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="M8 9h8M8 13h8M8 17h5" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...common}>
          <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
          <circle cx="16" cy="7" r="2" />
          <circle cx="10" cy="17" r="2" />
        </svg>
      );
    case 'key':
      return (
        <svg {...common}>
          <circle cx="8" cy="15" r="4" />
          <path d="M11 12l9-9M16 7l3 3M14 9l2 2" />
        </svg>
      );
    case 'warning':
      return (
        <svg {...common}>
          <path d="M12 4l9 16H3z" />
          <path d="M12 10v4M12 17.5v.01" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="7" y="7" width="10" height="10" rx="1.5" />
          <path d="M10 3v4M14 3v4M10 17v4M14 17v4M3 10h4M3 14h4M17 10h4M17 14h4" />
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

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(iso: string | null | undefined, language: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(ms: number, language: string): string {
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(language === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function describeEvent(ev: ProcessJobEvent, tx: Tx): string {
  const label = tx.steps[ev.step] ?? ev.step;
  if (ev.step === 'downloading' && typeof ev.received === 'number') {
    const total = typeof ev.total === 'number' && ev.total > 0 ? ev.total : null;
    return total
      ? `${label} ${Math.min(100, Math.round((ev.received / total) * 100))} % (${formatSize(ev.received)} / ${formatSize(total)})`
      : `${label} ${formatSize(ev.received)}`;
  }
  if (ev.step === 'error' && ev.error) return `${label} : ${ev.error}`;
  if (ev.step === 'rollback') return `${label}${ev.to ? ` (${ev.to})` : ''}${ev.error ? ` : ${ev.error}` : ''}`;
  if (ev.version) return `${label} (${ev.version})`;
  return label;
}

function stateColor(state: string): string {
  if (state === 'running') return '#7fd1a0';
  if (state === 'failed' || state === 'degraded') return C.accent;
  return C.muted;
}

type Notice = { kind: 'ok' | 'error'; text: string } | null;

interface JobView {
  jobId: string;
  moduleId: string;
  events: ProcessJobEvent[];
  done: boolean;
}

export default function ProcessModulesSection() {
  const { language } = useI18n();
  const tx: Tx = language === 'en' ? (TEXT.en as unknown as Tx) : TEXT.fr;
  const caps = useServerCapabilities();
  // Serveur connu comme plus ancien (capabilities sans `modules.process`) : aucune requête.
  const knownUnsupported = !!caps && caps.modules.processHost === false;

  const [hidden, setHidden] = useState(false);
  const [list, setList] = useState<ProcessModulesList | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [trust, setTrust] = useState<TrustKeys | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [removeData, setRemoveData] = useState(false);

  // Installation
  const [releaseUrl, setReleaseUrl] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [token, setToken] = useState('');
  const [preview, setPreview] = useState<{ id: string; p: ProcessPreview } | null>(null);
  const [acceptKey, setAcceptKey] = useState(false);
  const [reinstall, setReinstall] = useState(false);
  const [job, setJob] = useState<JobView | null>(null);

  // Journal / réglages (un module à la fois)
  const [logsFor, setLogsFor] = useState<string | null>(null);
  const [logs, setLogs] = useState<ProcessLogLine[]>([]);
  const [settingsFor, setSettingsFor] = useState<string | null>(null);
  const [settingsText, setSettingsText] = useState('');
  const [settingsError, setSettingsError] = useState<string | null>(null);

  // Clés
  const [keyLabel, setKeyLabel] = useState('');
  const [keyValue, setKeyValue] = useState('');

  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = async () => {
    const res = await serverApi.listProcessModules();
    if (!alive.current) return;
    if (res.success && res.data) {
      setList({ ...res.data, modules: Array.isArray(res.data.modules) ? res.data.modules : [] });
      setListError(null);
      const keys = await serverApi.listTrustKeys();
      if (!alive.current) return;
      if (keys.success && keys.data) {
        setTrust({
          keys: Array.isArray(keys.data.keys) ? keys.data.keys : [],
          bindings: keys.data.bindings && typeof keys.data.bindings === 'object' ? keys.data.bindings : {},
          allow_unsigned: keys.data.allow_unsigned === true,
        });
      }
    } else if (isProcessModulesUnsupported(res)) {
      setHidden(true);
    } else {
      setList({ modules: [], platform: null, protocol_version: 0, allow_unsigned: false });
      setListError(errorMessage(res, tx));
    }
  };

  useEffect(() => {
    if (IS_STORE_BUILD || knownUnsupported) return;
    void refresh();
  }, [knownUnsupported]);

  // Suivi d'une opération (installation / mise à jour) : sondage toutes les secondes.
  useEffect(() => {
    if (!job || job.done) return;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      const res = await serverApi.getProcessJob(job.jobId);
      if (!alive.current) return;
      if (res.success && res.data) {
        misses = 0;
        const events = Array.isArray(res.data.events) ? res.data.events : [];
        const done = res.data.done === true;
        setJob({ ...job, events, done });
        if (done) {
          const last = events[events.length - 1];
          if (last && last.step === 'done') {
            setNotice({ kind: 'ok', text: tx.doneInstall(job.moduleId, last.version || '') });
          } else {
            setNotice({ kind: 'error', text: last ? describeEvent(last, tx) : tx.errGeneric });
          }
          await refresh();
          await loadCapabilities({ force: true });
          return;
        }
      } else if (++misses >= 5) {
        setJob({ ...job, done: true });
        setNotice({ kind: 'error', text: tx.errJobLost });
        return;
      }
      timer = setTimeout(() => void tick(), 1000);
    };
    timer = setTimeout(() => void tick(), 500);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [job?.jobId, job?.done]);

  // Journal : sondage toutes les 3 secondes tant qu'il est ouvert.
  useEffect(() => {
    if (!logsFor) return;
    let stopped = false;
    const load = async () => {
      const res = await serverApi.getProcessModuleLogs(logsFor, 200);
      if (stopped || !alive.current) return;
      if (res.success && res.data && Array.isArray(res.data.lines)) setLogs(res.data.lines);
    };
    void load();
    const id = setInterval(() => void load(), 3000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [logsFor]);

  if (IS_STORE_BUILD || knownUnsupported || hidden) return null;

  const resetInstall = () => {
    setPreview(null);
    setAcceptKey(false);
    setReinstall(false);
  };

  const onPreview = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    const u = releaseUrl.trim();
    if (!/^https:\/\/\S+$/i.test(u)) {
      setNotice({ kind: 'error', text: tx.errUrl });
      return;
    }
    setBusy('preview');
    setNotice(null);
    resetInstall();
    const res = await serverApi.previewProcessModule({ release_url: u, public_key: publicKey, token });
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data && res.data.preview) {
      setPreview({ id: res.data.preview_id, p: res.data.preview });
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onInstall = async () => {
    if (!preview || busy) return;
    setBusy('install');
    setNotice(null);
    const res = await serverApi.installProcessModule(preview.id, {
      accept_key: acceptKey,
      reinstall,
    });
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data) {
      setJob({ jobId: res.data.job_id, moduleId: res.data.module_id, events: [], done: false });
      resetInstall();
      setReleaseUrl('');
      setPublicKey('');
      setToken('');
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onAction = async (m: ProcessModule, action: 'start' | 'stop' | 'restart' | 'rollback' | 'update') => {
    if (busy) return;
    setBusy(`${action}:${m.id}`);
    setNotice(null);
    setConfirm(null);
    const res = await serverApi.processModuleAction(m.id, action);
    if (!alive.current) return;
    setBusy(null);
    if (!res.success) {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
      return;
    }
    if (action === 'update' && res.data?.job_id) {
      setJob({ jobId: res.data.job_id, moduleId: res.data.module_id || m.id, events: [], done: false });
      return;
    }
    const text =
      action === 'rollback'
        ? tx.actionDone.rollback(res.data?.version || '')
        : action === 'update'
          ? tx.actionDone.restart
          : tx.actionDone[action];
    setNotice({ kind: 'ok', text });
    await refresh();
    await loadCapabilities({ force: true });
  };

  const onUninstall = async (m: ProcessModule) => {
    if (busy) return;
    setBusy(`uninstall:${m.id}`);
    setNotice(null);
    const res = await serverApi.uninstallProcessModule(m.id, removeData);
    if (!alive.current) return;
    setBusy(null);
    setConfirm(null);
    setRemoveData(false);
    if (res.success) {
      if (logsFor === m.id) setLogsFor(null);
      if (settingsFor === m.id) setSettingsFor(null);
      setNotice({ kind: 'ok', text: tx.actionDone.uninstall });
      await refresh();
      await loadCapabilities({ force: true });
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const toggleSettings = async (m: ProcessModule) => {
    if (settingsFor === m.id) {
      setSettingsFor(null);
      return;
    }
    setSettingsError(null);
    setBusy(`settings:${m.id}`);
    const res = await serverApi.getProcessModuleSettings(m.id);
    if (!alive.current) return;
    setBusy(null);
    if (res.success) {
      setSettingsText(JSON.stringify(res.data ?? {}, null, 2));
      setSettingsFor(m.id);
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const saveSettings = async () => {
    if (!settingsFor || busy) return;
    let value: unknown;
    try {
      value = JSON.parse(settingsText || '{}');
    } catch {
      setSettingsError(tx.errJson);
      return;
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      setSettingsError(tx.errJson);
      return;
    }
    setSettingsError(null);
    setBusy(`save:${settingsFor}`);
    const res = await serverApi.putProcessModuleSettings(settingsFor, value as Record<string, unknown>);
    if (!alive.current) return;
    setBusy(null);
    if (res.success) setNotice({ kind: 'ok', text: tx.saved });
    else setSettingsError(errorMessage(res, tx));
  };

  const onAddKey = async (e: Event) => {
    e.preventDefault();
    if (busy) return;
    if (!keyValue.trim()) {
      setNotice({ kind: 'error', text: tx.errKey });
      return;
    }
    setBusy('addkey');
    setNotice(null);
    const res = await serverApi.addTrustKey(keyValue, keyLabel);
    if (!alive.current) return;
    setBusy(null);
    if (res.success && res.data) {
      setNotice({ kind: 'ok', text: tx.keyAdded(res.data.key_id) });
      setKeyLabel('');
      setKeyValue('');
      await refresh();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const onRemoveKey = async (keyId: string) => {
    if (busy) return;
    setBusy(`rmkey:${keyId}`);
    setNotice(null);
    const res = await serverApi.removeTrustKey(keyId);
    if (!alive.current) return;
    setBusy(null);
    setConfirm(null);
    if (res.success) {
      setNotice({ kind: 'ok', text: tx.keyRemoved });
      await refresh();
    } else {
      setNotice({ kind: 'error', text: errorMessage(res, tx) });
    }
  };

  const jobRunning = !!job && !job.done;
  const lastEvent = job && job.events.length ? job.events[job.events.length - 1] : null;
  const dl = job ? [...job.events].reverse().find((ev) => ev.step === 'downloading') : undefined;
  const dlPct =
    dl && typeof dl.received === 'number' && typeof dl.total === 'number' && dl.total > 0
      ? Math.min(100, Math.round((dl.received / dl.total) * 100))
      : null;

  const p = preview?.p;
  const needsKeyApproval = !!p && p.signed && !p.key_trusted;
  const canInstall =
    !!p && !busy && !jobRunning && (!needsKeyApproval || (acceptKey && !!p.offered_public_key));
  const sameVersion = !!p && p.installed_version === p.release.version;

  const modules = list?.modules ?? [];
  const keys = trust?.keys ?? [];
  const bindings = trust?.bindings ?? {};

  const btn = (
    key: string,
    label: string,
    icon: IconName,
    onClick: () => void,
    opts: { primary?: boolean; disabled?: boolean } = {}
  ) => (
    <button
      type="button"
      data-focusable
      class={opts.primary ? primaryBtn : secondaryBtn}
      style={opts.primary ? primaryStyle : secondaryStyle}
      disabled={!!busy || jobRunning || !!opts.disabled}
      onClick={onClick}
      key={key}
    >
      <Icon name={icon} />
      {label}
    </button>
  );

  return (
    <section class={`${cardClass} space-y-6 tv:space-y-8`} style={{ ...cardStyle, fontFamily: C.body, color: C.ink }} aria-labelledby="process-modules-title">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 id="process-modules-title" class="text-lg tv:text-2xl" style={headingStyle}>
            {tx.title}
          </h2>
          <p class="mt-2 text-sm tv:text-lg max-w-2xl" style={{ color: C.muted }}>
            {tx.intro}
          </p>
          {list?.platform && (
            <p class="mt-1 text-xs tv:text-base" style={{ color: C.faint }}>
              {tx.platform} : {list.platform}
            </p>
          )}
        </div>
        {btn('refresh', tx.refresh, 'refresh', () => void refresh())}
      </div>

      {list?.allow_unsigned && (
        <div role="alert" class="flex gap-3 rounded-xl border px-4 py-3 text-sm tv:text-lg" style={{ borderColor: C.accent, backgroundColor: 'rgba(242, 84, 91, 0.1)' }}>
          <span class="shrink-0" style={{ color: C.accent }}>
            <Icon name="warning" />
          </span>
          <p>{tx.devUnsigned}</p>
        </div>
      )}

      {notice && (
        <div
          role={notice.kind === 'error' ? 'alert' : 'status'}
          class="rounded-xl border px-4 py-3 text-sm tv:text-lg break-words"
          style={{
            borderColor: notice.kind === 'error' ? C.accent : 'rgba(244, 241, 236, 0.2)',
            backgroundColor: notice.kind === 'error' ? 'rgba(242, 84, 91, 0.1)' : 'rgba(244, 241, 236, 0.04)',
          }}
        >
          {notice.text}
        </div>
      )}

      {/* Installation */}
      <div>
        <h3 class="text-base tv:text-xl" style={subHeadingStyle}>
          {tx.installTitle}
        </h3>
        <p class="mt-2 text-sm tv:text-lg max-w-2xl" style={{ color: C.muted }}>
          {tx.installHelp}
        </p>
        <form class="mt-4 grid gap-4 tv:gap-6" onSubmit={onPreview} autoComplete="off">
          <label class="grid gap-1.5">
            <span class="text-sm tv:text-lg">{tx.releaseUrl}</span>
            <input
              type="url"
              inputMode="url"
              data-focusable
              required
              class={inputClass}
              style={inputStyle}
              placeholder={tx.releaseUrlPlaceholder}
              value={releaseUrl}
              autoComplete="off"
              autoCapitalize="none"
              spellcheck={false}
              onInput={(e) => setReleaseUrl((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <div class="grid gap-4 sm:grid-cols-2">
            <label class="grid gap-1.5">
              <span class="text-sm tv:text-lg">{tx.publicKey}</span>
              <input
                type="text"
                data-focusable
                class={`${inputClass} font-mono`}
                style={monoStyle}
                placeholder={tx.keyValuePlaceholder}
                value={publicKey}
                autoComplete="off"
                autoCapitalize="none"
                spellcheck={false}
                onInput={(e) => setPublicKey((e.currentTarget as HTMLInputElement).value)}
              />
              <span class="text-xs tv:text-base" style={{ color: C.faint }}>
                {tx.publicKeyHelp}
              </span>
            </label>
            <label class="grid gap-1.5 content-start">
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
          </div>
          <div>
            <button type="submit" data-focusable class={primaryBtn} style={primaryStyle} disabled={!!busy || jobRunning}>
              <Icon name="search" />
              {busy === 'preview' ? tx.checking : tx.check}
            </button>
          </div>
        </form>

        {p && preview && (
          <div class="mt-5 rounded-xl border border-white/15 p-4 tv:p-6" aria-labelledby="process-preview-title">
            <h4 id="process-preview-title" class="text-sm tv:text-lg" style={subHeadingStyle}>
              {tx.previewTitle}
            </h4>
            <dl class="mt-3 grid grid-cols-[auto,1fr] gap-x-6 gap-y-2 text-sm tv:text-lg">
              <dt style={{ color: C.faint }}>{tx.module}</dt>
              <dd class="break-all">{p.release.id}</dd>
              <dt style={{ color: C.faint }}>{tx.version}</dt>
              <dd>
                {p.release.version}
                {p.is_update && p.installed_version ? ` · ${tx.update(p.installed_version)}` : ''}
              </dd>
              <dt style={{ color: C.faint }}>{tx.size}</dt>
              <dd>
                {formatSize(p.artifact.size)} · {p.platform}
              </dd>
              <dt style={{ color: C.faint }}>{tx.sha256}</dt>
              <dd class="font-mono text-xs tv:text-base break-all">{p.artifact.sha256}</dd>
              <dt style={{ color: C.faint }}>{tx.signature}</dt>
              <dd style={{ color: p.signed && p.key_trusted ? C.ink : C.accent }}>
                {!p.signed ? tx.unsigned : p.key_trusted ? tx.signedTrusted(p.key_label || p.key_id || '') : tx.signedUnknown}
              </dd>
              {p.key_id && (
                <>
                  <dt style={{ color: C.faint }}>{tx.keyId}</dt>
                  <dd class="font-mono break-all">{p.key_id}</dd>
                </>
              )}
              {needsKeyApproval && p.offered_public_key && (
                <>
                  <dt style={{ color: C.faint }}>{tx.offeredKey}</dt>
                  <dd class="font-mono text-xs tv:text-base break-all">{p.offered_public_key}</dd>
                </>
              )}
            </dl>

            {!p.signed && (
              <p role="alert" class="mt-4 flex gap-2 text-sm tv:text-lg" style={{ color: C.accent }}>
                <Icon name="warning" />
                <span>{tx.unsignedWarn}</span>
              </p>
            )}
            {needsKeyApproval && (
              <div class="mt-4 grid gap-3">
                <p role="alert" class="flex gap-2 text-sm tv:text-lg" style={{ color: C.accent }}>
                  <Icon name="warning" />
                  <span>{p.offered_public_key ? tx.unknownKeyWarn : tx.noOfferedKey}</span>
                </p>
                {p.offered_public_key && (
                  <label class="flex items-start gap-3 text-sm tv:text-lg cursor-pointer">
                    <input
                      type="checkbox"
                      data-focusable
                      class={checkboxClass}
                      checked={acceptKey}
                      onChange={(e) => setAcceptKey((e.currentTarget as HTMLInputElement).checked)}
                    />
                    <span>{tx.acceptKey}</span>
                  </label>
                )}
              </div>
            )}
            {sameVersion && (
              <label class="mt-4 flex items-start gap-3 text-sm tv:text-lg cursor-pointer">
                <input
                  type="checkbox"
                  data-focusable
                  class={checkboxClass}
                  checked={reinstall}
                  onChange={(e) => setReinstall((e.currentTarget as HTMLInputElement).checked)}
                />
                <span>{tx.reinstall}</span>
              </label>
            )}
            <div class="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                data-focusable
                class={primaryBtn}
                style={primaryStyle}
                disabled={!canInstall || (sameVersion && !reinstall)}
                onClick={() => void onInstall()}
              >
                <Icon name="download" />
                {p.is_update ? tx.installUpdate : tx.install}
              </button>
              <button type="button" data-focusable class={secondaryBtn} style={secondaryStyle} disabled={!!busy} onClick={resetInstall}>
                {tx.cancel}
              </button>
            </div>
          </div>
        )}

        {job && (
          <div class="mt-5 rounded-xl border border-white/15 p-4 tv:p-6" role="status" aria-live="polite">
            <p class="text-sm tv:text-lg">
              <span style={{ color: C.faint }}>{job.moduleId} · </span>
              {lastEvent ? describeEvent(lastEvent, tx) : `${tx.steps.downloading}…`}
            </p>
            {dlPct !== null && (
              <div class="mt-3 h-2 tv:h-3 w-full rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(244, 241, 236, 0.1)' }}>
                <div class="h-full" style={{ width: `${dlPct}%`, backgroundColor: C.accent }} />
              </div>
            )}
            {job.events.length > 1 && (
              <ol class="mt-3 grid gap-1 text-xs tv:text-base" style={{ color: C.faint }}>
                {job.events
                  .filter((ev, i, arr) => ev.step !== 'downloading' || i === arr.length - 1 || arr[i + 1].step !== 'downloading')
                  .map((ev, i) => (
                    <li key={i}>{describeEvent(ev, tx)}</li>
                  ))}
              </ol>
            )}
          </div>
        )}
      </div>

      {/* Liste */}
      <div>
        <h3 class="text-base tv:text-xl" style={subHeadingStyle}>
          {tx.listTitle}
        </h3>
        {listError && (
          <p role="alert" class="mt-3 text-sm tv:text-lg" style={{ color: C.accent }}>
            {listError}
          </p>
        )}
        {list === null ? (
          <p class="mt-3 text-sm tv:text-lg" style={{ color: C.muted }}>
            {tx.loading}
          </p>
        ) : modules.length === 0 ? (
          !listError && (
            <p class="mt-3 text-sm tv:text-lg" style={{ color: C.muted }}>
              {tx.none}
            </p>
          )
        ) : (
          <ul class="mt-3 divide-y divide-white/10">
            {modules.map((m) => {
              const running = m.state === 'running' || m.state === 'starting' || m.state === 'degraded';
              const previous = m.installed_versions.filter((v) => v !== m.version);
              const keyLabelOf = m.signed_by ? keys.find((k) => k.key_id === m.signed_by)?.label || m.signed_by : null;
              return (
                <li key={m.id} class="py-4 grid gap-3">
                  <div class="flex gap-3 min-w-0">
                    <span class="mt-0.5 shrink-0" style={{ color: C.accent }}>
                      <Icon name="chip" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-base tv:text-xl break-all">
                        <span>{m.id}</span>
                        <span class="ml-2 text-sm tv:text-lg" style={{ color: C.faint }}>
                          {m.version || '—'}
                        </span>
                      </p>
                      <p class="mt-0.5 text-xs tv:text-base flex flex-wrap gap-x-2" style={{ color: C.faint }}>
                        <span style={{ color: stateColor(m.state) }}>{tx.states[m.state] ?? m.state}</span>
                        {m.restarts > 0 && <span>· {tx.restarts(m.restarts)}</span>}
                        <span>
                          · {tx.signedBy} : {keyLabelOf ?? tx.unsignedModule}
                        </span>
                        {m.installed_at && <span>· {formatDate(m.installed_at, language)}</span>}
                        {m.provides.length > 0 && <span>· {m.provides.join(', ')}</span>}
                      </p>
                      {m.installed_versions.length > 1 && (
                        <p class="mt-0.5 text-xs tv:text-base" style={{ color: C.faint }}>
                          {tx.versions} : {m.installed_versions.join(', ')}
                        </p>
                      )}
                      {m.last_error && (
                        <p class="mt-1 text-xs tv:text-base break-words" style={{ color: C.accent }}>
                          {tx.lastError} : {m.last_error}
                        </p>
                      )}
                    </div>
                  </div>

                  <div class="flex flex-wrap gap-2">
                    {confirm === `uninstall:${m.id}` ? (
                      <>
                        <label class="flex items-center gap-2 text-sm tv:text-lg mr-2 cursor-pointer">
                          <input
                            type="checkbox"
                            data-focusable
                            class={checkboxClass}
                            checked={removeData}
                            onChange={(e) => setRemoveData((e.currentTarget as HTMLInputElement).checked)}
                          />
                          <span>{tx.removeData}</span>
                        </label>
                        {btn('confirm-uninstall', tx.confirmUninstall, 'trash', () => void onUninstall(m), { primary: true })}
                        {btn('cancel-uninstall', tx.cancel, 'rollback', () => setConfirm(null))}
                      </>
                    ) : confirm === `rollback:${m.id}` ? (
                      <>
                        {btn('confirm-rollback', `${tx.confirmRollback} (${previous[previous.length - 1] || ''})`, 'rollback', () => void onAction(m, 'rollback'), { primary: true })}
                        {btn('cancel-rollback', tx.cancel, 'rollback', () => setConfirm(null))}
                      </>
                    ) : (
                      <>
                        {running
                          ? btn('stop', tx.stop, 'stop', () => void onAction(m, 'stop'))
                          : btn('start', tx.start, 'play', () => void onAction(m, 'start'), { primary: true })}
                        {running && btn('restart', tx.restart, 'restart', () => void onAction(m, 'restart'))}
                        {btn('update', tx.checkUpdate, 'download', () => void onAction(m, 'update'))}
                        {previous.length > 0 && btn('rollback', tx.rollbackBtn, 'rollback', () => setConfirm(`rollback:${m.id}`))}
                        {btn('logs', logsFor === m.id ? tx.hideLogs : tx.logs, 'log', () => {
                          setLogs([]);
                          setLogsFor(logsFor === m.id ? null : m.id);
                        })}
                        {btn('settings', settingsFor === m.id ? tx.hideSettings : tx.settings, 'settings', () => void toggleSettings(m))}
                        {btn('uninstall', tx.uninstall, 'trash', () => {
                          setRemoveData(false);
                          setConfirm(`uninstall:${m.id}`);
                        })}
                      </>
                    )}
                  </div>

                  {logsFor === m.id && (
                    <pre
                      class="max-h-80 tv:max-h-[28rem] overflow-auto rounded-xl border border-white/10 p-3 text-xs tv:text-base whitespace-pre-wrap break-words"
                      style={monoStyle}
                      tabIndex={0}
                      data-focusable
                      aria-label={tx.logs}
                    >
                      {logs.length === 0
                        ? tx.noLogs
                        : logs.map((l, i) => (
                            <div key={i} style={{ color: l.stream === 'stderr' ? C.accent : C.ink }}>
                              <span style={{ color: C.faint }}>{formatTime(l.ts, language)} </span>
                              {l.line}
                            </div>
                          ))}
                    </pre>
                  )}

                  {settingsFor === m.id && (
                    <div class="grid gap-3">
                      <p class="text-xs tv:text-base" style={{ color: C.faint }}>
                        {tx.settingsHelp}
                      </p>
                      <textarea
                        data-focusable
                        rows={8}
                        class={textareaClass}
                        style={monoStyle}
                        value={settingsText}
                        spellcheck={false}
                        aria-label={tx.settings}
                        onInput={(e) => setSettingsText((e.currentTarget as HTMLTextAreaElement).value)}
                      />
                      {settingsError && (
                        <p role="alert" class="text-sm tv:text-lg" style={{ color: C.accent }}>
                          {settingsError}
                        </p>
                      )}
                      <div>{btn('save', tx.save, 'settings', () => void saveSettings(), { primary: true })}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Clés de confiance */}
      <div>
        <h3 class="text-base tv:text-xl" style={subHeadingStyle}>
          {tx.trustTitle}
        </h3>
        <div class="mt-3 flex gap-3 rounded-xl border px-4 py-3 text-sm tv:text-lg" style={{ borderColor: C.accent, backgroundColor: 'rgba(242, 84, 91, 0.08)' }}>
          <span class="shrink-0" style={{ color: C.accent }}>
            <Icon name="warning" />
          </span>
          <p>{tx.trustWarn}</p>
        </div>

        {trust && keys.length === 0 && (
          <p class="mt-3 text-sm tv:text-lg" style={{ color: C.muted }}>
            {tx.trustNone}
          </p>
        )}
        {keys.length > 0 && (
          <ul class="mt-3 divide-y divide-white/10">
            {keys.map((k) => {
              const bound = Object.keys(bindings).filter((mid) => bindings[mid] === k.key_id);
              return (
                <li key={k.key_id} class="py-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div class="flex gap-3 min-w-0">
                    <span class="mt-0.5 shrink-0" style={{ color: C.accent }}>
                      <Icon name="key" />
                    </span>
                    <div class="min-w-0">
                      <p class="text-base tv:text-xl break-words">{k.label || k.key_id}</p>
                      <p class="mt-0.5 text-xs tv:text-base font-mono break-all" style={{ color: C.faint }}>
                        {k.key_id}
                      </p>
                      <p class="mt-0.5 text-xs tv:text-base" style={{ color: C.faint }}>
                        {k.added_at ? `${tx.addedAt} ${formatDate(k.added_at, language)} · ` : ''}
                        {tx.keyModules} : {bound.length ? bound.join(', ') : '—'}
                      </p>
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 shrink-0">
                    {confirm === `key:${k.key_id}` ? (
                      <>
                        {btn('confirm-key', tx.confirmRemoveKey, 'trash', () => void onRemoveKey(k.key_id), { primary: true })}
                        {btn('cancel-key', tx.cancel, 'rollback', () => setConfirm(null))}
                      </>
                    ) : (
                      btn('remove-key', tx.removeKey, 'trash', () => setConfirm(`key:${k.key_id}`))
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <form class="mt-4 grid gap-4 sm:grid-cols-[1fr,2fr] sm:items-end" onSubmit={onAddKey} autoComplete="off">
          <label class="grid gap-1.5">
            <span class="text-sm tv:text-lg">{tx.keyLabel}</span>
            <input
              type="text"
              data-focusable
              class={inputClass}
              style={inputStyle}
              placeholder={tx.keyLabelPlaceholder}
              value={keyLabel}
              maxLength={80}
              onInput={(e) => setKeyLabel((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <label class="grid gap-1.5">
            <span class="text-sm tv:text-lg">{tx.keyValue}</span>
            <input
              type="text"
              data-focusable
              class={`${inputClass} font-mono`}
              style={monoStyle}
              placeholder={tx.keyValuePlaceholder}
              value={keyValue}
              autoCapitalize="none"
              spellcheck={false}
              onInput={(e) => setKeyValue((e.currentTarget as HTMLInputElement).value)}
            />
          </label>
          <div class="sm:col-span-2">
            <button type="submit" data-focusable class={secondaryBtn} style={secondaryStyle} disabled={!!busy || jobRunning}>
              <Icon name="key" />
              {tx.addKey}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
